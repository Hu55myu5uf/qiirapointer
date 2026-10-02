import { Router, Request, Response, NextFunction } from 'express';
import supabase from '../config/supabase';
import { db, auth } from '../config/firebase';

const router = Router();

// ──── Verified Badge Definition (replaces old tier system) ────
export const VERIFIED_BADGE = {
    price: 3000,
    currency: '₦',
    period: '/month',
    badgeColor: '#B28A45',    // QIIRA golden accent
    icon: 'checkmark-circle',
    features: [
        'Verified badge on your profile',
        'Increased trust & credibility',
        'Stand out to customers',
        'Priority in search results',
    ],
};

const DEFAULT_CATEGORY_IMAGES: Record<string, { image: string; banner: string }> = {
    'restaurant': {
        image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500&auto=format&fit=crop&q=80',
        banner: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
    },
    'restaurants & cafes': {
        image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500&auto=format&fit=crop&q=80',
        banner: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
    },
    'technology': {
        image: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=500&auto=format&fit=crop&q=80',
        banner: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80',
    },
    'technology & electronics': {
        image: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=500&auto=format&fit=crop&q=80',
        banner: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80',
    },
    'retail': {
        image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80',
        banner: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&auto=format&fit=crop&q=80',
    },
    'retail & shopping': {
        image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80',
        banner: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&auto=format&fit=crop&q=80',
    },
    'healthcare': {
        image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=500&auto=format&fit=crop&q=80',
        banner: 'https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=1200&auto=format&fit=crop&q=80',
    },
    'health & wellness': {
        image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=500&auto=format&fit=crop&q=80',
        banner: 'https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=1200&auto=format&fit=crop&q=80',
    },
    'beauty & spa': {
        image: 'https://images.unsplash.com/photo-1560750588-73207b1ef5b8?w=500&auto=format&fit=crop&q=80',
        banner: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1200&auto=format&fit=crop&q=80',
    },
    'automotive services': {
        image: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=500&auto=format&fit=crop&q=80',
        banner: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=1200&auto=format&fit=crop&q=80',
    },
};

export const MEMORY_VENDORS: any[] = [];
export const SAMPLE_VENDORS: any[] = [];

function getFallbackVendorImages(category?: string) {
    const cat = (category || 'restaurant').toLowerCase();
    return DEFAULT_CATEGORY_IMAGES[cat] || DEFAULT_CATEGORY_IMAGES['restaurant'];
}

// Helper mapper to convert database snake_case to client camelCase
function mapVendor(v: any) {
    if (!v) return null;
    
    // Parse location if it exists
    let location: { latitude: number; longitude: number } | null = null;
    if (v.location) {
        if (typeof v.location === 'object') {
            if (Array.isArray(v.location.coordinates)) {
                location = {
                    latitude: Number(v.location.coordinates[1]),
                    longitude: Number(v.location.coordinates[0])
                };
            } else if (v.location.latitude !== undefined && v.location.longitude !== undefined) {
                location = {
                    latitude: Number(v.location.latitude),
                    longitude: Number(v.location.longitude)
                };
            } else if (v.location._latitude !== undefined && v.location._longitude !== undefined) {
                location = {
                    latitude: Number(v.location._latitude),
                    longitude: Number(v.location._longitude)
                };
            }
        } else if (typeof v.location === 'string') {
            try {
                const geo = JSON.parse(v.location);
                if (Array.isArray(geo.coordinates)) {
                    location = {
                        latitude: Number(geo.coordinates[1]),
                        longitude: Number(geo.coordinates[0])
                    };
                } else if (geo.latitude !== undefined && geo.longitude !== undefined) {
                    location = {
                        latitude: Number(geo.latitude),
                        longitude: Number(geo.longitude)
                    };
                }
            } catch (e) {
                console.error('Failed to parse location string:', e);
            }
        }
    } else if (v.latitude !== undefined && v.longitude !== undefined && v.latitude !== null && v.longitude !== null) {
        location = {
            latitude: Number(v.latitude),
            longitude: Number(v.longitude)
        };
    }

    // If still null, generate a deterministic Nigeria location so vendor renders on map
    if (!location) {
        const hash = (v.uid || v.id || v.business_name || 'vendor')
            .split('')
            .reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
        const latOffset = ((hash % 100) - 50) * 0.002;
        const lngOffset = (((hash * 7) % 100) - 50) * 0.002;
        location = {
            latitude: 6.5244 + latOffset, // Lagos epicenter
            longitude: 3.3792 + lngOffset
        };
    }

    const fallback = getFallbackVendorImages(v.category);
    const businessImage = v.business_image || v.businessImage || fallback.image;
    const bannerImage = v.banner_image || v.bannerImage || fallback.banner;

    // Handle v.users whether it's an array (Supabase join) or object
    const userObj = Array.isArray(v.users) ? v.users[0] : (v.users || null);

    // Resolve verified badge status (check vendor table, vendor doc, or associated user)
    const isAdmin = Boolean(
        userObj?.role === 'admin' ||
        v.role === 'admin' ||
        (v.uid === 'v8MwaOet0ISfZAWXIDAPAGcg1td2') ||
        (v.id === 'v8MwaOet0ISfZAWXIDAPAGcg1td2') ||
        (v.email && String(v.email).includes('admin')) ||
        (userObj?.email && String(userObj.email).includes('admin'))
    );

    const isVerified = Boolean(
        v.is_verified === true ||
        v.isVerified === true ||
        userObj?.is_verified === true ||
        userObj?.isVerified === true ||
        isAdmin
    );

    return {
        id: v.uid || v.id,
        uid: v.uid || v.id,
        businessName: v.business_name || v.businessName || 'Vendor',
        category: v.category || 'Restaurant',
        description: v.description || '',
        address: v.address || '',
        services: v.services || [],
        location,
        businessImage,
        bannerImage,
        businessHours: v.business_hours || v.businessHours,
        verificationStatus: v.verification_status || v.verificationStatus || 'approved',
        isVerified,
        is_verified: isVerified,
        isAdmin,
        role: isAdmin ? 'admin' : (v.role || userObj?.role || 'vendor'),
        badgeExpiresAt: v.badge_expires_at || v.badgeExpiresAt || null,
        badgeSubscribedAt: v.badge_subscribed_at || v.badgeSubscribedAt || null,
        isActive: v.is_active ?? v.isActive ?? true,
        documents: v.documents || [],
        paymentStatus: v.payment_status,
        paymentReference: v.payment_reference,
        paymentAmount: v.payment_amount,
        paidAt: v.paid_at,
        averageRating: Number(v.average_rating || v.averageRating || 4.5),
        totalReviews: Number(v.total_reviews || v.totalReviews || 0),
        rejectionReason: v.rejection_reason,
        verifiedAt: v.verified_at,
        createdAt: v.created_at || v.createdAt,
        updatedAt: v.updated_at || v.updatedAt,
        distanceMeters: v.distance_meters,
        userInfo: userObj ? {
            uid: userObj.uid,
            email: userObj.email,
            fullName: userObj.full_name || userObj.fullName || v.business_name || v.businessName,
            phoneNumber: userObj.phone_number || userObj.phoneNumber,
            role: userObj.role || (isAdmin ? 'admin' : 'vendor'),
            isAdmin,
            isVerified: Boolean(userObj.is_verified === true || userObj.isVerified === true || isAdmin),
            profileImage: userObj.profile_image || userObj.profileImage || businessImage
        } : null
    };
}

