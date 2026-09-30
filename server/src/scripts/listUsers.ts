import supabase from '../config/supabase';

const listUsers = async () => {
    try {
        console.log('Fetching all users from Supabase...\n');
        const { data: users, error } = await supabase
            .from('users')
            .select('*');

        if (error) throw error;

        if (!users || users.length === 0) {
            console.log('No users found in database.');
            process.exit(0);
        }

        console.log(`Found ${users.length} user(s):\n`);

        users.forEach((user: any) => {
            console.log(`📧 Email: ${user.email}`);
            console.log(`   Role: ${user.role}`);
            console.log(`   Name: ${user.full_name}`);
            console.log(`   UID: ${user.uid}`);
            console.log('---');
        });

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

listUsers();
