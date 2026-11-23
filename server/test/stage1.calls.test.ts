import { describe, it, expect, beforeEach } from 'vitest';
import { api, bearer, seedUser, fakeDb } from './helpers';
import { __resetCallState } from '../src/routes/call.routes';

beforeEach(() => __resetCallState());

async function startCall(caller = 'alice', receiver = 'bob', callType = 'voice') {
    const res = await api().post('/api/calls/initiate').set('Authorization', bearer(caller)).send({ receiverId: receiver, callType });
    return res.body.call.id as string;
}

async function chatMessages(a: string, b: string) {
    const convId = [a, b].sort().join('_');
    const snap = await fakeDb.collection('conversations').doc(convId).collection('messages').get();
    return { conv: (await fakeDb.collection('conversations').doc(convId).get()).data(), messages: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
}

describe('call page', () => {
    it('renders a call page whose script is valid JavaScript', async () => {
        await seedUser('alice'); await seedUser('bob');
        const callId = await startCall();
        const token = (await api().get(`/api/calls/${callId}/room-token`).set('Authorization', bearer('alice'))).body.roomToken;
        const page = await api().get(`/api/calls/room/${callId}?token=${encodeURIComponent(token)}&type=video`);
        expect(page.status).toBe(200);
        const scripts = [...page.text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
        expect(scripts.length).toBeGreaterThan(0);
        for (const code of scripts) expect(() => new Function(code)).not.toThrow();
        // signals are applied in order, early ICE candidates are kept, and a failed link is restarted
        expect(page.text).toContain('pendingCandidates');
        expect(page.text).toContain('await handleSignal(sig)');
        expect(page.text).toContain('iceRestart: true');
    });
});

describe('call history', () => {
    it('a missed call shows up in the chat and in the receiver\'s history as missed', async () => {
        await seedUser('alice'); await seedUser('bob');
        const callId = await startCall('alice', 'bob', 'video');
        await api().post(`/api/calls/${callId}/end`).set('Authorization', bearer('alice')); // hung up before an answer

        const { conv, messages } = await chatMessages('alice', 'bob');
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({ id: `call_${callId}`, messageType: 'call', text: '🎥 Missed video call' });
        expect(conv!.lastMessage).toBe('🎥 Missed video call');

        const bob = await api().get('/api/calls/history').set('Authorization', bearer('bob'));
        expect(bob.status).toBe(200);
        expect(bob.body.calls[0]).toMatchObject({ direction: 'incoming', missed: true, callType: 'video' });
        expect(bob.body.calls[0].otherUser.id).toBe('alice');

        const alice = await api().get('/api/calls/history').set('Authorization', bearer('alice'));
        expect(alice.body.calls[0]).toMatchObject({ direction: 'outgoing', missed: false });
    });

    it('an answered call is logged once, with its duration', async () => {
        await seedUser('alice'); await seedUser('bob');
        const callId = await startCall();
        await api().post(`/api/calls/${callId}/answer`).set('Authorization', bearer('bob'));
        await fakeDb.collection('calls').doc(callId).set({ answeredAt: new Date(Date.now() - 75_000).toISOString() }, { merge: true });
        await api().post(`/api/calls/${callId}/end`).set('Authorization', bearer('bob'));
        await api().post(`/api/calls/${callId}/end`).set('Authorization', bearer('alice')); // second hang-up: no duplicate

        const { messages } = await chatMessages('alice', 'bob');
        expect(messages).toHaveLength(1);
        expect(messages[0].text).toMatch(/^📞 Voice call · 1:1\d$/);
        expect((messages[0] as any).callData.status).toBe('ended');
    });

    it('a declined call is logged as declined', async () => {
        await seedUser('alice'); await seedUser('bob');
        const callId = await startCall();
        await api().post(`/api/calls/${callId}/reject`).set('Authorization', bearer('bob'));
        const { messages } = await chatMessages('alice', 'bob');
        expect(messages[0].text).toBe('📞 Declined voice call');
    });

    it('history is private: you only ever see your own calls', async () => {
        await seedUser('alice'); await seedUser('bob'); await seedUser('eve');
        const callId = await startCall();
        await api().post(`/api/calls/${callId}/end`).set('Authorization', bearer('alice'));
        const eve = await api().get('/api/calls/history').set('Authorization', bearer('eve'));
        expect(eve.body.calls).toEqual([]);
        expect((await api().get('/api/calls/history')).status).toBe(401);
    });
});

describe('call signalling', () => {
    async function roomToken(callId: string, uid: string) {
        return (await api().get(`/api/calls/${callId}/room-token`).set('Authorization', bearer(uid))).body.roomToken as string;
    }
    const send = (callId: string, token: string, data: any) =>
        api().post(`/api/calls/${callId}/signal`).set('X-Call-Token', token).send({ data });

    it('accepts ready / restart signals and keeps the offer when many candidates queue up', async () => {
        await seedUser('alice'); await seedUser('bob');
        const callId = await startCall();
        const a = await roomToken(callId, 'alice');
        expect((await send(callId, a, { type: 'ready' })).status).toBe(200);
        expect((await send(callId, a, { type: 'offer', sdp: { type: 'offer', sdp: 'v=0' } })).status).toBe(200);
        for (let i = 0; i < 120; i++) await send(callId, a, { type: 'candidate', candidate: { candidate: 'c' + i } });
        expect((await send(callId, a, { type: 'restart' })).status).toBe(200);
        expect((await send(callId, a, { type: 'bogus' })).status).toBe(400);

        await api().post(`/api/calls/${callId}/answer`).set('Authorization', bearer('bob'));
        const b = await roomToken(callId, 'bob');
        const got = (await api().get(`/api/calls/${callId}/signal/bob`).set('X-Call-Token', b)).body.signals as any[];
        expect(got.length).toBeLessThanOrEqual(100);
        expect(got.map(s => s.type)).toContain('offer');
        expect(got[0].type).toBe('ready');
        expect(got[got.length - 1].type).toBe('restart');
    });
});
