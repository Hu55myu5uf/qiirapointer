/**
 * Give an existing account administrator rights.
 *
 *   ALLOW_DEV_SCRIPTS=yes npx ts-node src/scripts/promoteAdmin.ts someone@example.com
 *
 * Add "--revoke" to turn an administrator back into a client.
 */
import './devGuard';
import { auth, db } from '../config/firebase';

async function main() {
    const email = process.argv[2];
    const revoke = process.argv.includes('--revoke');
    if (!email || email.startsWith('--')) {
        console.error('Usage: ALLOW_DEV_SCRIPTS=yes npx ts-node src/scripts/promoteAdmin.ts <email> [--revoke]');
        process.exit(1);
    }

    const user = await auth.getUserByEmail(email);
    const ref = db.collection('users').doc(user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
        console.error('This account has no QIIRA profile yet. Sign in to the app once first.');
        process.exit(1);
    }
    await ref.set({ role: revoke ? 'client' : 'admin', updatedAt: new Date().toISOString() }, { merge: true });
    await auth.revokeRefreshTokens(user.uid); // the next sign-in picks up the new role
    console.log(revoke ? `✅ ${email} is no longer an administrator.` : `✅ ${email} is now an administrator.`);
    process.exit(0);
}

main().catch(e => {
    console.error('❌', e.message);
    process.exit(1);
});
