import { describe, it, expect } from 'vitest';
import { api, bearer, seedUser, fakeDb } from './helpers';
import { extractMentionNames } from '../src/utils/mentions';

const setName = (uid: string, username: string) =>
    api().put('/api/users/me/username').set('Authorization', bearer(uid)).send({ username });
const notes = async (uid: string) =>
    (await api().get('/api/notifications').set('Authorization', bearer(uid))).body.notifications as any[];
const wait = () => new Promise(r => setTimeout(r, 20)); // mention notifications are sent after the response

async function people() {
    await seedUser('ven', 'vendor', { businessName: 'Ven Shop' });
    await fakeDb.collection('vendors').doc('ven').set({ verificationStatus: 'approved', category: 'Food - Bakery', businessName: 'Ven Shop' }, { merge: true });
    await seedUser('ada'); await seedUser('bola'); await seedUser('cyn', 'client', { blockedUserIds: ['ven'] }); await seedUser('sus', 'client', { isSuspended: true });
    await setName('ven', 'ven.shop'); await setName('ada', 'ada.k'); await setName('bola', 'bola_');
    await setName('cyn', 'cyn.x');
    await fakeDb.collection('usernames').doc('sus.pect').set({ uid: 'sus', u: 'sus.pect' });
}

describe('@mentions', () => {
    it('finds names in text (unique, max 10, ignores emails and trailing dots)', () => {
        expect(extractMentionNames('Hi @Ada.K and @bola_, see @ada.k. Mail me at x@ada.k')).toEqual(['ada.k', 'bola_']);
        expect(extractMentionNames(Array.from({ length: 15 }, (_, i) => `@user${i}x`).join(' '))).toHaveLength(10);
    });

    it('a post mentioning people stores them and notifies them (not blocked/suspended/self/unknown)', async () => {
        await people();
        const res = await api().post('/api/posts').set('Authorization', bearer('ven')).send({
            caption: 'Thanks @ada.k and @bola_! Also @cyn.x @sus.pect @nobody.here and me @ven.shop',
            mediaUrls: ['https://example.com/p.jpg'],
        });
        expect(res.status).toBe(201);
        expect(res.body.post.mentions.map((m: any) => m.username).sort()).toEqual(['ada.k', 'bola_']);
        await wait();
        const ada = await notes('ada');
        expect(ada[0]).toMatchObject({ type: 'mention', actorId: 'ven', title: 'Ven Shop mentioned you in a post' });
        expect(ada[0].data.postId).toBe(res.body.post.id);
        expect(await notes('cyn')).toHaveLength(0);
        expect(await notes('ven')).toHaveLength(0);
    });

    it('a comment mentioning someone notifies them once, and comments list the mentions', async () => {
        await people();
        const post = (await api().post('/api/posts').set('Authorization', bearer('ven')).send({ caption: 'New bread', mediaUrls: ['https://example.com/p.jpg'] })).body.post;
        const c = await api().post(`/api/posts/${post.id}/comments`).set('Authorization', bearer('ada')).send({ text: '@bola_ you have to try this @bola_' });
        expect(c.status).toBe(201);
        await wait();
        const bola = await notes('bola');
        expect(bola).toHaveLength(1);
        expect(bola[0].title).toBe('ada mentioned you in a comment');
        const list = (await api().get(`/api/posts/${post.id}/comments`)).body.comments;
        expect(list[0].mentions).toEqual([{ uid: 'bola', username: 'bola_' }]);
    });
});
