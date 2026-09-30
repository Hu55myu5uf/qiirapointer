import supabase from '../config/supabase';

const listVendors = async () => {
    try {
        console.log('Fetching all vendors from Supabase...\n');
        const { data: vendors, error } = await supabase
            .from('vendors')
            .select('*');

        if (error) throw error;

        if (!vendors || vendors.length === 0) {
            console.log('No vendors found in database.');
            process.exit(0);
        }

        console.log(`Found ${vendors.length} vendor(s):\n`);

        vendors.forEach((vendor: any) => {
            console.log(`🏢 Business: ${vendor.business_name || 'N/A'}`);
            console.log(`   Category: ${vendor.category || 'N/A'}`);
            console.log(`   Status: ${vendor.verification_status || 'N/A'}`);
            console.log(`   Active: ${vendor.is_active}`);
            console.log(`   UID: ${vendor.uid}`);
            console.log('---');
        });

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

listVendors();
