import { auth } from '../config/firebase';
import supabase from '../config/supabase';

const additionalVendors = [
    {
        email: 'coffee.corner@qiira.com',
        password: 'password123',
        fullName: 'Maria Santos',
        businessName: 'Coffee Corner Cafe',
        category: 'Restaurant',
        description: 'Cozy coffee shop with artisan brews, fresh pastries, and free WiFi. Perfect spot for work or relaxation.',
        address: '222 Brew Street, Downtown',
        services: 'Coffee, Pastries, Free WiFi, Outdoor Seating',
        location: { latitude: 9.0549, longitude: 7.4921 }
    },
    {
        email: 'auto.service@qiira.com',
        password: 'password123',
        fullName: 'John Mechanic',
        businessName: 'QuickFix Auto Service',
        category: 'Services',
        description: 'Professional auto repair and maintenance. Oil changes, brake service, engine diagnostics, and more.',
        address: '777 Motor Avenue, Industrial Zone',
        services: 'Auto Repair, Oil Change, Tire Service, Diagnostics',
        location: { latitude: 9.0589, longitude: 7.4941 }
    }
];

const addVendors = async () => {
    console.log('🌱 Adding 2 additional vendors...\n');

    for (const vendor of additionalVendors) {
        try {
            console.log(`Creating vendor: ${vendor.businessName}...`);

            // Create user in Firebase Auth
            const userRecord = await auth.createUser({
                email: vendor.email,
                password: vendor.password,
                displayName: vendor.fullName,
            });

            // Create user profile in Supabase
            const { error: userError } = await supabase.from('users').insert({
                uid: userRecord.uid,
                email: vendor.email,
                full_name: vendor.fullName,
                phone_number: null,
                role: 'vendor',
                is_verified: false,
            });

            if (userError) throw userError;

            // Create vendor profile in Supabase
            // Note: PostGIS point coordinates: POINT(longitude latitude)
            const pointWkt = `POINT(${vendor.location.longitude} ${vendor.location.latitude})`;

            const { error: vendorError } = await supabase.from('vendors').insert({
                uid: userRecord.uid,
                business_name: vendor.businessName,
                category: vendor.category,
                description: vendor.description,
                address: vendor.address,
                services: vendor.services,
                location: pointWkt,
                verification_status: 'pending',
                is_active: false,
                documents: [],
                payment_status: 'unpaid',
            });

            if (vendorError) throw vendorError;

            console.log(`✅ Created: ${vendor.businessName}`);
        } catch (error: any) {
            if (error.code === 'auth/email-already-exists') {
                console.log(`⚠️  Skipped: ${vendor.businessName} (already exists)`);
            } else {
                console.error(`❌ Error creating ${vendor.businessName}:`, error.message);
            }
        }
    }

    console.log('\n🎉 Done! You now have 2 more vendors to test rejection.');
    process.exit(0);
};

addVendors();
