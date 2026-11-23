import { describe, it, expect } from 'vitest';
import { api, bearer, seedUser, fakeDb } from './helpers';

const as = (uid: string) => ({ Authorization: bearer(uid) });
async function realtor(uid = 'agent', category = 'Real Estate & Property - Realtor', extra: Record<string, any> = {}) {
    await seedUser(uid, 'vendor', { businessName: `${uid} Homes`, ...extra });
    await fakeDb.collection('vendors').doc(uid).set({ verificationStatus: 'approved', category, businessName: `${uid} Homes` }, { merge: true });
}
const body = (over: Record<string, any> = {}) => ({
    purpose: 'rent', propertyType: 'flat', title: '2 bedroom flat in Lekki Phase 1',
    description: 'Spacious, tiled, constant water.', price: '2,500,000', pricePeriod: 'year',
    fees: { agencyFee: 250000, cautionFee: 250000, legalFee: 100000 },
    bedrooms: 2, bathrooms: 2, furnished: 'unfurnished', amenities: ['water', 'parking', 'bogus'],
    area: 'Lekki Phase 1', city: 'Lagos', state: 'Lagos', exactAddress: '12 Admiralty Way, Flat 3',
    location: { latitude: 6.447812, longitude: 3.472563 },
    photos: ['https://example.com/1.jpg', 'https://example.com/2.jpg'], ...over,
});
const create = (uid: string, over: Record<string, any> = {}) => api().post('/api/listings').set(as(uid)).send(body(over));

