import dotenv from 'dotenv';
dotenv.config();

import { db } from '../config/firebase';
import supabase from '../config/supabase';

async function revokeAllNonAdminVerifications() {
    console.log('🔄 Starting revocation of all non-admin verifications...');

    // 1. Process Firestore Users
    try {
        const usersSnap = await db.collection('users').get();
        let usersUpdated = 0;
        let adminsPreserved = 0;

        for (const doc of usersSnap.docs) {
            const data = doc.data();
            const role = data.role || 'client';
            const email = data.email || '';
            const isAdmin = role === 'admin' || email.includes('admin');

            if (isAdmin) {
                adminsPreserved++;
                // Ensure admin is verified
                await doc.ref.set({ isVerified: true }, { merge: true });
                console.log(`🛡️ Admin preserved & verified: ${email} (${doc.id})`);
            } else {
                await doc.ref.set({
                    isVerified: false,
                    badgeSubscribedAt: null,
                    badgeExpiresAt: null,
                }, { merge: true });
                usersUpdated++;
            }
        }
        console.log(`✅ Firestore Users processed: ${usersUpdated} revoked, ${adminsPreserved} admins preserved.`);
    } catch (err: any) {
        console.warn('⚠️ Firestore Users revocation error:', err.message);
    }

    // 2. Process Firestore Vendors
    try {
        const vendorsSnap = await db.collection('vendors').get();
        let vendorsUpdated = 0;

        for (const doc of vendorsSnap.docs) {
            const data = doc.data();
            const userDoc = await db.collection('users').doc(doc.id).get();
            const userData = userDoc.exists ? userDoc.data() : null;
            const isAdmin = userData?.role === 'admin';

            if (!isAdmin) {
                await doc.ref.set({
                    isVerified: false,
                    badgeSubscribedAt: null,
                    badgeExpiresAt: null,
                }, { merge: true });
                vendorsUpdated++;
            }
        }
        console.log(`✅ Firestore Vendors processed: ${vendorsUpdated} revoked.`);
    } catch (err: any) {
        console.warn('⚠️ Firestore Vendors revocation error:', err.message);
    }

    // 3. Process Supabase Users
    try {
        const { error: sbUserErr } = await supabase
            .from('users')
            .update({
                is_verified: false,
            })
            .neq('role', 'admin');

        if (sbUserErr) {
            console.warn('⚠️ Supabase users revocation error:', sbUserErr.message);
        } else {
            // Ensure admin is verified in Supabase
            await supabase
                .from('users')
                .update({ is_verified: true })
                .eq('role', 'admin');
            console.log('✅ Supabase non-admin users revoked.');
        }
    } catch (err: any) {
        console.warn('⚠️ Supabase users error:', err.message);
    }

    // 4. Process Supabase Vendors
    try {
        const { error: sbVendorErr } = await supabase
            .from('vendors')
            .update({
                is_verified: false,
            });

        if (sbVendorErr) {
            console.warn('⚠️ Supabase vendors revocation error:', sbVendorErr.message);
        } else {
            console.log('✅ Supabase vendors revoked.');
        }
    } catch (err: any) {
        console.warn('⚠️ Supabase vendors error:', err.message);
    }

    console.log('✨ All non-admin verifications have been successfully revoked!');
    process.exit(0);
}

revokeAllNonAdminVerifications().catch(err => {
    console.error('Fatal error during revocation:', err);
    process.exit(1);
});
