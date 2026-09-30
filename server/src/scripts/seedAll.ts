import { auth } from '../config/firebase';
import supabase from '../config/supabase';

async function seedAll() {
    console.log('🚀 Seeding test accounts...\n');

    // 1. Admin Account
    try {
        console.log('Creating Admin account: admin@qiira.com...');
        let adminUid: string;
        try {
            const userRecord = await auth.createUser({
                email: 'admin@qiira.com',
                password: 'password123',
                displayName: 'System Admin',
            });
            adminUid = userRecord.uid;
        } catch (e: any) {
            if (e.code === 'auth/email-already-exists') {
                const user = await auth.getUserByEmail('admin@qiira.com');
                adminUid = user.uid;
            } else throw e;
        }

        await supabase.from('users').upsert({
            uid: adminUid,
            email: 'admin@qiira.com',
            full_name: 'System Admin',
            role: 'admin',
            is_verified: true,
        });
        console.log('✅ Admin account ready: admin@qiira.com');
    } catch (err: any) {
        console.error('❌ Error creating Admin:', err.message);
    }

    // 2. Client Account
    try {
        console.log('\nCreating Client account: client@qiira.com...');
        let clientUid: string;
        try {
            const userRecord = await auth.createUser({
                email: 'client@qiira.com',
                password: 'password123',
                displayName: 'John Client',
            });
            clientUid = userRecord.uid;
        } catch (e: any) {
            if (e.code === 'auth/email-already-exists') {
                const user = await auth.getUserByEmail('client@qiira.com');
                clientUid = user.uid;
            } else throw e;
        }

        await supabase.from('users').upsert({
            uid: clientUid,
            email: 'client@qiira.com',
            full_name: 'John Client',
            role: 'client',
            is_verified: true,
        });
        console.log('✅ Client account ready: client@qiira.com');
    } catch (err: any) {
        console.error('❌ Error creating Client:', err.message);
    }

    // 3. Vendor Accounts
    const vendors = [
        {
            email: 'italian.bistro@qiira.com',
            password: 'password123',
            fullName: 'Marco Rossi',
            businessName: 'Italian Bistro',
            category: 'Restaurant',
            description: 'Authentic Italian cuisine with fresh pasta, wood-fired pizzas, and traditional recipes.',
            address: '123 Main Street, Downtown',
            services: 'Dine-in, Takeout, Catering',
            location: { latitude: 9.0579, longitude: 7.4951 },
            rating: 4.8,
            totalReviews: 24,
            isVerified: true,
            status: 'approved'
        },
        {
            email: 'tech.repair@qiira.com',
            password: 'password123',
            fullName: 'Sarah Johnson',
            businessName: 'TechFix Solutions',
            category: 'Technology',
            description: 'Professional computer and smartphone repair services with fast turnaround.',
            address: '456 Tech Avenue, Silicon Valley District',
            services: 'Phone Repair, Computer Repair, Data Recovery',
            location: { latitude: 9.0619, longitude: 7.4991 },
            rating: 4.9,
            totalReviews: 42,
            isVerified: true,
            status: 'approved'
        },
        {
            email: 'wellness.clinic@qiira.com',
            password: 'password123',
            fullName: 'Dr. Emily Chen',
            businessName: 'Wellness Health Clinic',
            category: 'Healthcare',
            description: 'Comprehensive healthcare services including general practice and preventive care.',
            address: '321 Health Boulevard, Medical District',
            services: 'General Practice, Vaccinations, Health Checkups',
            location: { latitude: 9.0599, longitude: 7.4971 },
            rating: 4.7,
            totalReviews: 18,
            isVerified: true,
            status: 'approved'
        },
        {
            email: 'fresh.market@qiira.com',
            password: 'password123',
            fullName: 'Ahmed Ibrahim',
            businessName: 'Fresh Market Groceries',
            category: 'Retail',
            description: 'Your neighborhood grocery store with fresh produce, organic options, and daily specials.',
            address: '789 Market Road, Green Valley',
            services: 'Groceries, Organic Products, Home Delivery',
            location: { latitude: 9.0539, longitude: 7.4911 },
            rating: 4.5,
            totalReviews: 12,
            isVerified: true,
            status: 'approved'
        }
    ];

    console.log('\nCreating sample Vendor accounts...');
    for (const v of vendors) {
        try {
            let vUid: string;
            try {
                const userRecord = await auth.createUser({
                    email: v.email,
                    password: v.password,
                    displayName: v.fullName,
                });
                vUid = userRecord.uid;
            } catch (e: any) {
                if (e.code === 'auth/email-already-exists') {
                    const user = await auth.getUserByEmail(v.email);
                    vUid = user.uid;
                } else throw e;
            }

            await supabase.from('users').upsert({
                uid: vUid,
                email: v.email,
                full_name: v.fullName,
                role: 'vendor',
                is_verified: v.isVerified,
            });

            const pointWkt = `POINT(${v.location.longitude} ${v.location.latitude})`;
            await supabase.from('vendors').upsert({
                uid: vUid,
                business_name: v.businessName,
                category: v.category,
                description: v.description,
                address: v.address,
                services: v.services,
                location: pointWkt,
                verification_status: v.status,
                is_active: true,
                rating: v.rating,
                total_reviews: v.totalReviews,
                documents: [],
                payment_status: 'paid',
            });

            console.log(`✅ Vendor ready: ${v.email} (${v.businessName})`);
        } catch (err: any) {
            console.error(`❌ Error creating vendor ${v.email}:`, err.message);
        }
    }

    console.log('\n🎉 All test accounts seeded successfully!');
    process.exit(0);
}

seedAll();
