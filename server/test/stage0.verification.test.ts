import { describe, it, expect } from 'vitest';
import { api, bearer, seedUser, fakeDb } from './helpers';

/**
 * Listing approval ("can this store appear in listings") and the identity badge
 * ("has this person's ID been checked") are separate and must never be mixed up.
 */

async function vendorDoc(uid: string) {
    return (await fakeDb.collection('vendors').doc(uid).get()).data()!;
}

describe('listing status vs identity badge', () => {
    it("a listed vendor's own profile reports the badge from the vendor record, not the user record", async () => {
        await seedUser('shop', 'vendor', { verificationStatus: 'approved' });
        await fakeDb.collection('vendors').doc('shop').set({ isVerified: true }, { merge: true });

        const res = await api().get('/api/auth/user/shop').set('Authorization', bearer('shop'));
        expect(res.status).toBe(200);
        expect(res.body.user.isVerified).toBe(true);
        expect(res.body.user.badgeStatus).toBe('verified');
        expect(res.body.user.listingStatus).toBe('approved');
        expect(res.body.user.verificationStatus).toBe('approved'); // old field = listing status
    });

    it('a new vendor with no ID submitted has badge "none", not "pending"', async () => {
        await seedUser('fresh', 'vendor', { verificationStatus: 'pending' });
        const res = await api().get('/api/auth/user/fresh').set('Authorization', bearer('fresh'));
        expect(res.body.user.listingStatus).toBe('approved'); // stores are listed automatically
        expect(res.body.user.badgeStatus).toBe('none');
        expect(res.body.user.isVerified).toBe(false);
    });

    it('rejecting an ID keeps the store listed and records the rejection with its reason', async () => {
        await seedUser('shop', 'vendor', { verificationStatus: 'approved' });
        await seedUser('boss', 'admin');
        await fakeDb.collection('vendors').doc('shop').set({ verificationRequest: 'pending' }, { merge: true });

        const res = await api().put('/api/admin/vendors/shop/verify').set('Authorization', bearer('boss'))
            .send({ status: 'rejected', rejectionReason: 'Photo is blurry' });
        expect(res.status).toBe(200);
        expect(res.body.target).toBe('badge');

        const v = await vendorDoc('shop');
        expect(v.verificationStatus).toBe('approved');
        expect(v.isVerified).toBe(false);
        expect(v.verificationRequest).toBe('rejected');

        const own = await api().get('/api/auth/user/shop').set('Authorization', bearer('shop'));
        expect(own.body.user.badgeStatus).toBe('rejected');
        expect(own.body.user.badgeRejectionReason).toBe('Photo is blurry');
    });

    it('rejecting an ID never un-lists a store that is still waiting for listing approval', async () => {
        await seedUser('newshop', 'vendor', { verificationStatus: 'pending' });
        await seedUser('boss', 'admin');
        await fakeDb.collection('vendors').doc('newshop').set({ verificationRequest: 'pending' }, { merge: true });

        await api().put('/api/admin/vendors/newshop/verify').set('Authorization', bearer('boss'))
            .send({ status: 'rejected' });
        expect((await vendorDoc('newshop')).verificationStatus).toBe('pending');
    });

    it('approving a store listing does not hand out the identity badge', async () => {
        await seedUser('newshop', 'vendor', { verificationStatus: 'pending' });
        await seedUser('boss', 'admin');

        const res = await api().put('/api/admin/vendors/newshop/verify').set('Authorization', bearer('boss'))
            .send({ status: 'approved' });
        expect(res.body.target).toBe('listing');
        const v = await vendorDoc('newshop');
        expect(v.verificationStatus).toBe('approved');
        expect(v.isVerified).not.toBe(true);
    });

    it('approving an ID gives the badge and lists a store that was still waiting', async () => {
        await seedUser('newshop', 'vendor', { verificationStatus: 'pending' });
        await seedUser('boss', 'admin');
        await fakeDb.collection('vendors').doc('newshop').set({ verificationRequest: 'pending' }, { merge: true });

        await api().put('/api/admin/vendors/newshop/verify').set('Authorization', bearer('boss'))
            .send({ status: 'approved' });
        const v = await vendorDoc('newshop');
        expect(v.isVerified).toBe(true);
        expect(v.verificationRequest).toBeNull();
        expect(v.verificationStatus).toBe('approved');
    });

    it("the rejection reason is private: other people's view and the public badge endpoint don't include it", async () => {
        await seedUser('shop', 'vendor', { verificationStatus: 'approved' });
        await seedUser('alice');
        await fakeDb.collection('vendors').doc('shop').set({ verificationRequest: 'rejected', rejectionReason: 'Name mismatch' }, { merge: true });

        const other = await api().get('/api/auth/user/shop').set('Authorization', bearer('alice'));
        expect(JSON.stringify(other.body)).not.toContain('Name mismatch');

        const badge = await api().get('/api/vendors/shop/badge');
        expect(badge.body.badgeStatus).toBe('rejected');
        expect(JSON.stringify(badge.body)).not.toContain('Name mismatch');
    });

    it('only admins can make verification decisions', async () => {
        await seedUser('shop', 'vendor');
        await seedUser('eve', 'vendor');
        const res = await api().put('/api/admin/vendors/shop/verify').set('Authorization', bearer('eve'))
            .send({ status: 'approved' });
        expect(res.status).toBe(403);
    });
});
