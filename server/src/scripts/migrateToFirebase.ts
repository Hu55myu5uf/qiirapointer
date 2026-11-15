/**
 * One-time migration to the Firebase-only data model.
 *
 *   Preview (default, writes nothing):  npx ts-node src/scripts/migrateToFirebase.ts
 *   Apply:                              npx ts-node src/scripts/migrateToFirebase.ts --apply
 *
 * Reads Supabase data from the newest folder in <repo>/backups/ (run backupAll.ts first) and the
 * live Firestore. Safe to run more than once: every step checks before writing.
 */
import * as fs from 'fs';
import * as path from 'path';
import { db, FieldValue } from '../config/firebase';
import { decodeUpload, saveUpload } from '../utils/fileStorage';
import { validLatLng } from '../utils/vendors';
import { SUPPORT_UID } from '../utils/authMiddleware';

const APPLY = process.argv.includes('--apply');
const REPO = path.resolve(__dirname, '../../..');
const LOCAL_UPLOADS = path.resolve(__dirname, '../../uploads');

const log: string[] = [];
const note = (s: string) => { log.push(s); console.log(s); };
const stats: Record<string, number> = {};
const count = (k: string, n = 1) => { stats[k] = (stats[k] || 0) + n; };

function latestBackup(): string {
    const dir = path.join(REPO, 'backups');
    const runs = fs.existsSync(dir) ? fs.readdirSync(dir).filter(d => fs.existsSync(path.join(dir, d, 'manifest.json'))).sort() : [];
    if (!runs.length) throw new Error('No backup found. Run: npx ts-node src/scripts/backupAll.ts');
    return path.join(dir, runs[runs.length - 1]);
}

function readBackup(file: string): any[] {
    const p = path.join(latestBackup(), file);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
}

async function write(ref: FirebaseFirestore.DocumentReference, data: Record<string, any>, merge = true) {
    if (APPLY) await ref.set(data, { merge });
}
async function remove(ref: FirebaseFirestore.DocumentReference) {
    if (APPLY) await ref.delete();
}

// ─── Images ─────────────────────────────────────────────────────────────────
const imageCache = new Map<string, string>();

/**
 * Returns a working https URL for an old image value, uploading it to Firebase Storage if needed,
 * or '' when the image is gone (dead server-disk links, local IPs).
 */
async function migrateImage(value: unknown, ownerUid: string, label: string): Promise<string> {
    if (typeof value !== 'string' || !value) return '';
    if (imageCache.has(value)) return imageCache.get(value)!;
    let result = '';

    if (/^https:\/\/(firebasestorage\.googleapis\.com|images\.unsplash\.com)\//i.test(value)) {
        result = value;
    } else if (value.startsWith('data:')) {
        try {
            const file = decodeUpload(value, ['image', 'video']);
            result = APPLY ? (await saveUpload({ folder: ['vendors', ownerUid], namePrefix: label, file, visibility: 'public' })).url : '(would upload inline image)';
            count('images uploaded (inline)');
        } catch { count('images unusable (inline)'); }
    } else if (value.includes('/uploads/')) {
        const rel = value.slice(value.indexOf('/uploads/') + '/uploads/'.length).split('?')[0];
        const local = path.join(LOCAL_UPLOADS, rel);
        if (local.startsWith(LOCAL_UPLOADS) && fs.existsSync(local)) {
            try {
                const file = decodeUpload(fs.readFileSync(local).toString('base64'), ['image', 'video']);
                result = APPLY ? (await saveUpload({ folder: ['vendors', ownerUid], namePrefix: label, file, visibility: 'public' })).url : '(would upload surviving file)';
                count('images uploaded (surviving server files)');
            } catch { count('images unusable (server files)'); }
        } else {
            count('dead image links cleared');
        }
    } else if (/^https:\/\//i.test(value)) {
        result = value; // other external https images are kept as-is
    } else {
        count('dead image links cleared');
    }
    imageCache.set(value, result);
    return result;
}

// ─── 1. Users ───────────────────────────────────────────────────────────────
const USER_DEAD_FIELDS = [
    'full_name', 'profile_image', 'phone_number', 'is_verified', 'is_suspended', 'push_token', 'push_token_updated_at',
    'verification_status', 'verificationStatus', 'verification_document', 'badgeSubscribedAt', 'badgeExpiresAt',
    'lastBadgePayment', 'paymentReference', 'updated_at', 'displayName', 'photoURL',
    'menuDocuments', 'catalogItems', 'useLiveLocation', 'liveLocation', 'businessName', 'category', 'aboutUs', 'bio',
];