function withTimeout(promise: any, ms = 1500): Promise<any> {
    return Promise.race([
        Promise.resolve(promise),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
    ]);
}

/**
 * @route   GET /api/vendors
 * @desc    Get all verified vendors (with filters)
 * @access  Public
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const { category, search, latitude, longitude, radius } = req.query;

        let vendors: any[] = [];

        // Try Supabase with 1.5s timeout
        try {
            if (latitude && longitude) {
                const lat = parseFloat(latitude as string);
                const lng = parseFloat(longitude as string);
                const rad = radius ? parseFloat(radius as string) : 50000;

                const result = await withTimeout(supabase.rpc('search_vendors', {
                    lat,
                    lng,
                    radius_meters: rad,
                    category_filter: (category as string) || null,
                    search_filter: (search as string) || null
                }), 1500);

                if (result?.data) {
                    vendors = result.data;
                }
            } else {
                let query = supabase
                    .from('vendors')
                    .select('*, users(*)');

                if (category && category !== 'All') {
                    const catStr = String(category).toLowerCase();
                    const cleanWord = catStr.split('&')[0].trim().split(' ')[0].trim();
                    query = query.or(`category.ilike.%${cleanWord}%,category.ilike.%${catStr}%`);
                }

                if (search) {
                    const searchTerm = `%${(search as string).toLowerCase()}%`;
                    query = query.or(`business_name.ilike.${searchTerm},description.ilike.${searchTerm}`);
                }

                const result = await withTimeout(query, 1500);
                if (result?.data) {
                    vendors = result.data;
                }
            }
        } catch (_) {}

        // Cross-reference Firestore to ensure any Firestore verifications / updates are merged (with 1000ms timeout)
        try {
            const [fsVendorsSnap, fsUsersSnap]: any = await Promise.all([
                withTimeout(db.collection('vendors').get(), 1000).catch(() => null),
                withTimeout(db.collection('users').get(), 1000).catch(() => null),
            ]);

            const fsVendorMap = new Map<string, any>();
            const fsUserMap = new Map<string, any>();

            if (fsVendorsSnap?.docs) {
                fsVendorsSnap.forEach((doc: any) => fsVendorMap.set(doc.id, doc.data()));
            }
            if (fsUsersSnap?.docs) {
                fsUsersSnap.forEach((doc: any) => fsUserMap.set(doc.id, doc.data()));
            }

            // Also include any Firestore-only vendors that might not be in Supabase
            if (fsVendorsSnap?.docs) {
                fsVendorsSnap.forEach((doc: any) => {
                    const id = doc.id;
                    const existsInSupabase = vendors.some(v => v.uid === id || v.id === id);
                    if (!existsInSupabase) {
                        const d = doc.data();
                        vendors.push({
                            uid: id,
                            id: id,
                            ...d,
                            business_name: d.businessName || d.business_name,
                            business_image: d.businessImage || d.business_image,
                            banner_image: d.bannerImage || d.banner_image,
                            is_verified: d.isVerified ?? d.is_verified ?? false,
                        });
                    }
                });
            }

            // Also include any users who registered as vendor
            if (fsUsersSnap?.docs) {
                fsUsersSnap.forEach((doc: any) => {
                    const u = doc.data();
                    if (u.role === 'vendor') {
                        const id = doc.id;
                        const exists = vendors.some(v => v.uid === id || v.id === id);
                        if (!exists) {
                            const fV = fsVendorMap.get(id);
                            vendors.push({
                                uid: id,
                                id: id,
                                business_name: fV?.businessName || fV?.business_name || u.businessName || u.business_name || u.fullName || 'Vendor Store',
                                category: fV?.category || u.category || 'Retail',
                                description: fV?.description || u.description || '',
                                address: fV?.address || u.address || '',
                                services: fV?.services || u.services || [],
                                business_image: fV?.businessImage || fV?.business_image || u.profileImage || '',
                                banner_image: fV?.bannerImage || fV?.banner_image || u.bannerImage || '',
                                is_verified: fV?.isVerified ?? fV?.is_verified ?? u.isVerified ?? u.is_verified ?? false,
                                verification_status: fV?.verificationStatus || fV?.verification_status || u.verificationStatus || 'pending',
                                isActive: true,
                            });
                        }
                    }
                });
            }

            vendors = vendors.map(v => {
                const fVendor = fsVendorMap.get(v.uid || v.id);
                const fUser = fsUserMap.get(v.uid || v.id);
                const userObj = Array.isArray(v.users) ? v.users[0] : (v.users || null);
                const isVerified = Boolean(
                    v.is_verified === true ||
                    v.isVerified === true ||
                    fVendor?.isVerified === true ||
                    fVendor?.is_verified === true ||
                    fUser?.isVerified === true ||
                    fUser?.is_verified === true ||
                    fUser?.role === 'admin' ||
                    userObj?.is_verified === true ||
                    userObj?.isVerified === true ||
                    userObj?.role === 'admin' ||
                    v.role === 'admin'
                );

                return {
                    ...v,
                    is_verified: isVerified,
                    isVerified: isVerified,
                    verification_status: v.verification_status || v.verificationStatus || fVendor?.verificationStatus || fVendor?.verification_status || fUser?.verificationStatus || fUser?.verification_status || 'approved',
                    verificationStatus: v.verification_status || v.verificationStatus || fVendor?.verificationStatus || fVendor?.verification_status || fUser?.verificationStatus || fUser?.verification_status || 'approved',
                    business_name: fVendor?.businessName || fVendor?.business_name || v.business_name || fUser?.businessName || fUser?.fullName,
                    category: fVendor?.category || v.category || fUser?.category,
                    description: fVendor?.description || v.description || fUser?.description,
                };
            });
        } catch (enrichErr: any) {
            console.warn('Enrich vendors error:', enrichErr.message);
        }

        let mappedVendors = vendors
            .map(mapVendor)
            .filter((v: any) => v && (v.verificationStatus === 'approved' || v.isVerified === true));

        if (category && category !== 'All') {
            const catStr = String(category).toLowerCase();
            const rootWord = catStr.split('&')[0].trim().split(' ')[0].trim();
            mappedVendors = mappedVendors.filter((v: any) => {
                const vCat = String(v.category || '').toLowerCase();
                return vCat.includes(catStr) || catStr.includes(vCat) || (rootWord.length > 3 && vCat.includes(rootWord));
            });
        }

        res.status(200).json({ vendors: mappedVendors, count: mappedVendors.length });
    } catch (error: any) {
        console.warn('Supabase vendor query failed, attempting Firestore fallback:', error.message);
        try {
            const snap = await db.collection('vendors').get();
            const usersSnap = await db.collection('users').get().catch(() => null);
            const userMap = new Map<string, any>();
            if (usersSnap) {
                usersSnap.forEach(u => userMap.set(u.id, u.data()));
            }

            let fsVendors: any[] = [];
            snap.forEach(doc => {
                const d = doc.data();
                const u = userMap.get(doc.id);
                const fallback = getFallbackVendorImages(d.category);
                const isVerified = Boolean(
                    d.isVerified === true ||
                    d.is_verified === true ||
                    u?.isVerified === true ||
                    u?.is_verified === true ||
                    (u?.role === 'admin')
                );
                fsVendors.push({
                    id: doc.id,
                    uid: doc.id,
                    businessName: d.businessName || d.business_name || u?.businessName || u?.fullName || 'Vendor',
                    category: d.category || u?.category || 'Retail',
                    description: d.description || u?.description || '',
                    address: d.address || u?.address || '',
                    services: d.services || u?.services || [],
                    location: d.location || null,
                    businessImage: d.businessImage || d.business_image || u?.profileImage || fallback.image,
                    bannerImage: d.bannerImage || d.banner_image || u?.bannerImage || fallback.banner,
                    averageRating: Number(d.averageRating || d.average_rating || 4.5),
                    totalReviews: Number(d.totalReviews || d.total_reviews || 0),
                    isActive: d.isActive ?? true,
                    verificationStatus: d.verificationStatus || d.verification_status || u?.verificationStatus || u?.verification_status || 'approved',
                    isVerified,
                    is_verified: isVerified,
                    badgeExpiresAt: d.badgeExpiresAt || null,
                    badgeSubscribedAt: d.badgeSubscribedAt || null,
                });
            });

            // Also check users collection for vendors not in vendors collection
            if (usersSnap) {
                usersSnap.forEach(uDoc => {
                    const u = uDoc.data();
                    if (u.role === 'vendor' && !fsVendors.some(v => v.id === uDoc.id)) {
                        const isVerified = Boolean(u.isVerified === true || u.is_verified === true || u.role === 'admin');
                        const fallback = getFallbackVendorImages(u.category);
                        fsVendors.push({
                            id: uDoc.id,
                            uid: uDoc.id,
                            businessName: u.businessName || u.fullName || 'Vendor Store',
                            category: u.category || 'Retail',
                            description: u.description || '',
                            address: u.address || '',
                            services: u.services || [],
                            businessImage: u.profileImage || fallback.image,
                            bannerImage: u.bannerImage || fallback.banner,
                            averageRating: 5.0,
                            totalReviews: 0,
                            isActive: true,
                            verificationStatus: u.verificationStatus || u.verification_status || 'approved',
                            isVerified,
                            is_verified: isVerified,
                        });
                    }
                });
            }

            // Filter to only include approved vendors for public browsing
            fsVendors = fsVendors.filter(v => v && (v.verificationStatus === 'approved' || v.isVerified === true));

            const { category, search } = req.query;
            if (category && category !== 'All') {
                const catStr = String(category).toLowerCase();
                const rootWord = catStr.split('&')[0].trim().split(' ')[0].trim();
                fsVendors = fsVendors.filter(v => {
                    const vCat = String(v.category || '').toLowerCase();
                    return vCat.includes(catStr) || catStr.includes(vCat) || (rootWord.length > 3 && vCat.includes(rootWord));
                });
            }
            if (search) {
                const s = (search as string).toLowerCase();
                fsVendors = fsVendors.filter(v => 
                    v.businessName?.toLowerCase().includes(s) || 
                    v.description?.toLowerCase().includes(s)
                );
            }

            return res.status(200).json({ vendors: fsVendors, count: fsVendors.length });
        } catch (fsErr: any) {
            console.error('Firestore fallback failed:', fsErr);
            res.status(500).json({ error: 'Failed to retrieve vendors', message: error.message });
        }
    }
});

/**
 * @route   GET /api/vendors/:id
 * @desc    Get vendor by ID
 * @access  Public
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        let vendorData: any = null;

        try {
            const result = await withTimeout(supabase
                .from('vendors')
                .select('*, users(*)')
                .eq('uid', id)
                .single(), 1500);

            if (result?.data) {
                vendorData = result.data;
            }
        } catch (_) {}

        // Fetch Firestore documents (vendors & users) to merge with timeout
        let fsVendor: any = null;
        let fsUser: any = null;
        try {
            const [vDoc, uDoc] = await Promise.all([
                withTimeout(db.collection('vendors').doc(id).get(), 2000).catch(() => null),
                withTimeout(db.collection('users').doc(id).get(), 2000).catch(() => null),
            ]);
            if (vDoc && vDoc.exists) fsVendor = vDoc.data();
            if (uDoc && uDoc.exists) fsUser = uDoc.data();

            // Also check where uid == id if not found by direct doc key
            if (!fsVendor) {
                const vByUid = await withTimeout(db.collection('vendors').where('uid', '==', id).get(), 1500).catch(() => null);
                if (vByUid && !vByUid.empty) fsVendor = vByUid.docs[0].data();
            }
            if (!fsUser) {
                const uByUid = await withTimeout(db.collection('users').where('uid', '==', id).get(), 1500).catch(() => null);
                if (uByUid && !uByUid.empty) fsUser = uByUid.docs[0].data();
            }
        } catch (_) {}

        // Fallback to Firebase Auth user if not found in db collections
        let fbUser: any = null;
        if (!vendorData && !fsVendor && !fsUser) {
            try {
                fbUser = await withTimeout(auth.getUser(id), 2000).catch(() => null);
            } catch (_) {}
        }

        if (vendorData || fsVendor || fsUser || fbUser) {
            const userObj = Array.isArray(vendorData?.users) ? vendorData.users[0] : (vendorData?.users || null);
            const isVendorAdmin = Boolean(
                fsUser?.role === 'admin' ||
                userObj?.role === 'admin' ||
                vendorData?.role === 'admin' ||
                id === 'v8MwaOet0ISfZAWXIDAPAGcg1td2' ||
                (fsUser?.email && String(fsUser.email).includes('admin')) ||
                (userObj?.email && String(userObj.email).includes('admin')) ||
                (fbUser?.email && String(fbUser.email).includes('admin'))
            );

            const isVerified = Boolean(
                vendorData?.is_verified === true ||
                vendorData?.isVerified === true ||
                fsVendor?.isVerified === true ||
                fsVendor?.is_verified === true ||
                fsUser?.isVerified === true ||
                fsUser?.is_verified === true ||
                userObj?.is_verified === true ||
                userObj?.isVerified === true ||
                isVendorAdmin
            );

            const verificationStatus = (
                vendorData?.verification_status ||
                vendorData?.verificationStatus ||
                fsVendor?.verificationStatus ||
                fsVendor?.verification_status ||
                fsUser?.verificationStatus ||
                fsUser?.verification_status ||
                'approved'
            );

            const category = fsVendor?.category || vendorData?.category || fsUser?.category || 'Retail';
            const fallback = getFallbackVendorImages(category);
            const businessImage = fsVendor?.businessImage || fsVendor?.business_image || vendorData?.business_image || vendorData?.businessImage || fsUser?.profileImage || fbUser?.photoURL || fallback.image;
            const bannerImage = fsVendor?.bannerImage || fsVendor?.banner_image || vendorData?.banner_image || vendorData?.bannerImage || fsUser?.bannerImage || fallback.banner;
            const businessName = fsVendor?.businessName || fsVendor?.business_name || vendorData?.business_name || fsUser?.businessName || fsUser?.fullName || fbUser?.displayName || fbUser?.email?.split('@')[0] || 'Vendor Store';

            const merged = {
                id: id,
                uid: id,
                businessName,
                category,
                description: fsVendor?.description || vendorData?.description || fsUser?.description || '',
                address: fsVendor?.address || vendorData?.address || fsUser?.address || '',
                services: fsVendor?.services || vendorData?.services || fsUser?.services || [],
                location: vendorData?.location || fsVendor?.location || null,
                businessImage,
                bannerImage,
                businessHours: fsVendor?.businessHours || vendorData?.business_hours || vendorData?.businessHours,
                averageRating: Number(vendorData?.average_rating || fsVendor?.averageRating || 4.5),
                totalReviews: Number(vendorData?.total_reviews || fsVendor?.totalReviews || 0),
                isActive: vendorData?.is_active ?? fsVendor?.isActive ?? true,
                verificationStatus,
                isVerified,
                is_verified: isVerified,
                isAdmin: isVendorAdmin,
                role: isVendorAdmin ? 'admin' : (fsUser?.role || userObj?.role || 'vendor'),
                badgeExpiresAt: fsVendor?.badgeExpiresAt || vendorData?.badge_expires_at || null,
                badgeSubscribedAt: fsVendor?.badgeSubscribedAt || vendorData?.badge_subscribed_at || null,
                userInfo: {
                    uid: id,
                    email: fsUser?.email || userObj?.email || fbUser?.email || '',
                    fullName: fsUser?.fullName || fsUser?.displayName || userObj?.full_name || fbUser?.displayName || businessName,
                    phoneNumber: fsUser?.phoneNumber || userObj?.phone_number || fbUser?.phoneNumber || '',
                    role: fsUser?.role || userObj?.role || (isVendorAdmin ? 'admin' : 'vendor'),
                    isAdmin: isVendorAdmin,
                    isVerified: isVerified,
                    profileImage: fsUser?.profileImage || userObj?.profile_image || fbUser?.photoURL || businessImage
                }
            };

            return res.status(200).json({ vendor: merged });
        }

        return res.status(404).json({ error: 'Vendor not found' });
    } catch (error: any) {
        console.error('Get vendor error:', error);
        res.status(500).json({ error: 'Failed to retrieve vendor', message: error.message });
    }
});

/**
 * @route   PUT /api/vendors/:id/profile
 * @desc    Update vendor profile
 * @access  Private (Vendor only)
 */
