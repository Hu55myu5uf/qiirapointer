import { describe, it, expect } from 'vitest';
import { api, bearer, seedUser, fakeDb } from './helpers';
import { storedFiles, lastSignedUrl } from './fakes/instances';

// An MP4 starts with a box whose type is "ftyp" at byte 4
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(200, 7)]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>' + ' '.repeat(100));
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]).toString('base64');

async function getLink(uid: string, body: any = { contentType: 'video/mp4', size: MP4.length }) {
    return api().post('/api/posts/video-upload-url').set('Authorization', bearer(uid)).send(body);
}

/** Simulate the phone uploading through the signed link. */
function uploadVia(uploadRef: string, buffer: Buffer) {
    storedFiles.set(uploadRef.replace(/^upload:/, ''), { buffer, contentType: 'video/mp4' });
}

async function publish(uid: string, media: string[], extra: Record<string, any> = {}) {
    return api().post('/api/posts').set('Authorization', bearer(uid))
        .send({ vendorId: uid, type: 'reel', caption: 'New arrival', mediaUrls: media, ...extra });
}

describe('direct video uploads', () => {
    it('issues a short-lived write link only inside the caller\'s own incoming folder, size-capped by storage', async () => {
        await seedUser('shop', 'vendor');
        const res = await getLink('shop');
        expect(res.status).toBe(200);
        expect(res.body.uploadRef).toMatch(/^upload:incoming\/shop\/video_[a-z0-9_]+\.mp4$/);
        expect(res.body.method).toBe('PUT');
        expect(lastSignedUrl.options.action).toBe('write');
        expect(lastSignedUrl.options.contentType).toBe('video/mp4');
        expect(lastSignedUrl.options.extensionHeaders['x-goog-content-length-range']).toBe(`1,${100 * 1024 * 1024}`);
        expect(lastSignedUrl.options.expires - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000);
    });

    it('refuses non-video types, oversized files and anonymous callers', async () => {
        await seedUser('shop', 'vendor');
        expect((await getLink('shop', { contentType: 'text/html', size: 100 })).status).toBe(415);
        expect((await getLink('shop', { contentType: 'video/mp4', size: 101 * 1024 * 1024 })).status).toBe(413);
        expect((await api().post('/api/posts/video-upload-url').send({ contentType: 'video/mp4', size: 10 })).status).toBe(401);
    });

    it('publishes a real uploaded video: moved to the public posts folder, the incoming copy removed', async () => {
        await seedUser('shop', 'vendor');
        const { body } = await getLink('shop');
        uploadVia(body.uploadRef, MP4);

        const res = await publish('shop', [body.uploadRef], { videoOptions: { muted: true, start: 2, end: 12 } });
        expect(res.status).toBe(201);
        expect(res.body.post.mediaUrls[0]).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/.+\/o\/public%2Fposts%2Fshop%2Fmedia_0_.+\.mp4\?alt=media&token=/);
        expect(res.body.post.videoOptions).toEqual({ muted: true, start: 2, end: 12 });
        expect(storedFiles.has(body.uploadRef.replace('upload:', ''))).toBe(false);
        const published = [...storedFiles.entries()].find(([p]) => p.startsWith('public/posts/shop/'));
        expect(published?.[1].contentType).toBe('video/mp4');
    });

    it('rejects and deletes an upload that is not really a video', async () => {
        await seedUser('shop', 'vendor');
        const { body } = await getLink('shop');
        uploadVia(body.uploadRef, HTML);

        const res = await publish('shop', [body.uploadRef]);
        expect(res.status).toBe(415);
        expect(storedFiles.size).toBe(0);
        expect((await fakeDb.collection('posts').get()).size).toBe(0);
    });

    it("cannot publish someone else's upload", async () => {
        await seedUser('shop', 'vendor');
        await seedUser('eve', 'vendor');
        const { body } = await getLink('shop');
        uploadVia(body.uploadRef, MP4);

        const res = await publish('eve', [body.uploadRef]);
        expect(res.status).toBe(403);
        expect(storedFiles.has(body.uploadRef.replace('upload:', ''))).toBe(true); // the owner's file is untouched
    });

    it('rejects path tricks in the upload reference', async () => {
        await seedUser('shop', 'vendor');
        for (const ref of ['upload:incoming/shop/../eve/video_1.mp4', 'upload:incoming/shop/sub/video_1.mp4', 'upload:public/posts/shop/x.mp4']) {
            const res = await publish('shop', [ref]);
            expect(res.status).toBeGreaterThanOrEqual(400);
            expect(res.status).toBeLessThan(500);
        }
    });

    it('keeps the video edit settings within sane bounds', async () => {
        await seedUser('shop', 'vendor');
        const { body } = await getLink('shop');
        uploadVia(body.uploadRef, MP4);
        const res = await publish('shop', [body.uploadRef], { videoOptions: { muted: 'yes', start: -5, end: 99999 } });
        expect(res.body.post.videoOptions).toEqual({ muted: false, start: 0, end: 600 });
    });

    it('accepts an uploaded cover image for the video', async () => {
        await seedUser('shop', 'vendor');
        const { body } = await getLink('shop');
        uploadVia(body.uploadRef, MP4);
        const res = await publish('shop', [body.uploadRef], { thumbnailData: `data:image/jpeg;base64,${JPEG}` });
        expect(res.status).toBe(201);
        expect(res.body.post.thumbnailUrl).toMatch(/public%2Fposts%2Fshop%2Fcover_.+\.jpg/);
    });
});

describe('new vendors', () => {
    it('are listed straight away when they register', async () => {
        const res = await api().post('/api/auth/register')
            .send({ email: 'new@shop.com', password: 'password123', role: 'vendor', fullName: 'New Shop' });
        expect(res.status).toBe(201);
        const uid = res.body.user?.uid || res.body.uid;
        const v = (await fakeDb.collection('vendors').doc(uid).get()).data()!;
        expect(v.verificationStatus).toBe('approved');
        expect(v.isVerified).toBe(false); // the ID badge still needs a real check
    });

    it('brand-new accounts are limited to 10 posts a day; established accounts are not', async () => {
        await seedUser('fresh', 'vendor', { createdAt: new Date().toISOString() });
        for (let i = 0; i < 10; i++) {
            const ok = await publish('fresh', [`data:image/jpeg;base64,${JPEG}`]);
            expect(ok.status).toBe(201);
        }
        const blocked = await publish('fresh', [`data:image/jpeg;base64,${JPEG}`]);
        expect(blocked.status).toBe(429);

        await seedUser('old', 'vendor', { createdAt: '2025-01-01T00:00:00.000Z' });
        for (let i = 0; i < 11; i++) {
            expect((await publish('old', [`data:image/jpeg;base64,${JPEG}`])).status).toBe(201);
        }
    });
});