describe('property listings', () => {
    it('only vendors in property-type categories can list', async () => {
        await seedUser('cli');
        expect((await create('cli')).status).toBe(403);
        await realtor('baker', 'Food & Agriculture - Baker');
        expect((await create('baker')).status).toBe(403);
        await realtor('host', 'Travel & Hospitality - Short-let Host');
        expect((await create('host', { purpose: 'short-let', pricePeriod: 'night', price: 45000 })).status).toBe(201);
    });

    it('creates with the move-in total, a rounded pin, cleaned amenities and a 30-day expiry', async () => {
        await realtor();
        const res = await create('agent');
        expect(res.status).toBe(201);
        const l = res.body.listing;
        expect(l.price).toBe(2500000);
        expect(l.totalMoveIn).toBe(2500000 + 250000 + 250000 + 100000);
        expect(l.approxLocation).toEqual({ latitude: 6.45, longitude: 3.47 });
        expect(l.amenities).toEqual(['water', 'parking']);
        expect(l.exactAddress).toBe('12 Admiralty Way, Flat 3'); // the agent sees it
        const days = (new Date(l.expiresAt).getTime() - Date.now()) / 86400000;
        expect(days).toBeGreaterThan(29.9);
        expect(days).toBeLessThan(30.1);
    });

    it('validates input', async () => {
        await realtor();
        expect((await create('agent', { purpose: 'swap' })).status).toBe(400);
        expect((await create('agent', { photos: [] })).status).toBe(400);
        expect((await create('agent', { photos: ['http://insecure.com/a.jpg'] })).status).toBe(400);
        expect((await create('agent', { price: -5 })).status).toBe(400);
        expect((await create('agent', { title: 'Hi' })).status).toBe(400);
        expect((await create('agent', { bedrooms: 99 })).status).toBe(400);
    });

    it('the exact address is never shown to the public', async () => {
        await realtor(); await seedUser('cli');
        const id = (await create('agent')).body.listing.id;
        const pub = await api().get(`/api/listings/${id}`).set(as('cli'));
        expect(pub.status).toBe(200);
        expect(pub.body.listing.exactAddress).toBeUndefined();
        const browse = await api().get('/api/listings');
        expect(browse.body.listings[0].exactAddress).toBeUndefined();
        expect(JSON.stringify(browse.body)).not.toContain('Admiralty');
        const own = await api().get(`/api/listings/${id}`).set(as('agent'));
        expect(own.body.listing.exactAddress).toContain('Admiralty');
    });

    it('filters by purpose, type, state, price, bedrooms and text', async () => {
        await realtor();
        await create('agent');
        await create('agent', { title: 'Shop space in Ikeja', propertyType: 'shop', purpose: 'lease', price: 900000, bedrooms: null, area: 'Ikeja', state: 'Lagos' });
        await create('agent', { title: 'Duplex for sale in Wuse', propertyType: 'duplex', purpose: 'sale', price: 150000000, pricePeriod: 'once', bedrooms: 5, area: 'Wuse', city: 'Abuja', state: 'FCT' });
        const q = async (query: any) => (await api().get('/api/listings').query(query)).body.listings.map((l: any) => l.title);
        expect(await q({ purpose: 'lease' })).toEqual(['Shop space in Ikeja']);
        expect(await q({ state: 'fct' })).toEqual(['Duplex for sale in Wuse']);
        expect((await q({ maxPrice: 3000000 })).length).toBe(2);
        expect(await q({ bedrooms: 3 })).toEqual(['Duplex for sale in Wuse']);
        expect(await q({ q: 'lekki' })).toEqual(['2 bedroom flat in Lekki Phase 1']);
        expect(await q({ type: 'shop' })).toEqual(['Shop space in Ikeja']);
    });

    it('taken, paused and expired listings leave browsing; renewing brings an expired one back', async () => {
        await realtor(); await seedUser('cli');
        const a = (await create('agent')).body.listing.id;
        const b = (await create('agent', { title: 'Another flat in Yaba' })).body.listing.id;
        await api().post(`/api/listings/${a}/status`).set(as('agent')).send({ status: 'taken' });
        await fakeDb.collection('listings').doc(b).set({ expiresAt: new Date(Date.now() - 1000).toISOString() }, { merge: true });
        expect((await api().get('/api/listings')).body.listings).toHaveLength(0);
        expect((await api().get(`/api/listings/${b}`).set(as('cli'))).status).toBe(404);
        expect((await api().get(`/api/listings/${a}`).set(as('cli'))).body.listing.status).toBe('taken');
        const mine = (await api().get('/api/listings/mine').set(as('agent'))).body.listings;
        expect(mine.find((l: any) => l.id === b).expired).toBe(true);
        await api().post(`/api/listings/${b}/renew`).set(as('agent'));
        expect((await api().get('/api/listings')).body.listings.map((l: any) => l.id)).toEqual([b]);
    });

    it('only the agent (or an admin) can edit, change status, renew or delete', async () => {
        await realtor(); await realtor('other'); await seedUser('boss', 'admin');
        const id = (await create('agent')).body.listing.id;
        expect((await api().put(`/api/listings/${id}`).set(as('other')).send({ price: 1 })).status).toBe(403);
        expect((await api().post(`/api/listings/${id}/status`).set(as('other')).send({ status: 'taken' })).status).toBe(403);
        expect((await api().delete(`/api/listings/${id}`).set(as('other'))).status).toBe(403);
        const edit = await api().put(`/api/listings/${id}`).set(as('agent')).send({ price: 3000000, fees: { agencyFee: 300000 } });
        expect(edit.status).toBe(200);
        const l = (await api().get(`/api/listings/${id}`).set(as('agent'))).body.listing;
        expect(l.totalMoveIn).toBe(3300000);
        expect((await api().delete(`/api/listings/${id}`).set(as('boss'))).status).toBe(200);
    });

    it('suspended agents and blocked agents are hidden; listings can be reported', async () => {
        await realtor(); await realtor('bad'); await seedUser('cli', 'client', { blockedUserIds: ['agent'] });
        await create('agent'); const badId = (await create('bad', { title: 'Too good to be true flat' })).body.listing.id;
        await fakeDb.collection('users').doc('bad').set({ isSuspended: true }, { merge: true });
        expect((await api().get('/api/listings')).body.listings.map((l: any) => l.ownerId)).toEqual(['agent']);
        expect((await api().get('/api/listings').set(as('cli'))).body.listings).toHaveLength(0);
        expect((await api().get(`/api/listings/${badId}`)).status).toBe(404);
        const rep = await api().post('/api/moderation/report').set(as('cli')).send({ targetType: 'listing', targetId: badId, reason: 'Spam, scam, or misleading information' });
        expect([200, 201]).toContain(rep.status);
    });

    it('caps active listings and removes them when the account is deleted', async () => {
        await realtor();
        for (let i = 0; i < 30; i++) {
            await fakeDb.collection('listings').doc(`x${i}`).set({ ownerId: 'agent', status: 'available', expiresAt: new Date(Date.now() + 86400000).toISOString() });
        }
        expect((await create('agent')).status).toBe(400);
        await api().delete('/api/auth/delete-account').set(as('agent'));
        expect((await fakeDb.collection('listings').where('ownerId', '==', 'agent').get()).docs).toHaveLength(0);
    });
});