router.put('/:id/profile', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const {
            businessName,
            category,
            description,
            address,
            services,
            location,
            businessHours,
            businessImage,
            bannerImage
        } = req.body;

        // 1. Primary write to Firestore
        const fsUpdate: any = {
            updatedAt: new Date().toISOString()
        };

        if (businessName !== undefined) {
            fsUpdate.businessName = businessName;
            fsUpdate.business_name = businessName;
        }
        if (category !== undefined) fsUpdate.category = category;
        if (description !== undefined) fsUpdate.description = description;
        if (address !== undefined) fsUpdate.address = address;
        if (services !== undefined) fsUpdate.services = services;
        if (location !== undefined) fsUpdate.location = location;
        if (businessHours !== undefined) {
            fsUpdate.businessHours = businessHours;
            fsUpdate.business_hours = businessHours;
        }
        if (businessImage !== undefined) {
            fsUpdate.businessImage = businessImage;
            fsUpdate.business_image = businessImage;
        }
        if (bannerImage !== undefined) {
            fsUpdate.bannerImage = bannerImage;
            fsUpdate.banner_image = bannerImage;
        }

        try {
            await db.collection('vendors').doc(id).set(fsUpdate, { merge: true });
            
            // Also sync business name & profile image to users collection
            const userUpdate: any = { updatedAt: new Date().toISOString() };
            if (businessName) userUpdate.fullName = businessName;
            if (businessImage) userUpdate.profileImage = businessImage;
            await db.collection('users').doc(id).set(userUpdate, { merge: true });
        } catch (fsErr: any) {
            console.warn('Firestore vendor update warning:', fsErr.message);
        }

        // 2. Fallback to Supabase if available
        try {
            const updateData: any = {};
            if (businessName) updateData.business_name = businessName;
            if (category) updateData.category = category;
            if (description) updateData.description = description;
            if (address) updateData.address = address;
            if (services) updateData.services = services;
            
            if (location && location.latitude && location.longitude) {
                updateData.location = `POINT(${location.longitude} ${location.latitude})`;
            }
            
            if (businessImage) updateData.business_image = businessImage;
            if (bannerImage) updateData.banner_image = bannerImage;
            if (businessHours) updateData.business_hours = businessHours;

            await supabase
                .from('vendors')
                .update(updateData)
                .eq('uid', id);
        } catch (_) {}

        res.status(200).json({ message: 'Profile updated successfully' });
    } catch (error: any) {
        console.error('Update vendor error:', error);
        res.status(500).json({ error: 'Failed to update profile', message: error.message });
    }
});

