import { describe, it, expect, beforeEach } from 'vitest';
import { api, bearer, seedUser, fakeDb, fakeAuth } from './helpers';
import { __resetCallState } from '../src/routes/call.routes';

const SUPPORT = 'qiira_official_support';
const convId = (a: string, b: string) => [a, b].sort().join('_');

async function seedConversation(a: string, b: string, text = 'hello') {
    const id = convId(a, b);
    await fakeDb.collection('conversations').doc(id).set({ id, participants: [a, b], lastMessage: text });
    await fakeDb.collection('conversations').doc(id).collection('messages').add({
        senderId: a, receiverId: b, text, createdAt: new Date().toISOString(), mediaUrl: 'https://x.test/p.jpg', mediaType: 'image',
    });
    return id;
}

describe('chat privacy', () => {
    it('messages cannot be read without logging in', async () => {
        await seedUser('alice'); await seedUser('bob');
        const id = await seedConversation('alice', 'bob');
        expect((await api().get(`/api/chats/conversations/${id}/messages`)).status).toBe(401);
    });

    it('only participants can read messages (others get 404)', async () => {
        await seedUser('alice'); await seedUser('bob'); await seedUser('eve');
        const id = await seedConversation('alice', 'bob');
        const asEve = await api().get(`/api/chats/conversations/${id}/messages`).set('Authorization', bearer('eve'));
        expect(asEve.status).toBe(404);
        const asBob = await api().get(`/api/chats/conversations/${id}/messages`).set('Authorization', bearer('bob'));
        expect(asBob.status).toBe(200);
        expect(asBob.body.messages).toHaveLength(1);
        // media is returned (it used to be dropped when Supabase had a text-only copy)
        expect(asBob.body.messages[0].mediaUrl).toBe('https://x.test/p.jpg');
    });

    it('admins can read Support conversations but not private ones', async () => {
        await seedUser('alice'); await seedUser('bob'); await seedUser('boss', 'admin');
        const priv = await seedConversation('alice', 'bob');
        const sup = await seedConversation('alice', SUPPORT);
        expect((await api().get(`/api/chats/conversations/${priv}/messages`).set('Authorization', bearer('boss'))).status).toBe(404);
        expect((await api().get(`/api/chats/conversations/${sup}/messages`).set('Authorization', bearer('boss'))).status).toBe(200);
    });

    it('cannot list someone else\'s inbox', async () => {
        await seedUser('alice'); await seedUser('eve');
        expect((await api().get('/api/chats/conversations/alice').set('Authorization', bearer('eve'))).status).toBe(403);
    });

    it('cannot send a message pretending to be someone else', async () => {
        await seedUser('alice'); await seedUser('bob'); await seedUser('eve');
        const res = await api().post('/api/chats/messages').set('Authorization', bearer('eve'))
            .send({ senderId: 'alice', receiverId: 'bob', text: 'I am alice' });
        expect(res.status).toBe(403);
    });

    it('cannot post into a conversation you are not part of', async () => {
        await seedUser('alice'); await seedUser('bob'); await seedUser('eve');
        const id = await seedConversation('alice', 'bob');
        const res = await api().post('/api/chats/messages').set('Authorization', bearer('eve'))
            .send({ conversationId: id, text: 'sneaky' });
        expect(res.status).toBe(403);
    });

    it('sends as the logged-in user when senderId is omitted', async () => {
        await seedUser('alice'); await seedUser('bob');
        const res = await api().post('/api/chats/messages').set('Authorization', bearer('alice'))
            .send({ receiverId: 'bob', text: 'hi bob', receiverName: 'FAKE NAME' });
        expect(res.status).toBe(201);
        expect(res.body.data.senderId).toBe('alice');
        const conv = fakeDb.raw(`conversations/${convId('alice', 'bob')}`);
        expect(conv.participantNames.bob).not.toBe('FAKE NAME');
    });

    it('only admins may reply as Support', async () => {
        await seedUser('alice'); await seedUser('boss', 'admin');
        await seedConversation('alice', SUPPORT);
        const asAlice = await api().post('/api/chats/messages').set('Authorization', bearer('alice'))
            .send({ senderId: SUPPORT, receiverId: 'alice', text: 'fake support' });
        expect(asAlice.status).toBe(403);
        const asAdmin = await api().post('/api/chats/messages').set('Authorization', bearer('boss'))
            .send({ senderId: SUPPORT, receiverId: 'alice', text: 'How can we help?' });
        expect(asAdmin.status).toBe(201);
    });

    it('rejects oversized messages and non-http media', async () => {
        await seedUser('alice'); await seedUser('bob');
        const long = await api().post('/api/chats/messages').set('Authorization', bearer('alice'))
            .send({ receiverId: 'bob', text: 'x'.repeat(5001) });
        expect(long.status).toBe(400);
        const js = await api().post('/api/chats/messages').set('Authorization', bearer('alice'))
            .send({ receiverId: 'bob', mediaUrl: 'javascript:alert(1)' });
        expect(js.status).toBe(400);
    });
});