async function migrateUsers() {
    note('\n— Users');
    const snap = await db.collection('users').get();
    for (const doc of snap.docs) {
        if (doc.id === SUPPORT_UID) continue; // managed by seedSupport.ts
        const u = doc.data();
        const update: Record<string, any> = {};
        const set = (k: string, v: any) => { if (v !== undefined && u[k] !== v) update[k] = v; };

        set('fullName', (u.fullName || u.full_name || u.displayName || 'User').toString().slice(0, 100));
        set('profileImage', await migrateImage(u.profileImage || u.profile_image || u.photoURL, doc.id, 'profile'));
        set('phoneNumber', u.phoneNumber || u.phone_number || null);
        set('isVerified', Boolean(u.isVerified ?? u.is_verified ?? false));
        set('isSuspended', Boolean(u.isSuspended ?? u.is_suspended ?? false));
        if (!u.role) set('role', 'client');

        // A client's pending badge request carries over as a verification request
        if (u.role !== 'vendor' && (u.verificationStatus === 'pending' || u.verification_status === 'pending') && !u.isVerified) {
            set('verificationRequest', 'pending');
            const docRef = u.verificationDocument || u.verification_document;
            if (docRef && !u.verificationDocument) set('verificationDocument', docRef);
        }

        // Vendor data that was duplicated onto the user doc belongs on the vendor doc
        if (u.role === 'vendor') {
            const vRef = db.collection('vendors').doc(doc.id);
            const v = (await vRef.get()).data() || {};
            const carry: Record<string, any> = {};
            if (!v.menuDocuments?.length && u.menuDocuments?.length) carry.menuDocuments = u.menuDocuments;
            if (!v.catalogItems?.length && u.catalogItems?.length) carry.catalogItems = u.catalogItems;
            if (v.useLiveLocation === undefined && u.useLiveLocation !== undefined) carry.useLiveLocation = u.useLiveLocation;
            if (!v.liveLocation && u.liveLocation) carry.liveLocation = u.liveLocation;
            if (Object.keys(carry).length) { await write(vRef, carry); count('vendor fields moved off user docs'); }
        }

        for (const f of USER_DEAD_FIELDS) if (f in u) update[f] = FieldValue.delete();
        if ('verificationDocument' in u && u.role !== 'vendor' && !update.verificationRequest && !u.verificationRequest) {
            // old badge-payment document on a client with no pending request: drop it
            update.verificationDocument = FieldValue.delete();
        }

        if (Object.keys(update).length) {
            await write(doc.ref, update);
            count('users normalised');
        }
    }
}

// ─── 2. Vendors ─────────────────────────────────────────────────────────────
const VENDOR_DEAD_FIELDS = [
    'business_name', 'business_image', 'banner_image', 'business_hours', 'about_us', 'aboutUs', 'bio',
    'verification_status', 'verification_document', 'is_verified', 'is_active', 'isActive', 'updated_at',
    'paymentStatus', 'payment_status', 'documents', 'badgeSubscribedAt', 'badgeExpiresAt', 'lastBadgePayment', 'id',
];

async function migrateVendors(sbVendors: Map<string, any>) {
    note('\n— Vendors');
    const snap = await db.collection('vendors').get();
    for (const doc of snap.docs) {
        const v = doc.data();
        const sb = sbVendors.get(doc.id) || {};
        const update: Record<string, any> = {};
        const set = (k: string, val: any) => { if (val !== undefined && JSON.stringify(v[k]) !== JSON.stringify(val)) update[k] = val; };

        set('businessName', (v.businessName || v.business_name || sb.business_name || 'Vendor').toString().slice(0, 100));
        set('category', v.category || sb.category || '');
        set('description', v.description || v.aboutUs || v.about_us || v.bio || sb.description || '');
        set('address', v.address || sb.address || '');
        set('services', Array.isArray(v.services) ? v.services : (v.services || sb.services ? String(v.services || sb.services).split(',').map((s: string) => s.trim()).filter(Boolean) : []));
        set('businessHours', v.businessHours || v.business_hours || sb.business_hours || null);
        set('businessImage', await migrateImage(v.businessImage || v.business_image || sb.business_image, doc.id, 'profile'));
        set('bannerImage', await migrateImage(v.bannerImage || v.banner_image || sb.banner_image, doc.id, 'banner'));
        set('isVerified', Boolean(v.isVerified ?? v.is_verified ?? false));
        set('location', validLatLng(v.location) || validLatLng(sb.location) || null);

        const status = v.verificationStatus || v.verification_status || sb.verification_status;
        if (status && ['pending', 'approved', 'rejected'].includes(status)) set('verificationStatus', status);

        // A submitted identity document on an approved but unverified store = pending badge request
        const vdoc = v.verificationDocument || v.verification_document;
        if (vdoc && !v.verificationDocument) set('verificationDocument', vdoc);
        if (vdoc && status === 'approved' && !(v.isVerified ?? v.is_verified) && !v.verificationRequest) set('verificationRequest', 'pending');

        for (const f of VENDOR_DEAD_FIELDS) if (f in v) update[f] = FieldValue.delete();
        if (Object.keys(update).length) {
            await write(doc.ref, update);
            count('vendors normalised');
        }
    }
}

