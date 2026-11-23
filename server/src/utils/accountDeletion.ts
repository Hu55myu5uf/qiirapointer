/**
 * Complete deletion of a user's account and data (Apple 5.1.1(v) / Google Play account-deletion policy).
 *
 * Removes: profile, vendor store, favourites, block list, cart, posts (+ their comments), comments
 * they wrote, reviews they wrote (vendor ratings are corrected) and reviews of their store,
 * conversations they took part in (with all messages), upgrade/advert requests, other users'
 * favourites of their store, uploaded files, and finally the Firebase Auth login.
 * Reports they FILED are kept for moderation but anonymised.
 */
import { auth, db, FieldValue } from '../config/firebase';
import { deleteUserFiles } from './fileStorage';
import { clearProfileCache } from './profiles';
import { invalidateVendorList } from './vendors';

type Ref = FirebaseFirestore.DocumentReference;

async function deleteRefs(refs: Ref[]) {
    for (let i = 0; i < refs.length; i += 400) {
        const batch = db.batch();
        refs.slice(i, i + 400).forEach(r => batch.delete(r));
        await batch.commit();
    }
}

async function refsOf(query: FirebaseFirestore.Query): Promise<Ref[]> {
    const snap = await query.get();
    return snap.docs.map(d => d.ref);
}

async function withSubcollection(parent: Ref, sub: string): Promise<Ref[]> {
    return [...(await refsOf(parent.collection(sub))), parent];
}

export async function deleteAccountData(uid: string): Promise<{ deletedDocuments: number }> {
    const toDelete: Ref[] = [];
    const userRef = db.collection('users').doc(uid);
    // Free their @username
    const username = (await userRef.get()).data()?.username;
    if (typeof username === 'string' && username) {
        const nameRef = db.collection('usernames').doc(username);
        if ((await nameRef.get()).data()?.uid === uid) toDelete.push(nameRef);
    }

    // Profile + private sub-collection, store, cart, their favourites
    toDelete.push(...await refsOf(userRef.collection('blocked_users')));
    // Their own notifications, and the links the people who caused them keep (see utils/notifications)
    for (const n of (await userRef.collection('notifications').get()).docs) {
        toDelete.push(n.ref);
        const actorId = n.data()?.actorId;
        if (typeof actorId === 'string' && actorId && actorId !== uid) {
            toDelete.push(db.collection('users').doc(actorId).collection('notification_links').doc(`${uid}__${n.id}`));
        }
    }
    // Notifications other people received about this user (reviews, missed calls, mentions)
    for (const link of (await userRef.collection('notification_links').get()).docs) {
        const path = link.data()?.path;
        if (typeof path === 'string' && /^users\/[^/]+\/notifications\/[^/]+$/.test(path)) toDelete.push(db.doc(path));
        toDelete.push(link.ref);
    }
    toDelete.push(db.collection('vendors').doc(uid), db.collection('carts').doc(uid));
    toDelete.push(...await refsOf(db.collection('favorites').where('clientId', '==', uid)));

    // Posts they published, with all their comments (incl. legacy sub-collection copies)
    const ownPosts = new Map<string, Ref>();
    for (const field of ['vendorId', 'authorId']) {
        (await db.collection('posts').where(field, '==', uid).get()).docs.forEach(d => ownPosts.set(d.id, d.ref));
    }
    for (const [postId, ref] of ownPosts) {
        toDelete.push(...await withSubcollection(ref, 'comments'));
        toDelete.push(...await refsOf(db.collection('comments').where('postId', '==', postId)));
    }

    // Comments they wrote on other people's posts (those posts' comment counters are corrected)
    const commentCountFixes = new Map<string, { ref: Ref; n: number }>();
    for (const doc of (await db.collection('comments').where('userId', '==', uid).get()).docs) {
        toDelete.push(doc.ref);
        const postId = doc.data().postId;
        if (postId && !ownPosts.has(postId)) {
            const postRef = db.collection('posts').doc(postId);
            toDelete.push(postRef.collection('comments').doc(doc.id)); // legacy copy, if any
            const entry = commentCountFixes.get(postRef.path) || { ref: postRef, n: 0 };
            entry.n++;
            commentCountFixes.set(postRef.path, entry);
        }
    }

    // Reviews about their store
    toDelete.push(...await refsOf(db.collection('reviews').where('vendorId', '==', uid)));

    // Conversations they were part of (both sides' messages go with the conversation)
    for (const doc of (await db.collection('conversations').where('participants', 'array-contains', uid).get()).docs) {
        toDelete.push(...await withSubcollection(doc.ref, 'messages'));
    }

    // Requests they made, and other users' favourites of their store
    toDelete.push(...await refsOf(db.collection('conversion_requests').where('clientId', '==', uid)));
    toDelete.push(...await refsOf(db.collection('advert_requests').where('vendorId', '==', uid)));
    toDelete.push(...await refsOf(db.collection('favorites').where('vendorId', '==', uid)));

    // Reviews they wrote: delete one by one so each vendor's rating is corrected
    const { deleteReview } = await import('../routes/client.routes');
    for (const doc of (await db.collection('reviews').where('clientId', '==', uid).get()).docs) {
        await deleteReview(doc.data().vendorId, uid);
    }

    // Reports they filed: keep for moderation, remove identity
    const reports = await db.collection('reports').where('reporterUid', '==', uid).get();
    for (let i = 0; i < reports.docs.length; i += 400) {
        const batch = db.batch();
        reports.docs.slice(i, i + 400).forEach(d => batch.set(d.ref, { reporterUid: 'deleted-user', reporterEmail: null }, { merge: true }));
        await batch.commit();
    }

    // De-duplicate (a doc can be matched by more than one query), profile last
    const unique = [...new Map(toDelete.map(r => [r.path, r])).values()];
    await deleteRefs(unique);
    await userRef.delete();

    for (const { ref, n } of commentCountFixes.values()) {
        await ref.update({ commentsCount: FieldValue.increment(-n) }).catch(() => {}); // post may be gone
    }

    await deleteUserFiles(uid);

    try {
        await auth.deleteUser(uid);
    } catch (e: any) {
        if (e?.code !== 'auth/user-not-found') throw e;
    }

    clearProfileCache(uid);
    invalidateVendorList();
    return { deletedDocuments: unique.length + 1 };
}
