import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getIceServers, __resetCallState } from '../src/routes/call.routes';

const ENV = ['CLOUDFLARE_TURN_KEY_ID', 'CLOUDFLARE_TURN_API_TOKEN', 'ICE_SERVERS_JSON'];

beforeEach(() => { __resetCallState(); ENV.forEach(k => delete process.env[k]); });
afterEach(() => { vi.unstubAllGlobals(); ENV.forEach(k => delete process.env[k]); });

const urlsOf = (servers: any[]) => servers.flatMap(s => (Array.isArray(s.urls) ? s.urls : [s.urls]));

describe('call relay (TURN) servers', () => {
    it('uses public STUN only when no relay is configured', async () => {
        const servers = await getIceServers();
        expect(urlsOf(servers).every(u => u.startsWith('stun:'))).toBe(true);
    });

    it('adds Cloudflare TURN credentials, drops port 53, and caches them', async () => {
        process.env.CLOUDFLARE_TURN_KEY_ID = 'key';
        process.env.CLOUDFLARE_TURN_API_TOKEN = 'secret';
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            iceServers: [
                { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
                { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
            ],
        }), { status: 201 }));
        vi.stubGlobal('fetch', fetchMock);

        const servers = await getIceServers();
        const urls = urlsOf(servers);
        expect(urls).toContain('turns:turn.cloudflare.com:443?transport=tcp');
        expect(urls.some(u => /:53(\?|$)/.test(u))).toBe(false);
        expect(servers.find(s => s.username === 'u')?.credential).toBe('c');
        const [url, init] = fetchMock.mock.calls[0] as any;
        expect(url).toContain('/turn/keys/key/credentials/generate-ice-servers');
        expect(init.headers.Authorization).toBe('Bearer secret');

        await getIceServers();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('falls back to ICE_SERVERS_JSON when Cloudflare fails', async () => {
        process.env.CLOUDFLARE_TURN_KEY_ID = 'key';
        process.env.CLOUDFLARE_TURN_API_TOKEN = 'bad';
        process.env.ICE_SERVERS_JSON = JSON.stringify([{ urls: 'turn:relay.example.com:3478', username: 'a', credential: 'b' }]);
        vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 401 })));
        const urls = urlsOf(await getIceServers());
        expect(urls).toContain('turn:relay.example.com:3478');
    });
});
