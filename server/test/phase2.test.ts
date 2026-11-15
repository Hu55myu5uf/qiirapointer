import { describe, it, expect } from 'vitest';
import { api, bearer, seedUser, fakeDb } from './helpers';
import { storedFiles } from './fakes/instances';

// Minimal valid file headers for content sniffing
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]).toString('base64');
const PDF = Buffer.from('%PDF-1.4\n' + 'x'.repeat(64)).toString('base64');
const HTML = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');

async function approvedVendor(uid: string, extra: Record<string, any> = {}) {
    await seedUser(uid, 'vendor', { businessName: `${uid} Store`, ...extra });
    await fakeDb.collection('vendors').doc(uid).set({ verificationStatus: 'approved', ...extra }, { merge: true });
}

describe('uploads (Firebase Storage)', () => {
    it('detects the real file type and rejects disguised files', async () => {
        await seedUser('alice');
        const fake = await api().post('/api/vendors/upload-image').set('Authorization', bearer('alice'))
            .send({ imageType: 'profile', imageData: `data:image/jpeg;base64,${HTML}` });
        expect(fake.status).toBe(415);

        const ok = await api().post('/api/vendors/upload-image').set('Authorization', bearer('alice'))
            .send({ imageType: 'profile', imageData: `data:image/png;base64,${JPEG}` });
        expect(ok.status).toBe(200);
        expect(ok.body.imageUrl).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/.+\/o\/public%2Fvendors%2Falice%2Fprofile_.+\.jpg\?alt=media&token=/);
        const [path, file] = [...storedFiles.entries()][0];
        expect(path.startsWith('public/vendors/alice/')).toBe(true);
        expect(file.contentType).toBe('image/jpeg'); // what it IS, not what the client claimed
    });

    it('identity documents are private: no public URL, only a private reference', async () => {
        await seedUser('alice');
        const res = await api().post('/api/vendors/upload-document').set('Authorization', bearer('alice'))
            .send({ fileData: PDF, fileName: 'nin.pdf', purpose: 'kyc' });
        expect(res.status).toBe(200);
        expect(res.body.fileUrl).toMatch(/^private:private\/kyc\/alice\/nin_.+\.pdf$/);
        expect(res.body.isPrivate).toBe(true);
        const stored = [...storedFiles.values()][0];
        expect(stored.metadata.metadata.firebaseStorageDownloadTokens).toBeUndefined();
    });

    it('cannot upload into someone else\'s folder', async () => {
        await seedUser('alice'); await seedUser('eve');
        const res = await api().post('/api/vendors/upload-image').set('Authorization', bearer('eve'))
            .send({ userId: 'alice', imageType: 'profile', imageData: JPEG });
        expect(res.status).toBe(403);
    });
});

describe('vendor listing has no invented data', () => {
    it('lists only approved vendors, with real ratings and no fake locations', async () => {
        await approvedVendor('v1');
        await seedUser('v2', 'vendor'); await fakeDb.collection('vendors').doc('v2').set({ verificationStatus: 'pending' }, { merge: true });
        await seedUser('v3', 'vendor'); await fakeDb.collection('vendors').doc('v3').set({ verificationStatus: undefined as any }, { merge: true });

        const res = await api().get('/api/vendors');
        expect(res.status).toBe(200);
        expect(res.body.vendors.map((v: any) => v.id)).toEqual(['v1']);
        const v = res.body.vendors[0];
        expect(v.averageRating).toBe(0);
        expect(v.totalReviews).toBe(0);
        expect(v.location).toBeNull();
        expect(v.userInfo.email).toBeUndefined();
    });

    it('unapproved stores are hidden from the public but visible to their owner', async () => {
        await seedUser('v2', 'vendor', { verificationStatus: 'pending' });
        expect((await api().get('/api/vendors/v2')).status).toBe(404);
        expect((await api().get('/api/vendors/v2').set('Authorization', bearer('v2'))).status).toBe(200);
    });

    it('sorts by distance when the user shares a location', async () => {
        await approvedVendor('near', { location: { latitude: 6.45, longitude: 3.39 } });
        await approvedVendor('far', { location: { latitude: 9.07, longitude: 7.49 } });
        await approvedVendor('nowhere');
        const res = await api().get('/api/vendors').query({ latitude: 6.44, longitude: 3.38 });
        expect(res.body.vendors.map((v: any) => v.id)).toEqual(['near', 'far', 'nowhere']);
        expect(res.body.vendors[0].distanceMeters).toBeLessThan(5000);
        const radius = await api().get('/api/vendors').query({ latitude: 6.44, longitude: 3.38, radius: 10000 });
        expect(radius.body.vendors.map((v: any) => v.id)).toEqual(['near']);
    });
});

