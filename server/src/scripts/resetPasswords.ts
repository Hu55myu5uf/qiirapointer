import { auth } from '../config/firebase';

async function reset() {
    const emails = [
        'admin@qiira.com',
        'client@qiira.com',
        'italian.bistro@qiira.com',
        'tech.repair@qiira.com',
        'wellness.clinic@qiira.com',
        'fresh.market@qiira.com'
    ];

    for (const email of emails) {
        try {
            const user = await auth.getUserByEmail(email);
            await auth.updateUser(user.uid, { password: 'password123' });
            console.log('✅ Password set to password123 for:', email);
        } catch (e: any) {
            console.error('❌ Error for', email, e.message);
        }
    }
    process.exit(0);
}

reset();