/**
 * @route   POST /api/vendors/:id/verification-documents
 * @route   POST /api/vendors/:id/documents (when documentUrls array is provided)
 * @desc    Upload verification documents
 * @access  Private (Vendor only)
 */
router.post(['/:id/verification-documents', '/:id/documents'], async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { documentUrls } = req.body;

        // If this is a menu document request (has title/url instead of documentUrls), pass through to menu document handler
        if (!documentUrls && (req.body.title || req.body.url)) {
            return next();
        }

        if (!documentUrls || !Array.isArray(documentUrls)) {
            return res.status(400).json({ error: 'Document URLs are required' });
        }

        const { error } = await supabase
            .from('vendors')
            .update({
                documents: documentUrls,
                verification_status: 'pending'
            })
            .eq('uid', id);

        if (error) throw error;

        res.status(200).json({ message: 'Documents uploaded successfully' });
    } catch (error: any) {
        console.error('Upload documents error:', error);
        res.status(500).json({ error: 'Failed to upload documents', message: error.message });
    }
});

/**
 * @route   POST /api/vendors/:id/payment
 * @desc    Process verification fee payment
 * @access  Private (Vendor only)
 */
router.post('/:id/payment', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { paymentReference, amount } = req.body;

        // TODO: Verify payment with Paystack/Stripe API

        const { error } = await supabase
            .from('vendors')
            .update({
                payment_status: 'paid',
                payment_reference: paymentReference,
                payment_amount: amount,
                paid_at: new Date().toISOString()
            })
            .eq('uid', id);

        if (error) throw error;

        res.status(200).json({ message: 'Payment processed successfully' });
    } catch (error: any) {
        console.error('Payment error:', error);
        res.status(500).json({ error: 'Failed to process payment', message: error.message });
    }
});

