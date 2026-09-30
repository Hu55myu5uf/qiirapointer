import { auth } from '../config/firebase';
import supabase from '../config/supabase';

const deleteAllVendors = async () => {
    try {
        console.log('🗑️  Starting cleanup...\n');

        // Get all users with role 'vendor'
        const { data: vendorUsers, error } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'vendor');

        if (error) throw error;

        console.log(`Found ${(vendorUsers || []).length} vendor user(s) to delete.`);

        for (const user of (vendorUsers || [])) {
            const uid = user.uid;
            try {
                // Delete from Firebase Auth
                await auth.deleteUser(uid);
                
                // Delete from Supabase. Cascade delete takes care of vendors, reviews, favorites, etc.
                const { error: deleteError } = await supabase
                    .from('users')
                    .delete()
                    .eq('uid', uid);
                
                if (deleteError) throw deleteError;
                console.log(`✅ Deleted vendor user: ${user.email}`);
            } catch (err: any) {
                console.log(`⚠️  Could not delete user ${uid}: ${err.message}`);
            }
        }

        console.log('\n🎉 Cleanup complete! All vendors have been removed.');
        process.exit(0);
    } catch (error: any) {
        console.error('❌ Error during cleanup:', error.message);
        process.exit(1);
    }
};

deleteAllVendors();
