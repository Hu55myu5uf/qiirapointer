import { describe, it, expect } from 'vitest';
import { api, bearer, seedUser, fakeDb } from './helpers';

async function vendor(uid: string, category = 'Food - Bakery') {
    await seedUser(uid, 'vendor', { businessName: `${uid} Store` });
    await fakeDb.collection('vendors').doc(uid).set({ verificationStatus: 'approved', category, businessName: `${uid} Store` }, { merge: true });
}
const as = (uid: string) => ({ Authorization: bearer(uid) });
const create = (uid: string, body: any = { name: 'Lagos Bakers', description: 'Bakers helping bakers' }) =>
    api().post('/api/communities').set(as(uid)).send(body);
const detail = async (id: string, uid?: string) => {
    const r = api().get(`/api/communities/${id}`);
    return (await (uid ? r.set(as(uid)) : r)).body;
};
const setName = (uid: string, username: string) => api().put('/api/users/me/username').set(as(uid)).send({ username });

describe('communities', () => {
    it('only vendors with a category can create one; it starts unverified with the owner as member', async () => {
        await seedUser('cli');
        expect((await create('cli')).status).toBe(403);
        await seedUser('nocat', 'vendor');
        await fakeDb.collection('vendors').doc('nocat').set({ verificationStatus: 'approved', category: '' }, { merge: true });
        expect((await create('nocat')).status).toBe(400);

        await vendor('baker');
        const res = await create('baker');
        expect(res.status).toBe(201);
        expect(res.body.community).toMatchObject({ category: 'Food', status: 'pending', isVerified: false, memberCount: 1 });
        const d = await detail(res.body.community.id, 'baker');
        expect(d.members.map((m: any) => [m.uid, m.role])).toEqual([['baker', 'owner']]);
        expect(d.viewer.isOwner).toBe(true);
    });

    it('same-category vendors request, the owner approves; other categories and customers cannot join', async () => {
        await vendor('baker'); await vendor('baker2'); await vendor('tailor', 'Fashion - Tailor'); await seedUser('cli');
        const id = (await create('baker')).body.community.id;

        expect((await api().post(`/api/communities/${id}/join`).set(as('tailor'))).status).toBe(403);
        expect((await api().post(`/api/communities/${id}/join`).set(as('cli'))).status).toBe(403);
        expect((await detail(id, 'tailor')).viewer.canJoin).toBe(false);
        expect((await detail(id, 'baker2')).viewer.canJoin).toBe(true);

        expect((await api().post(`/api/communities/${id}/join`).set(as('baker2'))).body.status).toBe('requested');
        const owner = await detail(id, 'baker');
        expect(owner.requests.map((r: any) => r.uid)).toEqual(['baker2']);
        expect((await detail(id)).requests).toEqual([]); // the public doesn't see requests

        // only the owner decides
        expect((await api().post(`/api/communities/${id}/requests/baker2`).set(as('baker2')).send({ approve: true })).status).toBe(403);
        expect((await api().post(`/api/communities/${id}/requests/baker2`).set(as('baker')).send({ approve: true })).status).toBe(200);
        const after = await detail(id, 'baker2');
        expect(after.viewer.isMember).toBe(true);
        expect(after.community.memberCount).toBe(2);
        const mine = (await api().get('/api/communities/mine').set(as('baker2'))).body;
        expect(mine.member.map((c: any) => c.id)).toEqual([id]);
    });

    it('customers can follow and unfollow, but that never makes them members', async () => {
        await vendor('baker'); await seedUser('cli');
        const id = (await create('baker')).body.community.id;
        await api().post(`/api/communities/${id}/follow`).set(as('cli'));
        await api().post(`/api/communities/${id}/follow`).set(as('cli')); // twice: counted once
        let d = await detail(id, 'cli');
        expect(d.viewer).toMatchObject({ isFollowing: true, isMember: false });
        expect(d.community.followerCount).toBe(1);
        expect((await api().get('/api/communities/mine').set(as('cli'))).body.following).toHaveLength(1);
        await api().delete(`/api/communities/${id}/follow`).set(as('cli'));
        d = await detail(id, 'cli');
        expect(d.community.followerCount).toBe(0);
    });

    it('invitations: same category only, accepting joins at once, they expire', async () => {
        await vendor('baker'); await vendor('baker2'); await vendor('tailor', 'Fashion - Tailor');
        await setName('baker2', 'baker.two'); await setName('tailor', 'tailor.one');
        const id = (await create('baker')).body.community.id;
        expect((await api().post(`/api/communities/${id}/invites`).set(as('baker')).send({ username: 'tailor.one' })).status).toBe(400);
        expect((await api().post(`/api/communities/${id}/invites`).set(as('baker2')).send({ username: 'baker.two' })).status).toBe(403);
        expect((await api().post(`/api/communities/${id}/invites`).set(as('baker')).send({ username: '@baker.two' })).status).toBe(200);
        expect((await api().get('/api/communities/mine').set(as('baker2'))).body.invites).toHaveLength(1);
        const notes = (await api().get('/api/notifications').set(as('baker2'))).body.notifications;
        expect(notes[0]).toMatchObject({ type: 'community' });

        expect((await api().post(`/api/communities/${id}/join`).set(as('baker2'))).body.status).toBe('member');

        // an expired invitation only leads to a normal request
        await vendor('baker3'); await setName('baker3', 'baker.three');
        await api().post(`/api/communities/${id}/invites`).set(as('baker')).send({ username: 'baker.three' });
        await fakeDb.collection('communities').doc(id).collection('invites').doc('baker3').set({ expiresAt: new Date(Date.now() - 1000).toISOString() }, { merge: true });
        expect((await api().post(`/api/communities/${id}/join`).set(as('baker3'))).body.status).toBe('requested');
    });

    it('members can leave, the owner can remove them, the owner cannot leave', async () => {
        await vendor('baker'); await vendor('baker2');
        const id = (await create('baker')).body.community.id;
        await api().post(`/api/communities/${id}/join`).set(as('baker2'));
        await api().post(`/api/communities/${id}/requests/baker2`).set(as('baker')).send({ approve: true });
        expect((await api().delete(`/api/communities/${id}/members/me`).set(as('baker'))).status).toBe(400);
        expect((await api().delete(`/api/communities/${id}/members/me`).set(as('baker2'))).status).toBe(200);
        expect((await detail(id)).community.memberCount).toBe(1);
        expect((await api().get('/api/communities/mine').set(as('baker2'))).body.member).toHaveLength(0);
    });

    it('admin verifies or rejects; rejected ones disappear from browsing', async () => {
        await vendor('baker'); await seedUser('boss', 'admin'); await seedUser('cli');
        const id = (await create('baker')).body.community.id;
        expect((await api().put(`/api/communities/${id}/verify`).set(as('baker')).send({ status: 'verified' })).status).toBe(403);
        expect((await api().get('/api/communities/admin/pending').set(as('boss'))).body.communities).toHaveLength(1);
        await api().put(`/api/communities/${id}/verify`).set(as('boss')).send({ status: 'verified' });
        expect((await detail(id)).community.isVerified).toBe(true);

        await api().put(`/api/communities/${id}/verify`).set(as('boss')).send({ status: 'rejected', reason: 'Spam' });
        expect((await api().get('/api/communities')).body.communities).toHaveLength(0);
        expect((await api().get(`/api/communities/${id}`).set(as('cli'))).status).toBe(404);
        const ownerView = await detail(id, 'baker');
        expect(ownerView.rejectionReason).toBe('Spam');
    });

    it('limits: 3 communities per vendor, unique names per category', async () => {
        await vendor('baker');
        expect((await create('baker', { name: 'One Club' })).status).toBe(201);
        expect((await create('baker', { name: 'one club' })).status).toBe(409);
        await create('baker', { name: 'Two Club' }); await create('baker', { name: 'Three Club' });
        expect((await create('baker', { name: 'Four Club' })).status).toBe(400);
    });

    it('deleting an account removes their communities and their memberships elsewhere', async () => {
        await vendor('baker'); await vendor('baker2'); await seedUser('cli');
        const id = (await create('baker')).body.community.id;
        const other = (await create('baker2', { name: 'Second Club' })).body.community.id;
        await api().post(`/api/communities/${other}/join`).set(as('baker'));
        await api().post(`/api/communities/${other}/requests/baker`).set(as('baker2')).send({ approve: true });
        await api().post(`/api/communities/${id}/follow`).set(as('cli'));

        await api().delete('/api/auth/delete-account').set(as('baker'));
        expect((await fakeDb.collection('communities').doc(id).get()).exists).toBe(false);
        expect((await fakeDb.collection('users').doc('cli').collection('community_links').get()).docs).toHaveLength(0);
        const o = await detail(other);
        expect(o.community.memberCount).toBe(1);
        expect(o.members.map((m: any) => m.uid)).toEqual(['baker2']);
    });
});