/**
 * @route   POST /api/vendors/upload-image
 * @desc    Upload image (Base64) and save locally (for testing without Firebase Storage)
 * @access  Private (Vendor only)
 */
router.post('/upload-image', async (req: Request, res: Response) => {
    try {
        const { userId, imageData, imageType } = req.body; // imageType: 'profile' or 'banner'

        if (!userId || !imageData || !imageType) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const fs = require('fs');
        const path = require('path');

        // Create uploads directory structure
        const uploadsDir = path.join(__dirname, '../../uploads/vendors', userId);
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // Generate filename
        const filename = `${imageType}_${Date.now()}.jpg`;
        const filepath = path.join(uploadsDir, filename);

        // Decode Base64 and save
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(filepath, base64Data, 'base64');

        // Return accessible URL using the host from the request
        const protocol = req.protocol || 'http';
        const host = req.get('host') || 'localhost:5000';
        const imageUrl = `${protocol}://${host}/uploads/vendors/${userId}/${filename}`;

        res.status(200).json({ imageUrl });
    } catch (error: any) {
        console.error('Upload image error:', error);
        res.status(500).json({ error: 'Failed to upload image', message: error.message });
    }
});

/**
 * @route   POST /api/vendors/upload-document
 * @desc    Upload document/PDF (Base64) and save locally
 * @access  Private (Vendor only)
 */
