import { describe, it, expect } from 'vitest';
import { api, bearer, seedUser, fakeDb, fakeAuth } from './helpers';
import { ensureUsername, usernameProblem } from '../src/utils/usernames';

const setName = (uid: string, username: string) =>
    api().put('/api/users/me/username').set('Authorization', bearer(uid)).send({ username });

describe('usernames', () => {
    it('validates format and reserved names', () => {
        expect(usernameProblem('ab')).toBeTruthy();
        expect(usernameProblem('has space')).toBeTruthy();
        expect(usernameProblem('.dot')).toBeTruthy();
        expect(usernameProblem('a..b')).toBeTruthy();
        expect(usernameProblem('12345')).toBeTruthy();
        for (const r of ['admin', 'a.d.m.i.n', 'support', 'pointer', 'pointer_support', 'qiiraofficial', 'pointer.team']) {
            expect(usernameProblem(r)).toBe('That username is reserved.');
        }
        expect(usernameProblem('ada.kitchen_2')).toBeNull();
    });

    it('new accounts get a username automatically, unique even with the same name', async () => {
        await seedUser('u1', 'client', { fullName: 'Ada Lovelace' });
        await seedUser('u2', 'client', { fullName: 'Ada Lovelace' });
        const a = await ensureUsername('u1', 'Ada Lovelace');
        const b = await ensureUsername('u2', 'Ada Lovelace');
        expect(a).toBe('adalovelace');
        expect(b).toMatch(/^adalovelace\d+$/);
        expect((await fakeDb.collection('usernames').doc(a!).get()).data()?.uid).toBe('u1');
    });

    it('an existing account gets one when it loads its own profile', async () => {
        await seedUser('old', 'vendor', { fullName: 'Owner', businessName: "Mama's Kitchen" });
        const res = await api().get('/api/auth/user/old').set('Authorization', bearer('old'));
        expect(res.body.user.username).toBe('mamaskitchen');
        // a stranger viewing the profile sees it too, but doesn't create one for someone else
        await seedUser('quiet');
        const pub = await api().get('/api/auth/user/quiet');
        expect(pub.body.user.username).toBeNull();
    });

    it('changing: unique, case-insensitive, frees the old name, once every 30 days', async () => {
        await seedUser('al'); await seedUser('bo');
        await ensureUsername('al', 'Al');
        await ensureUsername('bo', 'Bo');

        // the automatic name doesn't use up the monthly change
        const first = await setName('al', '@Al.Builds');
        expect(first.status).toBe(200);
        expect(first.body.username).toBe('al.builds');
        // the old automatic name was released: exactly one name points to "al"
        expect((await fakeDb.collection('usernames').where('uid', '==', 'al').get()).docs.map(d => d.id)).toEqual(['al.builds']);

        expect((await setName('bo', 'AL.BUILDS')).status).toBe(409);
        const tooSoon = await setName('al', 'al.again');
        expect(tooSoon.status).toBe(429);
        expect(tooSoon.body.nextAllowedAt).toBeTruthy();

        // after 30 days it's allowed, and the old name becomes free
        await fakeDb.collection('users').doc('al').set({ usernameChangedAt: new Date(Date.now() - 31 * 86400000).toISOString() }, { merge: true });
        expect((await setName('al', 'al.again')).status).toBe(200);
        expect((await setName('bo', 'al.builds')).status).toBe(200);
    });

    it('admins can override the limit; others cannot use the admin route', async () => {
        await seedUser('cy'); await seedUser('boss', 'admin');
        await setName('cy', 'cy.one');
        expect((await api().put('/api/admin/users/cy/username').set('Authorization', bearer('cy')).send({ username: 'cy.two' })).status).toBe(403);
        const res = await api().put('/api/admin/users/cy/username').set('Authorization', bearer('boss')).send({ username: 'cy.two' });
        expect(res.status).toBe(200);
    });

    it('search suggests by prefix and hides suspended and blocked people', async () => {
        await seedUser('me');
        await seedUser('s1', 'client', { fullName: 'Sam One' });
        await seedUser('s2', 'vendor', { fullName: 'Sam Two', isSuspended: true });
        await seedUser('s3', 'client', { fullName: 'Sam Three', blockedUserIds: ['me'] });
        await setName('me', 'me.user');
        await setName('s1', 'sam.one');
        await fakeDb.collection('usernames').doc('sam.two').set({ uid: 's2', u: 'sam.two' });
        await setName('s3', 'sam.three');

        const res = await api().get('/api/users/search').query({ q: '@Sam' }).set('Authorization', bearer('me'));
        expect(res.status).toBe(200);
        expect(res.body.users.map((u: any) => u.username)).toEqual(['sam.one']);
        expect(res.body.users[0].email).toBeUndefined();
        expect((await api().get('/api/users/search').query({ q: 'sam' })).status).toBe(401);
    });

    it('looks a username up for opening a profile', async () => {
        await seedUser('dee', 'vendor', { fullName: 'Dee' });
        await setName('dee', 'dee.shop');
        const res = await api().get('/api/users/by-username/@DEE.shop');
        expect(res.body).toMatchObject({ uid: 'dee', username: 'dee.shop', role: 'vendor' });
        expect((await api().get('/api/users/by-username/nobody')).status).toBe(404);
    });

    it('deleting the account frees the username', async () => {
        await seedUser('gone');
        await setName('gone', 'gone.soon');
        await api().delete('/api/auth/delete-account').set('Authorization', bearer('gone'));
        expect((await fakeDb.collection('usernames').doc('gone.soon').get()).exists).toBe(false);
    });
});