describe('reviews', () => {
    it('one review per client per vendor; resubmitting updates it; average stays correct', async () => {
        await approvedVendor('ven'); await seedUser('alice'); await seedUser('bob');
        const post = (uid: string, rating: number) => api().post(`/api/clients/${uid}/reviews`)
            .set('Authorization', bearer(uid)).send({ vendorId: 'ven', rating, comment: 'ok' });

        expect((await post('alice', 5)).status).toBe(201);
        expect((await post('bob', 3)).status).toBe(201);
        expect((await post('alice', 1)).status).toBe(200); // update, not a second review

        const reviews = await api().get('/api/vendors/ven/reviews');
        expect(reviews.body.reviews).toHaveLength(2);
        const vendor = fakeDb.raw('vendors/ven');
        expect(vendor.totalReviews).toBe(2);
        expect(vendor.averageRating).toBe(2); // (1 + 3) / 2
    });

    it('rejects self-reviews and invalid ratings', async () => {
        await approvedVendor('ven'); await seedUser('alice');
        expect((await api().post('/api/clients/ven/reviews').set('Authorization', bearer('ven')).send({ vendorId: 'ven', rating: 5 })).status).toBe(400);
        for (const rating of [0, 6, 4.5, 'abc']) {
            const r = await api().post('/api/clients/alice/reviews').set('Authorization', bearer('alice')).send({ vendorId: 'ven', rating });
            expect(r.status).toBe(400);
        }
    });

    it('deleting a review corrects the vendor rating', async () => {
        await approvedVendor('ven'); await seedUser('alice'); await seedUser('bob');
        await api().post('/api/clients/alice/reviews').set('Authorization', bearer('alice')).send({ vendorId: 'ven', rating: 5 });
        await api().post('/api/clients/bob/reviews').set('Authorization', bearer('bob')).send({ vendorId: 'ven', rating: 1 });
        expect((await api().delete('/api/clients/bob/reviews/ven').set('Authorization', bearer('bob'))).status).toBe(200);
        const vendor = fakeDb.raw('vendors/ven');
        expect(vendor.totalReviews).toBe(1);
        expect(vendor.averageRating).toBe(5);
    });
});

describe('favourites', () => {
    it('add, list, duplicate and remove', async () => {
        await approvedVendor('ven'); await seedUser('alice');
        const auth = bearer('alice');
        expect((await api().post('/api/clients/alice/favorites').set('Authorization', auth).send({ vendorId: 'ven' })).status).toBe(201);
        expect((await api().post('/api/clients/alice/favorites').set('Authorization', auth).send({ vendorId: 'ven' })).status).toBe(400);
        const list = await api().get('/api/clients/alice/favorites').set('Authorization', auth);
        expect(list.body.favorites.map((v: any) => v.id)).toEqual(['ven']);
        expect((await api().delete('/api/clients/alice/favorites/ven').set('Authorization', auth)).status).toBe(200);
        expect((await api().get('/api/clients/alice/favorites').set('Authorization', auth)).body.favorites).toEqual([]);
    });
});