describe('profile privacy', () => {
    it('strangers see public fields only (no email); vendor phone stays public', async () => {
        await seedUser('cli', 'client', { phoneNumber: '+2348000000001', pushToken: 'ExponentPushToken[x]' });
        await seedUser('ven', 'vendor', { phoneNumber: '+2348000000002' });

        const client = (await api().get('/api/auth/user/cli')).body.user;
        expect(client.email).toBeUndefined();
        expect(client.phoneNumber).toBeNull();
        expect(client.pushToken).toBeUndefined();

        const vendor = (await api().get('/api/auth/user/ven')).body.user;
        expect(vendor.email).toBeUndefined();
        expect(vendor.phoneNumber).toBe('+2348000000002');
    });

    it('the owner sees their full profile', async () => {
        await seedUser('cli', 'client', { phoneNumber: '+2348000000001' });
        const me = (await api().get('/api/auth/user/cli').set('Authorization', bearer('cli'))).body.user;
        expect(me.email).toBe('cli@example.com');
        expect(me.phoneNumber).toBe('+2348000000001');
    });

    it('stored data cannot override the computed role/admin flags', async () => {
        await seedUser('sneaky', 'client', { isAdmin: true });
        const me = (await api().get('/api/auth/user/sneaky').set('Authorization', bearer('sneaky'))).body.user;
        expect(me.isAdmin).toBe(false);
        expect(me.role).toBe('client');
    });

    it('vendor details do not expose the account email', async () => {
        await seedUser('ven', 'vendor');
        const res = await api().get('/api/vendors/ven');
        expect(res.status).toBe(200);
        expect(res.body.vendor.userInfo.email).toBeUndefined();
    });

    it('favourites are private', async () => {
        await seedUser('alice'); await seedUser('eve');
        expect((await api().get('/api/clients/alice/favorites')).status).toBe(401);
        expect((await api().get('/api/clients/alice/favorites').set('Authorization', bearer('eve'))).status).toBe(403);
    });
});

describe('passwords and registration', () => {
    it('users cannot change their own password through the server (needs re-auth in app)', async () => {
        await seedUser('alice');
        const res = await api().post('/api/auth/change-password').set('Authorization', bearer('alice'))
            .send({ newPassword: 'newpassword1' });
        expect(res.status).toBe(403);
    });

    it('non-admins cannot change other users\' passwords', async () => {
        await seedUser('alice'); await seedUser('eve');
        const res = await api().post('/api/auth/change-password').set('Authorization', bearer('eve'))
            .send({ newPassword: 'newpassword1', uid: 'alice' });
        expect(res.status).toBe(403);
    });

    it('admins can reset another user\'s password', async () => {
        await seedUser('alice'); await seedUser('boss', 'admin');
        const res = await api().post('/api/auth/change-password').set('Authorization', bearer('boss'))
            .send({ newPassword: 'newpassword1', uid: 'alice' });
        expect(res.status).toBe(200);
        expect(fakeAuth.users.get('alice').password).toBe('newpassword1');
    });

    it('registration validates input and never assigns admin', async () => {
        const weak = await api().post('/api/auth/register').send({ email: 'a@b.co', password: 'short', role: 'client', fullName: 'Ann' });
        expect(weak.status).toBe(400);
        const badEmail = await api().post('/api/auth/register').send({ email: 'nope', password: 'longenough1', role: 'client', fullName: 'Ann' });
        expect(badEmail.status).toBe(400);
        const admin = await api().post('/api/auth/register').send({ email: 'a@b.co', password: 'longenough1', role: 'admin', fullName: 'Ann' });
        expect(admin.status).toBe(400);
        const ok = await api().post('/api/auth/register').send({ email: 'a@b.co', password: 'longenough1', role: 'client', fullName: 'Ann' });
        expect(ok.status).toBe(201);
        const dup = await api().post('/api/auth/register').send({ email: 'a@b.co', password: 'longenough1', role: 'client', fullName: 'Ann' });
        expect(dup.status).toBe(409);
    });

    it('accounts without a profile are never given the vendor role from their email', async () => {
        fakeAuth.users.set('ghost', { uid: 'ghost', email: 'best.vendor.market@example.com' });
        const me = (await api().get('/api/auth/user/ghost').set('Authorization', bearer('ghost'))).body.user;
        expect(me.role).toBe('client');
    });
});

