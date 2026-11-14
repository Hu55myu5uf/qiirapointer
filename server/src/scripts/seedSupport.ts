import { auth, db } from '../config/firebase';
import { SUPPORT_UID } from '../utils/authMiddleware';

/**
 * The shared "QIIRA Customer Support" identity.
 *
 * Nobody logs in as this account: it is DISABLED in Firebase Auth and has no password.
 * Administrators read and answer its conversations from the admin dashboard; the server only
 * lets admins send messages as Support (see chat.routes.ts).
 */
export const SUPPORT_ACCOUNT = {
    uid: SUPPORT_UID,
    email: process.env.SUPPORT_EMAIL || 'support@qiira.com',
    fullName: 'QIIRA Customer Support',
    displayName: 'QIIRA Customer Support',
    role: 'support',
    isVerified: true,
    isSupport: true,
    profileImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500',
    bio: 'Official Customer Care & Assistance Desk for QIIRAPOINTER.',
    aboutUs: 'Official Customer Care & Assistance Desk for QIIRAPOINTER.',
};

export async function ensureSupportAccount(): Promise<string> {
    // 1. Firebase Auth: make sure the record exists and is disabled (cannot sign in)
    try {
        let existing: any = null;
        try {
            existing = await auth.getUser(SUPPORT_UID);
        } catch (e: any) {
            if (e.code !== 'auth/user-not-found') throw e;
        }

        if (!existing) {
            await auth.createUser({
                uid: SUPPORT_UID,
                displayName: SUPPORT_ACCOUNT.fullName,
                photoURL: SUPPORT_ACCOUNT.profileImage,
                disabled: true,
            });
            console.log('✅ Created disabled Support identity');
        } else if (!existing.disabled) {
            // Older versions created this account with a known password — lock it down
            await auth.updateUser(SUPPORT_UID, { disabled: true });
            await auth.revokeRefreshTokens(SUPPORT_UID);
            console.log('🔒 Disabled sign-in for the Support identity and revoked its sessions');
        }
    } catch (err: any) {
        console.warn('Support identity auth setup note:', err.message);
    }

    // 2. Firestore profile document (role "support" — never "admin")
    try {
        await db.collection('users').doc(SUPPORT_UID).set({
            ...SUPPORT_ACCOUNT,
            isAdmin: false,
            updatedAt: new Date().toISOString(),
        }, { merge: true });
    } catch (fsErr: any) {
        console.warn('Firestore support sync note:', fsErr.message);
    }

    return SUPPORT_UID;
}