router.post('/upload-document', async (req: Request, res: Response) => {
    try {
        const { userId, fileData, fileName, fileType } = req.body;

        if (!userId || !fileData) {
            return res.status(400).json({ error: 'Missing required fields (userId, fileData)' });
        }

        const fs = require('fs');
        const path = require('path');

        // Create uploads directory structure
        const uploadsDir = path.join(__dirname, '../../uploads/vendors', userId, 'documents');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // Sanitize and generate unique filename
        const safeName = (fileName || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
        const ext = path.extname(safeName) || '.pdf';
        const baseName = path.basename(safeName, ext);
        const uniqueFilename = `${baseName}_${Date.now()}${ext}`;
        const filepath = path.join(uploadsDir, uniqueFilename);

        // Decode Base64 and save
        const base64Data = fileData.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(filepath, buffer);

        // Return accessible URL
        const protocol = req.protocol || 'http';
        const host = req.get('host') || 'localhost:5000';
        const fileUrl = `${protocol}://${host}/uploads/vendors/${userId}/documents/${uniqueFilename}`;

        res.status(200).json({
            fileUrl,
            fileName: safeName,
            fileSize: buffer.length,
            fileType: fileType || 'application/pdf',
        });
    } catch (error: any) {
        console.error('Upload document error:', error);
        res.status(500).json({ error: 'Failed to upload document', message: error.message });
    }
});

/**
 * @route   GET /api/vendors/:id/reviews
 * @desc    Get all reviews for a vendor
 * @access  Public
 */
router.get('/:id/reviews', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // 1. Fetch reviews with reviewer details from Supabase
        let mappedReviews: any[] = [];
        try {
            const result = await withTimeout(
                supabase
                    .from('reviews')
                    .select('*, users!reviews_client_id_fkey(id, full_name, email, avatar_url, is_verified, role)')
                    .eq('vendor_id', id)
                    .order('created_at', { ascending: false }),
                1200
            );

            if (result?.data) {
                mappedReviews = (result.data || []).map((r: any) => {
                    const userObj = Array.isArray(r.users) ? r.users[0] : (r.users || null);
                    const reviewerName = userObj?.full_name || userObj?.email?.split('@')[0] || 'Anonymous';
                    return {
                        id: r.id,
                        rating: r.rating,
                        comment: r.comment,
                        createdAt: r.created_at,
                        clientName: reviewerName,
                        reviewerName: reviewerName,
                        reviewerAvatar: userObj?.avatar_url || null,
                        isVerified: Boolean(userObj?.is_verified),
                        isAdmin: userObj?.role === 'admin'
                    };
                });
            }
        } catch (_) {}

        // 2. Also check Firestore reviews
        try {
            const [vRevSnap, rootRevSnap]: any = await Promise.all([
                withTimeout(db.collection('vendors').doc(id).collection('reviews').get(), 1000).catch(() => null),
                withTimeout(db.collection('reviews').where('vendorId', '==', id).get(), 1000).catch(() => null),
            ]);

            const fsReviews: any[] = [];
            if (vRevSnap?.docs) {
                vRevSnap.docs.forEach((doc: any) => fsReviews.push({ id: doc.id, ...doc.data() }));
            }
            if (rootRevSnap?.docs) {
                rootRevSnap.docs.forEach((doc: any) => {
                    if (!fsReviews.some(r => r.id === doc.id)) {
                        fsReviews.push({ id: doc.id, ...doc.data() });
                    }
                });
            }

            for (const fr of fsReviews) {
                if (!mappedReviews.some(r => r.id === fr.id)) {
                    mappedReviews.push({
                        id: fr.id,
                        rating: fr.rating || 5,
                        comment: fr.comment || '',
                        createdAt: fr.createdAt || fr.created_at || new Date().toISOString(),
                        clientName: fr.clientName || fr.userName || 'Client',
                        reviewerName: fr.clientName || fr.userName || 'Client',
                        reviewerAvatar: fr.clientAvatar || fr.userAvatar || fr.reviewerAvatar || null,
                        clientId: fr.clientId || fr.userId,
                        isVerified: Boolean(fr.isVerified),
                        isAdmin: Boolean(fr.isAdmin),
                    });
                }
            }
        } catch (_) {}

        // 3. Enrich reviewer avatars from users collection for any missing avatar
        const missingUserIds = mappedReviews
            .filter(r => !r.reviewerAvatar && (r.clientId || r.id))
            .map(r => r.clientId || r.id);

        if (missingUserIds.length > 0) {
            try {
                const userDocs = await Promise.all(
                    missingUserIds.slice(0, 15).map(uid => db.collection('users').doc(uid).get().catch(() => null))
                );
                const userAvatarMap = new Map<string, string>();
                userDocs.forEach(ud => {
                    if (ud && ud.exists) {
                        const d = ud.data()!;
                        const av = d.profileImage || d.profile_image || d.photoURL || d.avatar;
                        if (av) userAvatarMap.set(ud.id, av);
                    }
                });

                mappedReviews = mappedReviews.map(r => {
                    if (!r.reviewerAvatar && (r.clientId || r.id)) {
                        const av = userAvatarMap.get(r.clientId || r.id);
                        if (av) return { ...r, reviewerAvatar: av };
                    }
                    return r;
                });
            } catch (_) {}
        }

        res.status(200).json({ reviews: mappedReviews });
    } catch (error: any) {
        console.error('Get vendor reviews error:', error);
        res.status(200).json({ reviews: [] });
    }
});

/**
 * @route   GET /api/vendors/:id/comments
 * @desc    Get all post comments received across all posts of this vendor
 * @access  Public
 */
router.get('/:id/comments', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const vendorComments: any[] = [];

        // 1. Find all posts for this vendor
        const postMap = new Map<string, any>();
        try {
            const [postsSnap, memPostsSnap]: any = await Promise.all([
                withTimeout(db.collection('posts').where('vendorId', '==', id).get(), 1200).catch(() => null),
                withTimeout(db.collection('posts').where('userId', '==', id).get(), 1000).catch(() => null),
            ]);

            if (postsSnap?.docs) {
                postsSnap.docs.forEach((doc: any) => postMap.set(doc.id, { id: doc.id, ...doc.data() }));
            }
            if (memPostsSnap?.docs) {
                memPostsSnap.docs.forEach((doc: any) => postMap.set(doc.id, { id: doc.id, ...doc.data() }));
            }
        } catch (_) {}

        // Also check memory posts
        for (const p of MEMORY_VENDORS) {
            if (p.vendorId === id && !postMap.has(p.id)) {
                postMap.set(p.id, p);
            }
        }

        const vendorPosts = Array.from(postMap.values());

        // 2. Collect comments for each post
        await Promise.all(
            vendorPosts.map(async (post) => {
                const postId = post.id;
                try {
                    // Try subcollection
                    const commSnap = await withTimeout(
                        db.collection('posts').doc(postId).collection('comments').get(),
                        1000
                    ).catch(() => null);

                    if (commSnap?.docs) {
                        commSnap.docs.forEach((cDoc: any) => {
                            const cData = cDoc.data();
                            vendorComments.push({
                                id: cDoc.id,
                                postId,
                                postCaption: post.caption || 'Product Showcase',
                                postMediaUrl: post.mediaUrl || post.thumbnailUrl || '',
                                userId: cData.userId,
                                userName: cData.userName || 'Client',
                                userAvatar: cData.userAvatar || '',
                                text: cData.text || '',
                                createdAt: cData.createdAt || new Date().toISOString(),
                                isVerified: Boolean(cData.isVerified),
                                isAdmin: Boolean(cData.isAdmin),
                            });
                        });
                    }

                    // Try root comments collection
                    const rootCommSnap = await withTimeout(
                        db.collection('comments').where('postId', '==', postId).get(),
                        1000
                    ).catch(() => null);

                    if (rootCommSnap?.docs) {
                        rootCommSnap.docs.forEach((cDoc: any) => {
                            if (!vendorComments.some(c => c.id === cDoc.id)) {
                                const cData = cDoc.data();
                                vendorComments.push({
                                    id: cDoc.id,
                                    postId,
                                    postCaption: post.caption || 'Product Showcase',
                                    postMediaUrl: post.mediaUrl || post.thumbnailUrl || '',
                                    userId: cData.userId,
                                    userName: cData.userName || 'Client',
                                    userAvatar: cData.userAvatar || '',
                                    text: cData.text || '',
                                    createdAt: cData.createdAt || new Date().toISOString(),
                                    isVerified: Boolean(cData.isVerified),
                                    isAdmin: Boolean(cData.isAdmin),
                                });
                            }
                        });
                    }
                } catch (_) {}
            })
        );

        // 3. Enrich missing avatars from users collection
        const commenterIds = Array.from(new Set(vendorComments.map(c => c.userId).filter(Boolean)));
        if (commenterIds.length > 0) {
            try {
                const uDocs = await Promise.all(
                    commenterIds.slice(0, 20).map(uid => db.collection('users').doc(uid).get().catch(() => null))
                );
                const avMap = new Map<string, { avatar: string; isVerified: boolean; isAdmin: boolean }>();
                uDocs.forEach(ud => {
                    if (ud && ud.exists) {
                        const d = ud.data()!;
                        avMap.set(ud.id, {
                            avatar: d.profileImage || d.profile_image || d.photoURL || d.avatar || '',
                            isVerified: Boolean(d.isVerified || d.is_verified || d.role === 'admin'),
                            isAdmin: d.role === 'admin',
                        });
                    }
                });

                for (const vc of vendorComments) {
                    if (vc.userId && avMap.has(vc.userId)) {
                        const info = avMap.get(vc.userId)!;
                        if (!vc.userAvatar && info.avatar) vc.userAvatar = info.avatar;
                        if (info.isVerified) vc.isVerified = true;
                        if (info.isAdmin) vc.isAdmin = true;
                    }
                }
            } catch (_) {}
        }

        // Sort descending by date
        vendorComments.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

        res.status(200).json({ comments: vendorComments, count: vendorComments.length });
    } catch (error: any) {
        console.error('Get vendor comments error:', error);
        res.status(200).json({ comments: [], count: 0 });
    }
});