// ─── 3. Reviews ─────────────────────────────────────────────────────────────
async function migrateReviews() {
    note('\n— Reviews');
    const latestPerPair = new Map<string, any>();
    for (const r of readBackup('supabase/reviews.json')) {
        const key = `${r.vendor_id}_${r.client_id}`;
        const prev = latestPerPair.get(key);
        if (!prev || String(r.created_at) > String(prev.created_at)) latestPerPair.set(key, r);
    }
    for (const [id, r] of latestPerPair) {
        const rating = Math.round(Number(r.rating));
        if (!r.vendor_id || !r.client_id || r.vendor_id === r.client_id || !(rating >= 1 && rating <= 5)) { count('reviews skipped (invalid)'); continue; }
        const ref = db.collection('reviews').doc(id);
        if ((await ref.get()).exists) { count('reviews already present'); continue; }
        await write(ref, {
            vendorId: r.vendor_id, clientId: r.client_id, rating,
            comment: String(r.comment || '').slice(0, 1000),
            createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.created_at).toISOString(),
        }, false);
        count('reviews migrated');
    }
}

async function recomputeRatings() {
    note('\n— Ratings (recalculated from real reviews)');
    const reviews = APPLY
        ? (await db.collection('reviews').get()).docs.map(d => d.data())
        : [...(await db.collection('reviews').get()).docs.map(d => d.data()),
           ...readBackup('supabase/reviews.json').map((r: any) => ({ vendorId: r.vendor_id, rating: r.rating }))];
    const totals = new Map<string, { sum: number; n: number }>();
    for (const r of reviews) {
        const t = totals.get(r.vendorId) || { sum: 0, n: 0 };
        t.sum += Number(r.rating) || 0; t.n++;
        totals.set(r.vendorId, t);
    }
    for (const doc of (await db.collection('vendors').get()).docs) {
        const t = totals.get(doc.id) || { sum: 0, n: 0 };
        const averageRating = t.n ? Math.round((t.sum / t.n) * 100) / 100 : 0;
        const v = doc.data();
        if (v.ratingSum !== t.sum || v.totalReviews !== t.n || v.averageRating !== averageRating) {
            await write(doc.ref, { ratingSum: t.sum, totalReviews: t.n, averageRating });
            note(`  ${doc.id.slice(0, 8)}…: ${t.n} review(s), average ${averageRating}`);
            count('vendor ratings corrected');
        }
    }
}

// ─── 4. Favourites ──────────────────────────────────────────────────────────
async function migrateFavorites(existingUsers: Set<string>, existingVendors: Set<string>) {
    note('\n— Favourites');
    const pairs: { clientId: string; vendorId: string; createdAt: string }[] = [];
    for (const f of readBackup('supabase/favorites.json')) pairs.push({ clientId: f.client_id, vendorId: f.vendor_id, createdAt: f.created_at });
    const legacy = await db.collection('favorites').get();
    for (const d of legacy.docs) {
        const f = d.data();
        pairs.push({ clientId: f.clientId, vendorId: f.vendorId, createdAt: f.createdAt });
    }
    for (const p of pairs) {
        if (!existingUsers.has(p.clientId) || !existingVendors.has(p.vendorId) || p.clientId === p.vendorId) { count('favourites skipped (account gone)'); continue; }
        const ref = db.collection('favorites').doc(`${p.clientId}_${p.vendorId}`);
        if ((await ref.get()).exists) continue;
        await write(ref, { clientId: p.clientId, vendorId: p.vendorId, createdAt: new Date(p.createdAt || Date.now()).toISOString() }, false);
        count('favourites migrated');
    }
    // Remove the old random-id copies (the canonical "{client}_{vendor}" docs replace them)
    for (const d of legacy.docs) {
        const f = d.data();
        if (d.id !== `${f.clientId}_${f.vendorId}`) { await remove(d.ref); count('legacy favourite docs removed'); }
    }
}

