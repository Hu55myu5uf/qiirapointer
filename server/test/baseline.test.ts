import { describe, it, expect } from 'vitest';
import { api, bearer, seedUser } from './helpers';

describe('baseline: server boots and existing protections hold', () => {
    it('health check responds', async () => {
        const res = await api().get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('healthy');
    });

    it('unknown routes return 404', async () => {
        const res = await api().get('/api/does-not-exist');
        expect(res.status).toBe(404);
    });

    it('rejects malformed and invalid tokens', async () => {
        expect((await api().get('/api/admin/users')).status).toBe(401);
        expect((await api().get('/api/admin/users').set('Authorization', 'Bearer nope')).status).toBe(401);
    });

    it('admin routes forbid non-admins', async () => {
        await seedUser('client1');
        const res = await api().get('/api/admin/users').set('Authorization', bearer('client1'));
        expect(res.status).toBe(403);
    });

    it('suspended users are blocked from authenticated routes', async () => {
        await seedUser('bad1', 'client', { isSuspended: true });
        const res = await api().get('/api/cart/bad1').set('Authorization', bearer('bad1'));
        expect(res.status).toBe(403);
    });

    it('cart is only accessible by its owner', async () => {
        await seedUser('alice');
        await seedUser('bob');
        expect((await api().get('/api/cart/alice').set('Authorization', bearer('alice'))).status).toBe(200);
        expect((await api().get('/api/cart/alice').set('Authorization', bearer('bob'))).status).toBe(403);
    });

    it('profile updates are only allowed for self', async () => {
        await seedUser('alice');
        await seedUser('bob');
        const res = await api().put('/api/auth/user/alice').set('Authorization', bearer('bob')).send({ fullName: 'Hacked' });
        expect(res.status).toBe(403);
    });

    it('vendor profile updates are only allowed for the vendor', async () => {
        await seedUser('v1', 'vendor');
        await seedUser('bob');
        const res = await api().put('/api/vendors/v1/profile').set('Authorization', bearer('bob')).send({ businessName: 'X' });
        expect(res.status).toBe(403);
    });
});
