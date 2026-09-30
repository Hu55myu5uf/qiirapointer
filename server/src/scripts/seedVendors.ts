import { auth } from '../config/firebase';
import supabase from '../config/supabase';

interface SampleVendor {
    email: string;
    password: string;
    fullName: string;
    businessName: string;
    category: string;
    description: string;
    address: string;
    services: string;
    location: {
        latitude: number;
        longitude: number;
    };
}

const sampleVendors: SampleVendor[] = [
    {
        email: 'italian.bistro@qiira.com',
        password: 'password123',
        fullName: 'Marco Rossi',
        businessName: 'Italian Bistro',
        category: 'Restaurant',
        description: 'Authentic Italian cuisine with fresh pasta, wood-fired pizzas, and traditional recipes passed down through generations.',
        address: '123 Main Street, Downtown',
        services: 'Dine-in, Takeout, Catering',
        location: { latitude: 9.0579, longitude: 7.4951 }
    },
    {
        email: 'tech.repair@qiira.com',
        password: 'password123',
        fullName: 'Sarah Johnson',
        businessName: 'TechFix Solutions',
        category: 'Technology',
        description: 'Professional computer and smartphone repair services. Same-day service available for most repairs.',
        address: '456 Tech Avenue, Silicon Valley District',
        services: 'Phone Repair, Computer Repair, Data Recovery',
        location: { latitude: 9.0619, longitude: 7.4991 }
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
        location: { latitude: 9.0539, longitude: 7.4911 }
    },
    {
        email: 'wellness.clinic@qiira.com',
        password: 'password123',
        fullName: 'Dr. Emily Chen',
        businessName: 'Wellness Health Clinic',
        category: 'Healthcare',
        description: 'Comprehensive healthcare services including general practice, preventive care, and wellness programs.',
        address: '321 Health Boulevard, Medical District',
        services: 'General Practice, Vaccinations, Health Checkups',
        location: { latitude: 9.0599, longitude: 7.4971 }
    },
    {
        email: 'beauty.spa@qiira.com',
        password: 'password123',
        fullName: 'Lisa Williams',
        businessName: 'Radiance Beauty Spa',
        category: 'Services',
        description: 'Luxury spa and beauty treatments. Relax and rejuvenate with our professional services.',
        address: '555 Spa Lane, Luxury District',
        services: 'Massages, Facials, Hair Styling, Nail Care',
        location: { latitude: 9.0559, longitude: 7.4931 }
    },
    {
        email: 'learning.academy@qiira.com',
        password: 'password123',
        fullName: 'Prof. David Brown',
        businessName: 'Smart Learning Academy',
        category: 'Education',
        description: 'Tutoring and educational services for all ages. Expert instructors in math, science, and languages.',
        address: '888 Knowledge Street, Education Hub',
        services: 'Tutoring, Test Prep, Language Classes',
        location: { latitude: 9.0609, longitude: 7.4961 }
    }
];

const createSampleVendors = async () => {
    console.log('🌱 Starting to seed vendors...\n');

    for (const vendor of sampleVendors) {
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

    console.log('\n🎉 Seeding complete!');
    process.exit(0);
};

createSampleVendors();
