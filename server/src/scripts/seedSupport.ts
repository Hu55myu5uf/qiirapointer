import { auth, db } from '../config/firebase';
import supabase from '../config/supabase';

export const SUPPORT_ACCOUNT = {
    uid: 'qiira_official_support',
    email: 'support@qiira.com',
    fullName: 'QIIRA Customer Support',
    displayName: 'QIIRA Customer Support',
    role: 'support',
    isVerified: true,
    isAdmin: true,
    isSupport: true,
    profileImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500',
    bio: 'Official 24/7 Customer Care & Assistance Desk for QIIRAPOINTER.',
    aboutUs: 'Official 24/7 Customer Care & Assistance Desk for QIIRAPOINTER.',
};

export async function ensureSupportAccount(): Promise<string> {
    console.log('🛡️ Ensuring official QIIRA Customer Support account exists...');
    let supportUid = SUPPORT_ACCOUNT.uid;

    // 1. Firebase Auth
    try {
        try {
            const existing = await auth.getUser(supportUid);
            supportUid = existing.uid;
            console.log('✅ Found support account by UID:', supportUid);
        } catch (e: any) {
            if (e.code === 'auth/user-not-found') {
                try {
                    const existingByEmail = await auth.getUserByEmail(SUPPORT_ACCOUNT.email);
                    supportUid = existingByEmail.uid;
                    console.log('✅ Found support account by Email:', supportUid);
                } catch (emailErr: any) {
                    if (emailErr.code === 'auth/user-not-found') {
                        const newRecord = await auth.createUser({
                            uid: SUPPORT_ACCOUNT.uid,
                            email: SUPPORT_ACCOUNT.email,
                            password: 'password123',
                            displayName: SUPPORT_ACCOUNT.fullName,
                            photoURL: SUPPORT_ACCOUNT.profileImage,
                        });
                        supportUid = newRecord.uid;
                        console.log('✅ Created support account in Firebase Auth:', supportUid);
                    } else {
                        console.warn('Firebase Auth email lookup warning:', emailErr.message);
                    }
                }
            } else {
                console.warn('Firebase Auth UID lookup warning:', e.message);
            }
        }
    } catch (err: any) {
        console.warn('Support account auth setup note:', err.message);
    }

    // 2. Firestore users collection
    try {
        await db.collection('users').doc(supportUid).set({
            ...SUPPORT_ACCOUNT,
            uid: supportUid,
            updatedAt: new Date().toISOString(),
        }, { merge: true });
        console.log('✅ Synced support account in Firestore users collection');
    } catch (fsErr: any) {
        console.warn('Firestore support sync note:', fsErr.message);
    }

    // 3. Supabase users table (fallback/sync)
    try {
        await supabase.from('users').upsert({
            uid: supportUid,
            email: SUPPORT_ACCOUNT.email,
            full_name: SUPPORT_ACCOUNT.fullName,
            role: 'support',
            is_verified: true,
            profile_image: SUPPORT_ACCOUNT.profileImage,
        });
        console.log('✅ Synced support account in Supabase');
    } catch (sbErr: any) {
        // Silently skip if Supabase is offline
    }

    return supportUid;
}
