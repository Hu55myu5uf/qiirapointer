import { describe, it, expect, beforeEach } from 'vitest';
import { api, bearer, seedUser, fakeDb } from './helpers';
import { __resetCallState } from '../src/routes/call.routes';
import { createNotification } from '../src/utils/notifications';

beforeEach(() => __resetCallState());

const list = async (uid: string) => (await api().get('/api/notifications').set('Authorization', bearer(uid))).body;
const unread = async (uid: string) => (await api().get('/api/notifications/unread-count').set('Authorization', bearer(uid))).body.count;

describe('notifications', () => {
    it('requires sign-in', async () => {
        expect((await api().get('/api/notifications')).status).toBe(401);
        expect((await api().post('/api/notifications/read')).status).toBe(401);
    });

    it('a missed call is recorded once for the person who was called', async () => {
        await seedUser('alice'); await seedUser('bob');
        const callId = (await api().post('/api/calls/initiate').set('Authorization', bearer('alice')).send({ receiverId: 'bob', callType: 'voice' })).body.call.id;
        await api().post(`/api/calls/${callId}/end`).set('Authorization', bearer('alice'));
        await api().post(`/api/calls/${callId}/end`).set('Authorization', bearer('alice')); // repeated: still one

        const bob = await list('bob');
        expect(bob.notifications).toHaveLength(1);
        expect(bob.notifications[0]).toMatchObject({ type: 'missed_call', read: false, actorId: 'alice' });
        expect(bob.notifications[0].data.otherUserId).toBe('alice');
        expect((await list('alice')).notifications).toHaveLength(0);
    });

    it('a new review notifies the vendor', async () => {
        await seedUser('shop', 'vendor', { businessName: 'Shop' });
        await fakeDb.collection('vendors').doc('shop').set({ verificationStatus: 'approved' }, { merge: true });
        await seedUser('carol');
        await api().post('/api/clients/carol/reviews').set('Authorization', bearer('carol')).send({ vendorId: 'shop', rating: 4, comment: 'Great work' });
        const n = (await list('shop')).notifications;
        expect(n).toHaveLength(1);
        expect(n[0]).toMatchObject({ type: 'review', title: 'New 4-star review', actorId: 'carol' });
        expect(n[0].body).toContain('Great work');
    });

    it('a verification decision is recorded, with the reason only for that user', async () => {
        await seedUser('shop', 'vendor');
        await fakeDb.collection('vendors').doc('shop').set({ verificationStatus: 'approved', verificationRequest: 'pending' }, { merge: true });
        await seedUser('boss', 'admin');
        await api().put('/api/admin/vendors/shop/verify').set('Authorization', bearer('boss')).send({ status: 'rejected', rejectionReason: 'Photo is blurry' });
        const n = (await list('shop')).notifications;
        expect(n[0]).toMatchObject({ type: 'verification_rejected' });
        expect(n[0].body).toContain('Photo is blurry');
        expect((await list('boss')).notifications).toHaveLength(0);
    });

    it('lists newest first in pages, counts unread, and marks read (only your own)', async () => {
        await seedUser('dave'); await seedUser('eve');
        for (let i = 0; i < 35; i++) {
            await createNotification('dave', { type: 'system', title: `n${i}`, body: 'b' });
            await new Promise(r => setTimeout(r, 1));
        }
        const eveId = await createNotification('eve', { type: 'system', title: 'eve only', body: 'b' });

        const first = await list('dave');
        expect(first.notifications).toHaveLength(30);
        expect(first.notifications[0].title).toBe('n34');
        const second = (await api().get('/api/notifications').query({ before: first.nextBefore }).set('Authorization', bearer('dave'))).body;
        expect(second.notifications).toHaveLength(5);
        expect(second.nextBefore).toBeNull();
        expect(await unread('dave')).toBe(35);

        // Dave can't mark Eve's notification read (ids are looked up in his own list only)
        await api().post('/api/notifications/read').set('Authorization', bearer('dave')).send({ ids: [eveId, first.notifications[0].id] });
        expect(await unread('eve')).toBe(1);
        expect(await unread('dave')).toBe(34);

        await api().post('/api/notifications/read').set('Authorization', bearer('dave')).send({});
        expect(await unread('dave')).toBe(0);
        // no stray documents created for unknown ids
        expect((await fakeDb.collection('users').doc('dave').collection('notifications').get()).docs).toHaveLength(35);
    });

    it('deleting an account removes its notifications', async () => {
        await seedUser('frank');
        await createNotification('frank', { type: 'system', title: 't', body: 'b' });
        await api().delete('/api/auth/delete-account').set('Authorization', bearer('frank'));
        const left = await fakeDb.collection('users').doc('frank').collection('notifications').get();
        expect(left.docs).toHaveLength(0);
    });
});
