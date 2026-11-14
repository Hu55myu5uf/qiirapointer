import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api } from './helpers';

describe('rate limiting', () => {
    beforeAll(() => { process.env.RATE_LIMIT_IN_TESTS = '1'; });
    afterAll(() => { delete process.env.RATE_LIMIT_IN_TESTS; });

    it('cannot be bypassed by sending a fake X-Forwarded-For header', async () => {
        let lastStatus = 0;
        for (let i = 0; i < 41; i++) {
            // The attacker rotates a fake IP every request; Render's proxy then appends the
            // attacker's REAL address (203.0.113.7) as the last entry, which is the one trusted.
            const res = await api().post('/api/auth/login')
                .set('X-Forwarded-For', `10.0.0.${i}, 203.0.113.7`)
                .send({});
            lastStatus = res.status;
        }
        // 40 allowed per window; the 41st is blocked even though every "IP" was different
        expect(lastStatus).toBe(429);
    });
});
