import { auth } from '../config/firebase';
import supabase from '../config/supabase';

const promoteToAdmin = async (email: string) => {
    try {
        console.log(`Looking for user with email: ${email}...`);
        const userRecord = await auth.getUserByEmail(email);

        console.log(`Found user: ${userRecord.uid}`);
        console.log('Updating role to "admin" in Supabase...');

        const { error } = await supabase
            .from('users')
            .update({ role: 'admin' })
            .eq('uid', userRecord.uid);

        if (error) throw error;

        console.log('✅ Success! User promoted to Admin.');
        process.exit(0);
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

// Get email from command line arg
const email = process.argv[2];

if (!email) {
    console.error('Please provide an email address. Usage: ts-node src/scripts/promoteAdmin.ts <email>');
    process.exit(1);
}

promoteToAdmin(email);