// ──── Verified Badge Endpoints ────

/**
 * @route   GET /api/vendors/badge/info
 * @desc    Get verified badge pricing and info
 * @access  Public
 */
router.get('/badge/info', async (_req: Request, res: Response) => {
    try {
        res.status(200).json({ badge: VERIFIED_BADGE });
    } catch (error: any) {
        console.error('Get badge info error:', error);
        res.status(500).json({ error: 'Failed to retrieve badge info', message: error.message });
    }
});

/**
 * @route   GET /api/vendors/:id/badge
 * @desc    Get a user's current verified badge status
 * @access  Public
 */
router.get('/:id/badge', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        let badgeData: any = null;

        // Check Firestore (vendors collection first, then users)
        try {
            const vendorDoc = await db.collection('vendors').doc(id).get();
            if (vendorDoc.exists) {
                const data = vendorDoc.data();
                badgeData = {
                    isVerified: data?.isVerified ?? false,
                    badgeSubscribedAt: data?.badgeSubscribedAt || null,
                    badgeExpiresAt: data?.badgeExpiresAt || null,
                };
            }
        } catch (_) {}

        if (!badgeData) {
            try {
                const userDoc = await db.collection('users').doc(id).get();
                if (userDoc.exists) {
                    const data = userDoc.data();
                    badgeData = {
                        isVerified: data?.isVerified ?? false,
                        badgeSubscribedAt: data?.badgeSubscribedAt || null,
                        badgeExpiresAt: data?.badgeExpiresAt || null,
                    };
                }
            } catch (_) {}
        }

        // Supabase fallback
        if (!badgeData) {
            try {
                const { data: vendor } = await supabase
                    .from('vendors')
                    .select('is_verified, badge_subscribed_at, badge_expires_at')
                    .eq('uid', id)
                    .single();

                if (vendor) {
                    badgeData = {
                        isVerified: vendor.is_verified ?? false,
                        badgeSubscribedAt: vendor.badge_subscribed_at || null,
                        badgeExpiresAt: vendor.badge_expires_at || null,
                    };
                }
            } catch (_) {}
        }

        let isPending = false;
        let verificationStatus = 'none';

        if (badgeData) {
            isPending = Boolean((badgeData as any).verificationStatus === 'pending' || (badgeData as any).verification_status === 'pending');
            verificationStatus = (badgeData as any).verificationStatus || (badgeData as any).verification_status || (badgeData.isVerified ? 'approved' : 'none');
        }

        res.status(200).json({
            isVerified: badgeData ? badgeData.isVerified : false,
            isPending,
            verificationStatus,
            subscribedAt: badgeData ? badgeData.badgeSubscribedAt : null,
            expiresAt: badgeData ? badgeData.badgeExpiresAt : null,
            badgeInfo: VERIFIED_BADGE,
        });
    } catch (error: any) {
        console.error('Get badge status error:', error);
        res.status(500).json({ error: 'Failed to retrieve badge status', message: error.message });
    }
});

/**
 * @route   POST /api/vendors/:id/badge/purchase
 * @desc    Submit verified badge request & payment for Admin approval
 * @access  Private
 */
router.post('/:id/badge/purchase', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { paymentReference } = req.body;

        const now = new Date();
        const ref = paymentReference || `BADGE_${Date.now()}`;

        const updateData: any = {
            isVerified: false,
            verificationStatus: 'pending',
            verification_status: 'pending',
            updatedAt: now.toISOString(),
            lastBadgePayment: {
                amount: VERIFIED_BADGE.price,
                currency: VERIFIED_BADGE.currency,
                paymentReference: ref,
                paidAt: now.toISOString(),
                status: 'pending_admin_approval',
            },
        };

        // Write to Firestore (both vendors and users collections)
        try {
            await db.collection('vendors').doc(id).set(updateData, { merge: true });
        } catch (fsErr: any) {
            console.warn('Firestore vendor badge update warning:', fsErr.message);
        }

        try {
            await db.collection('users').doc(id).set(updateData, { merge: true });
        } catch (fsErr: any) {
            console.warn('Firestore user badge update warning:', fsErr.message);
        }

        // Write to Supabase (both vendors and users tables)
        try {
            await supabase
                .from('vendors')
                .update({
                    verification_status: 'pending',
                    is_verified: false,
                    payment_reference: ref,
                })
                .eq('uid', id);
        } catch (_) {}

        try {
            await supabase
                .from('users')
                .update({
                    verification_status: 'pending',
                    is_verified: false,
                    payment_reference: ref,
                })
                .eq('uid', id);
        } catch (_) {}

    res.status(200).json({
            message: 'Verification payment submitted! Admin will verify and activate your badge shortly.',
            isPending: true,
            isVerified: false,
            paymentReference: ref,
        });
    } catch (error: any) {
        console.error('Badge purchase error:', error);
        res.status(500).json({ error: 'Failed to submit badge request', message: error.message });
    }
});