describe('in-app calls', () => {
    beforeEach(() => __resetCallState());

    async function startCall(caller = 'alice', receiver = 'bob') {
        const res = await api().post('/api/calls/initiate').set('Authorization', bearer(caller))
            .send({ receiverId: receiver, callType: 'voice', callerId: 'someone-else' });
        return res;
    }

    it('every call endpoint requires login', async () => {
        expect((await api().post('/api/calls/initiate').send({ receiverId: 'bob' })).status).toBe(401);
        expect((await api().get('/api/calls/incoming/bob')).status).toBe(401);
        expect((await api().post('/api/calls/x/answer')).status).toBe(401);
    });

    it('the caller is the logged-in user, not whatever the request says', async () => {
        await seedUser('alice'); await seedUser('bob');
        const res = await startCall();
        expect(res.status).toBe(201);
        expect(res.body.call.callerId).toBe('alice');
    });

    it('outsiders cannot see, answer, end or signal a call', async () => {
        await seedUser('alice'); await seedUser('bob'); await seedUser('eve');
        const callId = (await startCall()).body.call.id;
        const eve = bearer('eve');
        expect((await api().get(`/api/calls/${callId}/status`).set('Authorization', eve)).status).toBe(404);
        expect((await api().post(`/api/calls/${callId}/answer`).set('Authorization', eve)).status).toBe(404);
        expect((await api().post(`/api/calls/${callId}/end`).set('Authorization', eve)).status).toBe(404);
        expect((await api().get(`/api/calls/${callId}/room-token`).set('Authorization', eve)).status).toBe(404);
        expect((await api().get('/api/calls/incoming/bob').set('Authorization', eve)).status).toBe(403);
    });

    it('only the receiver can answer', async () => {
        await seedUser('alice'); await seedUser('bob');
        const callId = (await startCall()).body.call.id;
        expect((await api().post(`/api/calls/${callId}/answer`).set('Authorization', bearer('alice'))).status).toBe(403);
        expect((await api().post(`/api/calls/${callId}/answer`).set('Authorization', bearer('bob'))).status).toBe(200);
    });

    it('blocked users cannot call', async () => {
        await seedUser('alice'); await seedUser('bob', 'client', { blockedUserIds: ['alice'] });
        expect((await startCall()).status).toBe(403);
    });

    it('signals are routed with room tokens and cannot be read by the wrong user', async () => {
        await seedUser('alice'); await seedUser('bob');
        const callId = (await startCall()).body.call.id;
        const aliceToken = (await api().get(`/api/calls/${callId}/room-token`).set('Authorization', bearer('alice'))).body.roomToken;
        const bobToken = (await api().get(`/api/calls/${callId}/room-token`).set('Authorization', bearer('bob'))).body.roomToken;

        // no token -> rejected
        expect((await api().post(`/api/calls/${callId}/signal`).send({ data: { type: 'offer' } })).status).toBe(401);

        // alice sends an offer; recipient is derived server-side
        const sent = await api().post(`/api/calls/${callId}/signal`).set('X-Call-Token', aliceToken)
            .send({ from: 'mallory', to: 'mallory', data: { type: 'offer', sdp: 'x' } });
        expect(sent.status).toBe(200);

        // alice's token cannot read bob's queue
        expect((await api().get(`/api/calls/${callId}/signal/bob`).set('X-Call-Token', aliceToken)).status).toBe(403);
        const bobPoll = await api().get(`/api/calls/${callId}/signal/bob`).set('X-Call-Token', bobToken);
        expect(bobPoll.body.signals).toEqual([{ type: 'offer', sdp: 'x' }]);

        // a token for one call doesn't work for another
        await seedUser('carol');
        const other = (await startCall('carol', 'alice')).status; // alice busy -> 409 is fine too
        expect([201, 409]).toContain(other);
        expect((await api().post('/api/calls/call_other/signal').set('X-Call-Token', aliceToken).send({ data: { type: 'offer' } })).status).toBe(401);
    });

    it('the call room page requires a valid token and escapes embedded data', async () => {
        await seedUser('alice'); await seedUser('bob');
        const callId = (await startCall()).body.call.id;
        expect((await api().get(`/api/calls/room/${callId}?userId=alice`)).status).toBe(403);
        const token = (await api().get(`/api/calls/${callId}/room-token`).set('Authorization', bearer('alice'))).body.roomToken;
        const page = await api().get(`/api/calls/room/${callId}?token=${encodeURIComponent(token)}`);
        expect(page.status).toBe(200);
        expect(page.text).toContain('"userId":"alice"');
        expect(page.text).toContain('"targetId":"bob"');
        expect(page.headers['content-security-policy']).toContain("connect-src 'self'");
    });
});

