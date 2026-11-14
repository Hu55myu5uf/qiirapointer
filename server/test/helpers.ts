import request from 'supertest';
import app from '../src/app';
import { fakeAuth, fakeDb } from './fakes/instances';

export const api = () => request(app);
export { fakeAuth, fakeDb };

/** Authorization header value that the fake auth accepts as `uid`. */
export const bearer = (uid: string) => `Bearer valid:${uid}`;

type Role = 'client' | 'vendor' | 'admin';

/** Create a user in fake Auth + Firestore `users` (and `vendors` for vendors). */
export async function seedUser(uid: string, role: Role = 'client', extra: Record<string, any> = {}) {
    const email = extra.email || `${uid}@example.com`;
    fakeAuth.users.set(uid, { uid, email, displayName: extra.fullName || uid });
    await fakeDb.collection('users').doc(uid).set({
        uid,
        email,
        fullName: extra.fullName || uid,
        role,
        phoneNumber: extra.phoneNumber || null,
        isVerified: false,
        isSuspended: false,
        createdAt: new Date().toISOString(),
        ...extra,
    });
    if (role === 'vendor') {
        await fakeDb.collection('vendors').doc(uid).set({
            uid,
            businessName: extra.businessName || `${uid} Store`,
            category: extra.category || 'Restaurant',
            verificationStatus: extra.verificationStatus || 'approved',
            isActive: true,
            createdAt: new Date().toISOString(),
        });
    }
}