/**
 * @route   GET /api/vendors/:id/documents or /api/vendors/:id/menu-documents
 * @desc    Get all menu/document PDFs uploaded by a vendor
 * @access  Public
 */
router.get(['/:id/documents', '/:id/menu-documents'], async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        let documents: any[] = [];

        // Check Firestore vendors collection
        try {
            const doc = await db.collection('vendors').doc(id).get();
            if (doc.exists) {
                documents = doc.data()?.menuDocuments || [];
            }
        } catch (_) {}

        // Also check users collection
        if (documents.length === 0) {
            try {
                const doc = await db.collection('users').doc(id).get();
                if (doc.exists) {
                    documents = doc.data()?.menuDocuments || [];
                }
            } catch (_) {}
        }

        res.status(200).json({ documents });
    } catch (error: any) {
        console.error('Get documents error:', error);
        res.status(500).json({ error: 'Failed to fetch documents', message: error.message });
    }
});

/**
 * @route   POST /api/vendors/:id/documents or /api/vendors/:id/menu-documents
 * @desc    Add a new menu/document PDF for a vendor
 * @access  Vendor only
 */
router.post(['/:id/documents', '/:id/menu-documents'], async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { title, url, fileType, fileSize } = req.body;

        if (!title || !url) {
            return res.status(400).json({ error: 'title and url are required' });
        }

        const newDoc = {
            id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            title,
            url,
            fileType: fileType || 'application/pdf',
            fileSize: fileSize || 0,
            uploadedAt: new Date().toISOString(),
        };

        // Append to Firestore
        try {
            const vendorRef = db.collection('vendors').doc(id);
            const vendorDoc = await vendorRef.get();
            const existing = vendorDoc.exists ? (vendorDoc.data()?.menuDocuments || []) : [];
            existing.push(newDoc);
            await vendorRef.set({ menuDocuments: existing }, { merge: true });
        } catch (fsErr: any) {
            console.warn('Firestore document save note:', fsErr.message);
        }

        // Also update users collection
        try {
            const userRef = db.collection('users').doc(id);
            const userDoc = await userRef.get();
            const existing = userDoc.exists ? (userDoc.data()?.menuDocuments || []) : [];
            existing.push(newDoc);
            await userRef.set({ menuDocuments: existing }, { merge: true });
        } catch (_) {}

        res.status(201).json({
            message: 'Document added successfully',
            document: newDoc,
        });
    } catch (error: any) {
        console.error('Add document error:', error);
        res.status(500).json({ error: 'Failed to add document', message: error.message });
    }
});

/**
 * @route   DELETE /api/vendors/:id/documents/:docId or /api/vendors/:id/menu-documents/:docId
 * @desc    Remove a menu/document PDF from a vendor
 * @access  Vendor only
 */
router.delete(['/:id/documents/:docId', '/:id/menu-documents/:docId'], async (req: Request, res: Response) => {
    try {
        const { id, docId } = req.params;

        // Remove from Firestore vendors
        try {
            const vendorRef = db.collection('vendors').doc(id);
            const vendorDoc = await vendorRef.get();
            if (vendorDoc.exists) {
                const existing = vendorDoc.data()?.menuDocuments || [];
                const filtered = existing.filter((d: any) => d.id !== docId);
                await vendorRef.set({ menuDocuments: filtered }, { merge: true });
            }
        } catch (_) {}

        // Also remove from users collection
        try {
            const userRef = db.collection('users').doc(id);
            const userDoc = await userRef.get();
            if (userDoc.exists) {
                const existing = userDoc.data()?.menuDocuments || [];
                const filtered = existing.filter((d: any) => d.id !== docId);
                await userRef.set({ menuDocuments: filtered }, { merge: true });
            }
        } catch (_) {}

        res.status(200).json({ message: 'Document removed successfully', docId });
    } catch (error: any) {
        console.error('Delete document error:', error);
        res.status(500).json({ error: 'Failed to delete document', message: error.message });
    }
});

/**
 * @route   PUT /api/vendors/:id/location
 * @desc    Toggle vendor between live GPS location and default business location
 * @access  Vendor only
 */
router.put('/:id/location', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { useLiveLocation, liveLatitude, liveLongitude } = req.body;

        const updateData: any = {
            useLiveLocation: Boolean(useLiveLocation),
        };

        if (useLiveLocation && liveLatitude !== undefined && liveLongitude !== undefined) {
            updateData.liveLocation = {
                latitude: Number(liveLatitude),
                longitude: Number(liveLongitude),
            };
        }

        // Update Firestore vendors
        try {
            await db.collection('vendors').doc(id).set(updateData, { merge: true });
        } catch (_) {}

        // Update Firestore users
        try {
            await db.collection('users').doc(id).set(updateData, { merge: true });
        } catch (_) {}

        // Update Supabase vendors
        try {
            const supabaseData: any = {
                use_live_location: updateData.useLiveLocation,
            };
            if (updateData.liveLocation) {
                supabaseData.live_latitude = updateData.liveLocation.latitude;
                supabaseData.live_longitude = updateData.liveLocation.longitude;
            }
            await supabase.from('vendors').update(supabaseData).eq('uid', id);
        } catch (_) {}

        res.status(200).json({
            message: updateData.useLiveLocation ? 'Live location enabled' : 'Switched to business location',
            useLiveLocation: updateData.useLiveLocation,
        });
    } catch (error: any) {
        console.error('Update location error:', error);
        res.status(500).json({ error: 'Failed to update location', message: error.message });
    }
});

export default router;