describe('vendors, posts and reports', () => {
    it('the unverified "mark as paid" endpoint is gone', async () => {
        await seedUser('ven', 'vendor');
        const res = await api().post('/api/vendors/ven/payment').set('Authorization', bearer('ven')).send({ paymentReference: 'free', amount: 3000 });
        expect(res.status).toBe(404);
    });

    it('menu documents need the vendor\'s login and an https link', async () => {
        await seedUser('ven', 'vendor'); await seedUser('eve');
        const doc = { title: 'Menu', url: 'https://example.com/menu.pdf' };
        expect((await api().post('/api/vendors/ven/menu-documents').send(doc)).status).toBe(401);
        expect((await api().post('/api/vendors/ven/menu-documents').set('Authorization', bearer('eve')).send(doc)).status).toBe(403);
        expect((await api().post('/api/vendors/ven/menu-documents').set('Authorization', bearer('ven'))
            .send({ title: 'Menu', url: 'javascript:alert(1)' })).status).toBe(400);
        expect((await api().post('/api/vendors/ven/menu-documents').set('Authorization', bearer('ven')).send(doc)).status).toBe(201);
    });

    it('clients cannot publish business posts but can post to Community', async () => {
        await seedUser('cli');
        const biz = await api().post('/api/posts').set('Authorization', bearer('cli'))
            .send({ caption: 'Buy now', mediaUrl: 'https://x.test/a.jpg' });
        expect(biz.status).toBe(403);
        const community = await api().post('/api/posts').set('Authorization', bearer('cli'))
            .send({ authorType: 'client', caption: 'Any good tailors nearby?' });
        expect(community.status).toBe(201);
    });

    it('feeds do not expose who liked a post', async () => {
        await seedUser('ven', 'vendor'); await seedUser('alice');
        const post = await api().post('/api/posts').set('Authorization', bearer('ven'))
            .send({ caption: 'New stock', mediaUrl: 'https://x.test/a.jpg' });
        expect(post.status).toBe(201);
        await api().post(`/api/posts/${post.body.post.id}/like`).set('Authorization', bearer('alice'));
        const feed = await api().get('/api/posts/feed').query({ userId: 'alice' });
        const p = feed.body.posts.find((x: any) => x.id === post.body.post.id);
        expect(p.likedBy).toBeUndefined();
        expect(p.isLiked).toBe(true);
        expect(p.likesCount).toBe(1);
    });

    it('comments are length-limited and only allowed on real posts', async () => {
        await seedUser('alice');
        expect((await api().post('/api/posts/nope/comments').set('Authorization', bearer('alice')).send({ text: 'hi' })).status).toBe(404);
        await fakeDb.collection('posts').doc('p1').set({ id: 'p1', vendorId: 'v', createdAt: new Date().toISOString() });
        expect((await api().post('/api/posts/p1/comments').set('Authorization', bearer('alice')).send({ text: 'x'.repeat(1001) })).status).toBe(400);
        expect((await api().post('/api/posts/p1/comments').set('Authorization', bearer('alice')).send({ text: 'Nice!' })).status).toBe(201);
    });

    it('reports require login, a valid reason, and are de-duplicated', async () => {
        await seedUser('alice');
        const body = { targetType: 'post', targetId: 'p1', reason: 'Spam, scam, or misleading information' };
        expect((await api().post('/api/moderation/report').send(body)).status).toBe(401);
        expect((await api().post('/api/moderation/report').set('Authorization', bearer('alice')).send({ ...body, reason: 'made up' })).status).toBe(400);
        const first = await api().post('/api/moderation/report').set('Authorization', bearer('alice')).send({ ...body, reporterId: 'someone-else' });
        expect(first.status).toBe(201);
        const second = await api().post('/api/moderation/report').set('Authorization', bearer('alice')).send(body);
        expect(second.body.alreadyReported).toBe(true);
        const stored = fakeDb.raw(`reports/${first.body.reportId}`);
        expect(stored.reporterUid).toBe('alice');
    });
});