// ─── 5. Posts & comments ────────────────────────────────────────────────────
async function migratePosts(existingUsers: Set<string>) {
    note('\n— Posts & comments');
    for (const doc of (await db.collection('posts').get()).docs) {
        const p = doc.data();
        const owner = p.authorId || p.vendorId;
        const update: Record<string, any> = {};

        const oldMedia: string[] = (Array.isArray(p.mediaUrls) && p.mediaUrls.length ? p.mediaUrls : [p.mediaUrl]).filter(Boolean);
        const media = (await Promise.all(oldMedia.map((m, i) => migrateImage(m, owner, `post_${i}`)))).filter(Boolean);
        if (JSON.stringify(media) !== JSON.stringify(p.mediaUrls || [])) {
            update.mediaUrls = media;
            update.mediaUrl = media[0] || null;
            update.mediaCount = media.length;
        }
        const thumb = (await migrateImage(p.thumbnailUrl, owner, 'thumb')) || media[0] || null;
        if (thumb !== p.thumbnailUrl) update.thumbnailUrl = thumb;
        if ('vendorImage' in p) update.vendorImage = FieldValue.delete(); // shown live from the profile now
        if (!p.authorId) update.authorId = p.vendorId;
        if (!p.authorType) update.authorType = 'vendor';

        const likedBy: string[] = (p.likedBy || []).filter((u: string) => existingUsers.has(u));
        if (likedBy.length !== (p.likedBy || []).length) update.likedBy = likedBy;
        if (p.likesCount !== likedBy.length) update.likesCount = likedBy.length;

        // Comments: copy sub-collection comments into the top-level collection
        const sub = await doc.ref.collection('comments').get();
        for (const c of sub.docs) {
            const ref = db.collection('comments').doc(c.id);
            if ((await ref.get()).exists) continue;
            const d = c.data();
            await write(ref, { id: c.id, postId: doc.id, userId: d.userId, text: String(d.text || '').slice(0, 1000), createdAt: d.createdAt || new Date().toISOString() }, false);
            count('comments moved to top-level collection');
        }
        const rootComments = APPLY
            ? (await db.collection('comments').where('postId', '==', doc.id).get()).size
            : new Set([...(await db.collection('comments').where('postId', '==', doc.id).get()).docs.map(d => d.id), ...sub.docs.map(d => d.id)]).size;
        if (p.commentsCount !== rootComments) update.commentsCount = rootComments;

        if (Object.keys(update).length) {
            await write(doc.ref, update);
            count('posts updated');
        }
    }
}

async function main() {
    note(`${APPLY ? '⚠️  APPLYING' : '🔍 PREVIEW (no changes will be written)'} — migration to Firebase-only data`);
    note(`Using Supabase backup: ${path.relative(REPO, latestBackup())}`);

    const sbVendors = new Map(readBackup('supabase/vendors.json').map((v: any) => [v.uid, v]));
    const existingUsers = new Set((await db.collection('users').get()).docs.map(d => d.id));
    const existingVendors = new Set((await db.collection('vendors').get()).docs.map(d => d.id));

    await migrateUsers();
    await migrateVendors(sbVendors);
    await migrateReviews();
    await recomputeRatings();
    await migrateFavorites(existingUsers, existingVendors);
    await migratePosts(existingUsers);

    note('\n═══ Summary ═══');
    for (const [k, v] of Object.entries(stats).sort()) note(`  ${k}: ${v}`);
    if (!APPLY) note('\nNothing was written. Re-run with --apply to perform these changes.');

    const outFile = path.join(REPO, 'backups', `migration-${APPLY ? 'applied' : 'preview'}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
    fs.writeFileSync(outFile, log.join('\n'));
    console.log(`\nLog saved to ${path.relative(REPO, outFile)}`);
    process.exit(0);
}

main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
