import { describe, it, expect } from 'vitest';
import { api, bearer, seedUser, fakeDb } from './helpers';

async function vendor(uid: string, extra: Record<string, any> = {}) {
    await seedUser(uid, 'vendor', { businessName: 'Old Name', phoneNumber: '+2348000000000' });
    await fakeDb.collection('vendors').doc(uid).set({
        verificationStatus: 'approved', businessName: 'Old Name', category: 'Food - Bakery',
        businessImage: 'https://example.com/a.jpg', phoneNumber: '+2348000000000', ...extra,
    }, { merge: true });
}
const save = (uid: string, body: any, as = uid) =>
    api().put(`/api/vendors/${uid}/profile`).set('Authorization', bearer(as)).send(body);
const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

describe('once-a-month identity fields', () => {
    it('first change is allowed, a second within 30 days is refused with the date', async () => {
        await vendor('shop');
        expect((await save('shop', { businessName: 'New Name' })).status).toBe(200);
        const again = await save('shop', { businessName: 'Newer Name' });
        expect(again.status).toBe(429);
        expect(again.body.field).toBe('businessName');
        expect(again.body.nextAllowedAt).toBeTruthy();
        expect((await fakeDb.collection('vendors').doc('shop').get()).data()?.businessName).toBe('New Name');
    });

    it('saving the same values (the app sends every field) never triggers the limit', async () => {
        await vendor('shop', { fieldChangedAt: { businessName: ago(1), category: ago(1), businessImage: ago(1) } });
        const res = await save('shop', {
            businessName: 'Old Name', category: 'Food - Bakery', businessImage: 'https://example.com/a.jpg',
            description: 'Fresh bread every morning',
        });
        expect(res.status).toBe(200);
        expect((await fakeDb.collection('vendors').doc('shop').get()).data()?.description).toBe('Fresh bread every morning');
    });

    it('each field has its own clock; filling an empty field is free', async () => {
        await vendor('shop', { category: '', fieldChangedAt: { businessName: ago(2) } });
        expect((await save('shop', { category: 'Food - Bakery' })).status).toBe(200);           // first fill
        expect((await save('shop', { category: 'Food - Catering' })).status).toBe(200);         // first real change
        expect((await save('shop', { category: 'Fashion - Tailor' })).status).toBe(429);        // too soon
        expect((await save('shop', { businessImage: 'https://example.com/b.jpg' })).status).toBe(200);
        expect((await save('shop', { businessName: 'X Name' })).status).toBe(429);
    });

    it('allowed again after 30 days', async () => {
        await vendor('shop', { fieldChangedAt: { businessName: ago(31) } });
        expect((await save('shop', { businessName: 'Fresh Start' })).status).toBe(200);
    });

    it('the limit cannot be dodged through the account route (phone, photo)', async () => {
        await vendor('shop', { fieldChangedAt: { phoneNumber: ago(3), businessImage: ago(3) } });
        const phone = await api().put('/api/auth/user/shop').set('Authorization', bearer('shop')).send({ phoneNumber: '+2348111111111' });
        expect(phone.status).toBe(429);
        const photo = await api().put('/api/auth/user/shop').set('Authorization', bearer('shop')).send({ profileImage: 'https://example.com/z.jpg' });
        expect(photo.status).toBe(429);
        // keeping the photo in step with the store photo is fine
        const same = await api().put('/api/auth/user/shop').set('Authorization', bearer('shop')).send({ profileImage: 'https://example.com/a.jpg', fullName: 'Owner' });
        expect(same.status).toBe(200);
    });

    it('a phone change through the account route starts its clock', async () => {
        await vendor('shop');
        expect((await api().put('/api/auth/user/shop').set('Authorization', bearer('shop')).send({ phoneNumber: '+2348222222222' })).status).toBe(200);
        expect((await api().put('/api/auth/user/shop').set('Authorization', bearer('shop')).send({ phoneNumber: '+2348333333333' })).status).toBe(429);
    });

    it('clients are not limited; admins can override for a store', async () => {
        await seedUser('cli', 'client', { phoneNumber: '+2340000000001' });
        expect((await api().put('/api/auth/user/cli').set('Authorization', bearer('cli')).send({ phoneNumber: '+2340000000002' })).status).toBe(200);
        expect((await api().put('/api/auth/user/cli').set('Authorization', bearer('cli')).send({ phoneNumber: '+2340000000003' })).status).toBe(200);

        await vendor('shop', { fieldChangedAt: { businessName: ago(1) } });
        await seedUser('boss', 'admin');
        expect((await save('shop', { businessName: 'Corrected Name' }, 'boss')).status).toBe(200);
    });

    it('the store tells the app when each field can next change', async () => {
        await vendor('shop', { fieldChangedAt: { category: ago(10), businessName: ago(40) } });
        const res = await api().get('/api/vendors/shop').set('Authorization', bearer('shop'));
        expect(Object.keys(res.body.vendor.fieldLocks)).toEqual(['category']);
    });
});