describe('free identity verification (Option C)', () => {
    async function uploadKyc(uid: string) {
        const r = await api().post('/api/vendors/upload-document').set('Authorization', bearer(uid))
            .send({ fileData: PDF, fileName: 'id.pdf', purpose: 'kyc' });
        return r.body.fileUrl as string;
    }

    it('badge is free and the old purchase endpoint is retired', async () => {
        await seedUser('ven', 'vendor');
        expect((await api().get('/api/vendors/badge/info')).body.badge.price).toBe(0);
        expect((await api().post('/api/vendors/ven/badge/purchase').set('Authorization', bearer('ven'))).status).toBe(410);
    });

    it('requesting the badge never unlists an approved store; admin sees a short-lived link', async () => {
        await approvedVendor('ven'); await seedUser('boss', 'admin');
        const ref = await uploadKyc('ven');
        const submit = await api().post('/api/vendors/ven/submit-verification').set('Authorization', bearer('ven'))
            .send({ documentType: 'NIN', documentUrl: ref });
        expect(submit.status).toBe(200);
        expect(fakeDb.raw('vendors/ven').verificationStatus).toBe('approved'); // still listed

        const pending = await api().get('/api/admin/vendors/pending').set('Authorization', bearer('boss'));
        const item = pending.body.vendors.find((v: any) => v.id === 'ven');
        expect(item.verificationDocument.documentUrl).toMatch(/^https:\/\/signed\.example\/private\/kyc\/ven\//);

        expect((await api().put('/api/admin/vendors/ven/verify').set('Authorization', bearer('boss')).send({ status: 'approved' })).status).toBe(200);
        const badge = await api().get('/api/vendors/ven/badge');
        expect(badge.body.isVerified).toBe(true);
    });

    it('cannot submit someone else\'s document', async () => {
        await approvedVendor('ven'); await seedUser('eve');
        const evesDoc = await uploadKyc('eve');
        const res = await api().post('/api/vendors/ven/submit-verification').set('Authorization', bearer('ven')).send({ documentUrl: evesDoc });
        expect(res.status).toBe(400);
    });
});

describe('admin protections', () => {
    it('admins cannot suspend or delete themselves or the root admin', async () => {
        await seedUser('boss', 'admin'); await seedUser('v8MwaOet0ISfZAWXIDAPAGcg1td2', 'admin');
        expect((await api().put('/api/admin/users/boss/suspend').set('Authorization', bearer('boss')).send({ suspended: true })).status).toBe(403);
        expect((await api().delete('/api/admin/users/v8MwaOet0ISfZAWXIDAPAGcg1td2').set('Authorization', bearer('boss'))).status).toBe(403);
    });

    it('suspension takes effect immediately', async () => {
        await seedUser('boss', 'admin'); await seedUser('alice');
        expect((await api().get('/api/cart/alice').set('Authorization', bearer('alice'))).status).toBe(200);
        await api().put('/api/admin/users/alice/suspend').set('Authorization', bearer('boss')).send({ suspended: true });
        expect((await api().get('/api/cart/alice').set('Authorization', bearer('alice'))).status).toBe(403);
    });
});

describe('account deletion removes everything', () => {
    it('deletes profile, store, posts, comments, reviews, chats, favourites and files', async () => {
        await approvedVendor('ven'); await approvedVendor('other'); await seedUser('alice');
        const A = bearer('ven');

        // ven: a post (with alice's comment), a comment on another post, a review of "other", a chat, a favourite, a file
        const post = (await api().post('/api/posts').set('Authorization', A).send({ caption: 'mine', mediaUrl: `data:image/jpeg;base64,${JPEG}` })).body.post;
        await api().post(`/api/posts/${post.id}/comments`).set('Authorization', bearer('alice')).send({ text: 'nice' });
        const otherPost = (await api().post('/api/posts').set('Authorization', bearer('other')).send({ caption: 'theirs', mediaUrl: 'https://x.test/a.jpg' })).body.post;
        await api().post(`/api/posts/${otherPost.id}/comments`).set('Authorization', A).send({ text: 'from ven' });
        await api().post('/api/clients/ven/reviews').set('Authorization', A).send({ vendorId: 'other', rating: 4 });
        await api().post('/api/clients/alice/reviews').set('Authorization', bearer('alice')).send({ vendorId: 'ven', rating: 5 });
        await api().post('/api/chats/messages').set('Authorization', A).send({ receiverId: 'alice', text: 'hi' });
        await api().post('/api/clients/alice/favorites').set('Authorization', bearer('alice')).send({ vendorId: 'ven' });
        expect(storedFiles.size).toBe(1);

        const res = await api().delete('/api/auth/delete-account').set('Authorization', A);
        expect(res.status).toBe(200);

        // Nothing may still reference "ven": not by path segment, not in any stored field
        const leftovers = [...fakeDb.store.entries()]
            .filter(([k, v]) => !k.startsWith('reports/') &&
                (k.split('/').some(seg => seg === 'ven' || seg.split('_').includes('ven')) || JSON.stringify(v).includes('"ven"')))
            .map(([k]) => k);
        expect(leftovers).toEqual([]);
        expect(fakeDb.raw(`posts/${otherPost.id}`).commentsCount).toBe(0);
        expect(fakeDb.raw('vendors/other').totalReviews).toBe(0);   // their review no longer counts
        expect(storedFiles.size).toBe(0);
        expect((await api().get('/api/clients/alice/favorites').set('Authorization', bearer('alice'))).body.favorites).toEqual([]);
    });
});

describe('comments moderation', () => {
    it('authors, post owners and admins can delete a comment; others cannot', async () => {
        await approvedVendor('ven'); await seedUser('alice'); await seedUser('eve'); await seedUser('boss', 'admin');
        const post = (await api().post('/api/posts').set('Authorization', bearer('ven')).send({ caption: 'x', mediaUrl: 'https://x.test/a.jpg' })).body.post;
        const add = async () => (await api().post(`/api/posts/${post.id}/comments`).set('Authorization', bearer('alice')).send({ text: 'hi' })).body.comment.id;

        const c1 = await add();
        expect((await api().delete(`/api/posts/${post.id}/comments/${c1}`).set('Authorization', bearer('eve'))).status).toBe(403);
        expect((await api().delete(`/api/posts/${post.id}/comments/${c1}`).set('Authorization', bearer('alice'))).status).toBe(200);
        const c2 = await add();
        expect((await api().delete(`/api/posts/${post.id}/comments/${c2}`).set('Authorization', bearer('ven'))).status).toBe(200);
        const c3 = await add();
        expect((await api().delete(`/api/posts/${post.id}/comments/${c3}`).set('Authorization', bearer('boss'))).status).toBe(200);
        expect(fakeDb.raw(`posts/${post.id}`).commentsCount).toBe(0);
    });

    it('admins can remove a reported comment', async () => {
        await approvedVendor('ven'); await seedUser('alice'); await seedUser('boss', 'admin');
        const post = (await api().post('/api/posts').set('Authorization', bearer('ven')).send({ caption: 'x', mediaUrl: 'https://x.test/a.jpg' })).body.post;
        const comment = (await api().post(`/api/posts/${post.id}/comments`).set('Authorization', bearer('alice')).send({ text: 'spam' })).body.comment;
        const report = await api().post('/api/moderation/report').set('Authorization', bearer('ven'))
            .send({ targetType: 'comment', targetId: comment.id, targetUserId: 'alice', reason: 'Spam, scam, or misleading information' });
        const resolve = await api().put(`/api/moderation/reports/${report.body.reportId}/resolve`).set('Authorization', bearer('boss')).send({ action: 'remove_content' });
        expect(resolve.status).toBe(200);
        expect((await api().get(`/api/posts/${post.id}/comments`)).body.comments).toEqual([]);
    });
});

describe('posts whose media was lost', () => {
    it('are hidden from feeds; text-only community posts still show', async () => {
        await approvedVendor('ven'); await seedUser('alice');
        const now = Date.now();
        await fakeDb.collection('posts').doc('dead').set({ id: 'dead', vendorId: 'ven', authorId: 'ven', type: 'reel', mediaUrls: ['https://qiirapointer.onrender.com/uploads/x.mp4'], createdAt: new Date(now - 3000).toISOString() });
        await fakeDb.collection('posts').doc('ok').set({ id: 'ok', vendorId: 'ven', authorId: 'ven', type: 'post', mediaUrls: ['https://x.test/a.jpg'], createdAt: new Date(now - 2000).toISOString() });
        await fakeDb.collection('posts').doc('talk').set({ id: 'talk', vendorId: 'alice', authorId: 'alice', authorType: 'client', type: 'community', caption: 'hi', mediaUrls: [], createdAt: new Date(now - 1000).toISOString() });

        const feed = await api().get('/api/posts/feed');
        expect(feed.body.posts.map((p: any) => p.id)).toEqual(['talk', 'ok']);
        expect((await api().get('/api/posts/showcase')).body.showcase).toEqual([]);
        expect((await api().get('/api/posts/vendor/ven')).body.posts.map((p: any) => p.id)).toEqual(['ok']);
    });
});

describe('app start-up profile load', () => {
    it('tells a suspended user they are suspended (instead of returning a public profile)', async () => {
        await seedUser('bad', 'client', { isSuspended: true });
        const res = await api().get('/api/auth/user/bad').set('Authorization', bearer('bad'));
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('Account Suspended');
        // others still just see the public profile
        expect((await api().get('/api/auth/user/bad')).status).toBe(200);
    });
});

describe('calls stored in Firestore', () => {
    it('survive a server restart, and hanging up before an answer is a missed call', async () => {
        const { __resetCallState } = await import('../src/routes/call.routes');
        await seedUser('alice'); await seedUser('bob');
        const callId = (await api().post('/api/calls/initiate').set('Authorization', bearer('alice')).send({ receiverId: 'bob' })).body.call.id;
        expect(fakeDb.raw(`calls/${callId}`).status).toBe('ringing');

        __resetCallState(); // simulate a restart: in-memory state is gone
        const incoming = await api().get('/api/calls/incoming/bob').set('Authorization', bearer('bob'));
        expect(incoming.body.incomingCall.id).toBe(callId);

        const end = await api().post(`/api/calls/${callId}/end`).set('Authorization', bearer('alice'));
        expect(end.body.call.status).toBe('missed');
        expect((await api().get('/api/calls/incoming/bob').set('Authorization', bearer('bob'))).body.incomingCall).toBeNull();
    });
});

describe('set shop location', () => {
    it('puts the store on the map and in distance search', async () => {
        await approvedVendor('ven');
        expect((await api().get('/api/vendors/ven')).body.vendor.location).toBeNull();
        const res = await api().put('/api/vendors/ven/location').set('Authorization', bearer('ven'))
            .send({ useLiveLocation: false, businessLatitude: 12.0022, businessLongitude: 8.592 });
        expect(res.status).toBe(200);
        expect((await api().get('/api/vendors/ven')).body.vendor.location).toEqual({ latitude: 12.0022, longitude: 8.592 });
        const near = await api().get('/api/vendors').query({ latitude: 12.0, longitude: 8.59, radius: 2000 });
        expect(near.body.vendors.map((v: any) => v.id)).toEqual(['ven']);
        // garbage coordinates are rejected
        expect((await api().put('/api/vendors/ven/location').set('Authorization', bearer('ven'))
            .send({ useLiveLocation: false, businessLatitude: 999, businessLongitude: 8 })).status).toBe(400);
    });
});
