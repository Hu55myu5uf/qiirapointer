import { Router, Request, Response } from 'express';
import { auth, db } from '../config/firebase';
import supabase from '../config/supabase';
import { notifyVendorApproval } from '../utils/pushNotifications';

const router = Router();

// Helper mapper to convert database snake_case to client camelCase
function mapVendor(v: any) {
    if (!v) return null;
    return {
        id: v.uid,
        uid: v.uid,
        businessName: v.business_name,
        category: v.category,
        description: v.description,
        address: v.address,
        services: v.services,
        businessImage: v.business_image,
        bannerImage: v.banner_image,
        businessHours: v.business_hours,
        verificationStatus: v.verification_status,
        isActive: v.is_active,
        documents: v.documents || [],
        paymentStatus: v.payment_status,
        paymentReference: v.payment_reference,
        paymentAmount: v.payment_amount,
        paidAt: v.paid_at,
        averageRating: Number(v.average_rating || 0),
        totalReviews: Number(v.total_reviews || 0),
        rejectionReason: v.rejection_reason,
        verifiedAt: v.verified_at,
        createdAt: v.created_at,
        updatedAt: v.updated_at,
        userInfo: v.users ? {
            uid: v.users.uid,
            email: v.users.email,
            fullName: v.users.full_name,
            phoneNumber: v.users.phone_number,
            role: v.users.role,
            isVerified: v.users.is_verified,
            profileImage: v.users.profile_image,
            isSuspended: v.users.is_suspended,
            createdAt: v.users.created_at
        } : null
    };
}

// Helper mapper for users
function mapUser(u: any) {
    if (!u) return null;
    const vendorInfo = Array.isArray(u.vendors) ? u.vendors[0] : (u.vendors || null);
    const businessName = vendorInfo?.business_name || u.business_name || u.businessName || null;
    const fullName = u.full_name || u.fullName || u.displayName || businessName || (u.email ? u.email.split('@')[0] : 'User');

    return {
        uid: u.uid || u.id,
        id: u.uid || u.id,
        email: u.email || '',
        fullName: fullName,
        full_name: fullName,
        businessName: businessName,
        phoneNumber: u.phone_number || u.phoneNumber || null,
        phone_number: u.phone_number || u.phoneNumber || null,
        role: u.role || 'client',
        isVerified: u.is_verified ?? u.isVerified ?? false,
        isSuspended: u.is_suspended ?? u.isSuspended ?? false,
        suspendedAt: u.suspended_at || u.suspendedAt || null,
        pushToken: u.push_token || u.pushToken || null,
        profileImage: u.profile_image || u.profileImage || null,
        createdAt: u.created_at || u.createdAt || new Date().toISOString(),
        updatedAt: u.updated_at || u.updatedAt || null
    };
}

/**
 * @route   GET /api/admin/vendors/pending
 * @desc    Get all accounts (vendors and clients) pending verification / badge approval
 * @access  Private (Admin only)
 */
router.get('/vendors/pending', async (req: Request, res: Response) => {
    try {
        const rawPendingList: any[] = [];
        const seenIds = new Set<string>();

        // 1. Fetch from Supabase vendors where verification_status == 'pending'
        try {
            const { data: sbVendors } = await supabase
                .from('vendors')
                .select('*, users(*)')
                .eq('verification_status', 'pending');

            (sbVendors || []).forEach((v: any) => {
                const mapped = mapVendor(v);
                if (mapped && mapped.id && !seenIds.has(mapped.id)) {
                    seenIds.add(mapped.id);
                    rawPendingList.push(mapped);
                }
            });
        } catch (sbErr: any) {
            console.warn('Supabase pending vendors query note:', sbErr.message);
        }

        // 2. Fetch from Supabase users where verification_status == 'pending'
        try {
            const { data: sbUsers } = await supabase
                .from('users')
                .select('*, vendors(*)')
                .eq('verification_status', 'pending');

            (sbUsers || []).forEach((u: any) => {
                const id = u.uid || u.id;
                if (id && !seenIds.has(id)) {
                    seenIds.add(id);
                    const vendorInfo = Array.isArray(u.vendors) ? u.vendors[0] : (u.vendors || null);
                    rawPendingList.push({
                        id: id,
                        uid: id,
                        businessName: vendorInfo?.business_name || u.business_name || u.full_name || u.email,
                        category: u.role === 'vendor' ? (vendorInfo?.category || 'Vendor Verification') : 'Client Badge Request',
                        description: `QIIRA Verified Badge application (${u.role?.toUpperCase()}). Payment Reference: ${u.payment_reference || 'BADGE_DIRECT'}`,
                        address: u.address || 'N/A',
                        services: 'Verified Badge Subscription (₦3,000)',
                        verificationStatus: 'pending',
                        isActive: false,
                        paymentReference: u.payment_reference || null,
                        paymentAmount: 3000,
                        averageRating: 0,
                        totalReviews: 0,
                        createdAt: u.created_at || new Date().toISOString(),
                        userInfo: {
                            uid: id,
                            email: u.email,
                            fullName: u.full_name || u.displayName || 'User',
                            phoneNumber: u.phone_number,
                            role: u.role || 'client',
                            isVerified: false,
                        }
                    });
                }
            });
        } catch (sbErr: any) {
            console.warn('Supabase pending users query note:', sbErr.message);
        }

        // 3. Fetch from Firestore vendors collection where verificationStatus == 'pending'
        try {
            const fsVendorsSnap = await db.collection('vendors').where('verificationStatus', '==', 'pending').get();
            for (const doc of fsVendorsSnap.docs) {
                const id = doc.id;
                if (!seenIds.has(id)) {
                    seenIds.add(id);
                    const data = doc.data();
                    let userDocData: any = null;
                    try {
                        const uDoc = await db.collection('users').doc(id).get();
                        userDocData = uDoc.data();
                    } catch (_) {}

                    rawPendingList.push({
                        id: id,
                        uid: id,
                        businessName: data.businessName || data.business_name || userDocData?.businessName || userDocData?.fullName || 'Vendor',
                        category: data.category || 'Vendor Verification',
                        description: data.description || 'Pending approval for verified status',
                        address: data.address || 'N/A',
                        services: data.services || 'Verified Badge (₦3,000)',
                        verificationStatus: 'pending',
                        isActive: false,
                        averageRating: Number(data.averageRating || 0),
                        totalReviews: Number(data.totalReviews || 0),
                        paymentReference: data.lastBadgePayment?.paymentReference || data.paymentReference || null,
                        paymentAmount: data.lastBadgePayment?.amount || 3000,
                        createdAt: data.createdAt || new Date().toISOString(),
                        userInfo: {
                            uid: id,
                            email: userDocData?.email || data.email || 'N/A',
                            fullName: userDocData?.fullName || data.fullName || 'N/A',
                            phoneNumber: userDocData?.phoneNumber || data.phoneNumber || 'N/A',
                            role: userDocData?.role || 'vendor',
                            isVerified: false,
                        }
                    });
                }
            }
        } catch (fsErr: any) {
            console.warn('Firestore pending vendors note:', fsErr.message);
        }

        // 4. Fetch from Firestore users collection where verificationStatus == 'pending'
        try {
            const fsUsersSnap = await db.collection('users').where('verificationStatus', '==', 'pending').get();
            for (const doc of fsUsersSnap.docs) {
                const id = doc.id;
                if (!seenIds.has(id)) {
                    seenIds.add(id);
                    const data = doc.data();
                    rawPendingList.push({
                        id: id,
                        uid: id,
                        businessName: data.businessName || data.fullName || data.email || 'User',
                        category: data.role === 'vendor' ? 'Vendor Verification' : 'Client Badge Request',
                        description: `Verified Badge Request (${(data.role || 'client').toUpperCase()}). Payment Ref: ${data.lastBadgePayment?.paymentReference || 'N/A'}`,
                        address: data.address || 'N/A',
                        services: 'Verified Badge Subscription (₦3,000)',
                        verificationStatus: 'pending',
                        isActive: false,
                        averageRating: 0,
                        totalReviews: 0,
                        paymentReference: data.lastBadgePayment?.paymentReference || null,
                        paymentAmount: data.lastBadgePayment?.amount || 3000,
                        createdAt: data.createdAt || new Date().toISOString(),
                        userInfo: {
                            uid: id,
                            email: data.email || 'N/A',
                            fullName: data.fullName || data.displayName || 'User',
                            phoneNumber: data.phoneNumber || 'N/A',
                            role: data.role || 'client',
                            isVerified: false,
                        }
                    });
                }
            }
        } catch (fsErr: any) {
            console.warn('Firestore pending users note:', fsErr.message);
        }

        // Cross-verify each candidate to make sure it is not already approved or rejected
        const filteredList: any[] = [];
        for (const item of rawPendingList) {
            const id = item.id || item.uid;
            if (!id) continue;

            let isAlreadyApprovedOrRejected = false;

            // Check Firestore vendor & user doc
            try {
                const [fVendorDoc, fUserDoc] = await Promise.all([
                    db.collection('vendors').doc(id).get().catch(() => null),
                    db.collection('users').doc(id).get().catch(() => null),
                ]);
                const fVendorData = fVendorDoc?.data();
                const fUserData = fUserDoc?.data();

                const fvStatus = fVendorData?.verificationStatus || fVendorData?.verification_status;
                const fuStatus = fUserData?.verificationStatus || fUserData?.verification_status;

                if (fvStatus === 'approved' || fuStatus === 'approved') {
                    isAlreadyApprovedOrRejected = true;
                    // Auto-heal Supabase if out of sync
                    try {
                        await supabase.from('vendors').update({ verification_status: 'approved', is_active: true }).eq('uid', id);
                    } catch (_) {}
                } else if (fvStatus === 'rejected' || fuStatus === 'rejected') {
                    isAlreadyApprovedOrRejected = true;
                }
            } catch (_) {}

            // Also check Supabase vendor doc directly
            if (!isAlreadyApprovedOrRejected) {
                try {
                    const { data: sbV } = await supabase.from('vendors').select('verification_status').eq('uid', id).maybeSingle();
                    if (sbV?.verification_status === 'approved' || sbV?.verification_status === 'rejected') {
                        isAlreadyApprovedOrRejected = true;
                    }
                } catch (_) {}
            }

            if (!isAlreadyApprovedOrRejected) {
                filteredList.push(item);
            }
        }

        res.status(200).json({ vendors: filteredList, count: filteredList.length });
    } catch (error: any) {
        console.error('Get pending vendors error:', error);
        res.status(500).json({ error: 'Failed to retrieve pending verifications', message: error.message });
    }
});

/**
 * @route   PUT /api/admin/vendors/:id/verify
 * @desc    Approve or reject vendor or client verification
 * @access  Private (Admin only)
 */
router.put('/vendors/:id/verify', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status, rejectionReason, grantBadge } = req.body; // status: 'approved' or 'rejected'

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be approved or rejected.' });
        }

        const isApproved = status === 'approved';
        const now = new Date();
        const shouldGrantBadge = Boolean(grantBadge === true);
        const expiresAt = shouldGrantBadge ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;

        const updateData: any = {
            verification_status: status,
            is_active: isApproved,
            verified_at: isApproved ? now.toISOString() : null,
            rejection_reason: isApproved ? null : (rejectionReason || 'Application rejected by administration'),
            updated_at: now.toISOString(),
        };

        if (shouldGrantBadge) {
            updateData.is_verified = true;
            updateData.badge_subscribed_at = now.toISOString();
            updateData.badge_expires_at = expiresAt;
        } else if (!isApproved) {
            updateData.is_verified = false;
        }

        // 1. Update Supabase vendors table
        try {
            await supabase
                .from('vendors')
                .update(updateData)
                .eq('uid', id);
        } catch (sbErr: any) {
            console.warn('Supabase vendor verify update note:', sbErr.message);
        }

        // 2. Update Supabase users table
        try {
            const userSbUpdate: any = {
                verification_status: status,
            };
            if (shouldGrantBadge) {
                userSbUpdate.is_verified = true;
                userSbUpdate.badge_subscribed_at = now.toISOString();
                userSbUpdate.badge_expires_at = expiresAt;
            } else if (!isApproved) {
                userSbUpdate.is_verified = false;
            }

            await supabase
                .from('users')
                .update(userSbUpdate)
                .eq('uid', id);
        } catch (sbErr: any) {
            console.warn('Supabase user verify update note:', sbErr.message);
        }

        // 3. Update Firestore vendors collection (by direct doc ID and where uid == id)
        try {
            const vendorUpdate: any = {
                verificationStatus: status,
                verification_status: status,
                isActive: isApproved,
                is_active: isApproved,
                verifiedAt: isApproved ? now.toISOString() : null,
                rejectionReason: isApproved ? null : (rejectionReason || 'Application rejected by administration'),
                updatedAt: now.toISOString(),
            };

            if (shouldGrantBadge) {
                vendorUpdate.isVerified = true;
                vendorUpdate.is_verified = true;
                vendorUpdate.badgeSubscribedAt = now.toISOString();
                vendorUpdate.badgeExpiresAt = expiresAt;
            } else if (!isApproved) {
                vendorUpdate.isVerified = false;
                vendorUpdate.is_verified = false;
            }

            await db.collection('vendors').doc(id).set(vendorUpdate, { merge: true });

            const vByUid = await db.collection('vendors').where('uid', '==', id).get().catch(() => null);
            if (vByUid && !vByUid.empty) {
                for (const doc of vByUid.docs) {
                    await doc.ref.set(vendorUpdate, { merge: true });
                }
            }
        } catch (fsErr: any) {
            console.warn('Firestore vendor verify note:', fsErr.message);
        }

        // 4. Update Firestore users collection (by direct doc ID and where uid == id)
        try {
            const userUpdate: any = {
                verificationStatus: status,
                verification_status: status,
                updatedAt: now.toISOString(),
            };

            if (shouldGrantBadge) {
                userUpdate.isVerified = true;
                userUpdate.is_verified = true;
                userUpdate.badgeSubscribedAt = now.toISOString();
                userUpdate.badgeExpiresAt = expiresAt;
            } else if (!isApproved) {
                userUpdate.isVerified = false;
                userUpdate.is_verified = false;
            }

            await db.collection('users').doc(id).set(userUpdate, { merge: true });

            const uByUid = await db.collection('users').where('uid', '==', id).get().catch(() => null);
            if (uByUid && !uByUid.empty) {
                for (const doc of uByUid.docs) {
                    await doc.ref.set(userUpdate, { merge: true });
                }
            }
        } catch (fsErr: any) {
            console.warn('Firestore user verify note:', fsErr.message);
        }

        // 5. Send push notification if token exists
        try {
            const { data: userDoc } = await supabase.from('users').select('*').eq('uid', id).single();
            const { data: vendorDoc } = await supabase.from('vendors').select('*').eq('uid', id).single();
            
            const pushToken = userDoc?.push_token;
            const businessName = vendorDoc?.business_name || userDoc?.full_name || 'Your account';

            if (pushToken) {
                await notifyVendorApproval(pushToken, status, businessName, rejectionReason);
            }
        } catch (notifError) {
            console.error('Error sending notification (non-blocking):', notifError);
        }

        res.status(200).json({
            message: `Account ${status} successfully`,
            isVerified: shouldGrantBadge,
            status,
        });
    } catch (error: any) {
        console.error('Verify vendor error:', error);
        res.status(500).json({ error: 'Failed to update verification status', message: error.message });
    }
});

/**
 * @route   GET /api/admin/analytics
 * @desc    Get platform analytics
 * @access  Private (Admin only)
 */
router.get('/analytics', async (req: Request, res: Response) => {
    try {
        // Fast COUNT queries in PostgreSQL using head: true option
        const [usersRes, vendorsRes, reviewsRes, approvedRes, pendingRes] = await Promise.all([
            supabase.from('users').select('*', { count: 'exact', head: true }),
            supabase.from('vendors').select('*', { count: 'exact', head: true }),
            supabase.from('reviews').select('*', { count: 'exact', head: true }),
            supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('verification_status', 'approved'),
            supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('verification_status', 'pending')
        ]);

        res.status(200).json({
            totalUsers: usersRes.count || 0,
            totalVendors: vendorsRes.count || 0,
            activeVendors: approvedRes.count || 0,
            pendingVendors: pendingRes.count || 0,
            totalReviews: reviewsRes.count || 0,
        });
    } catch (error: any) {
        console.error('Get analytics error:', error);
        res.status(500).json({ error: 'Failed to retrieve analytics', message: error.message });
    }
});

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    Delete a user
 * @access  Private (Admin only)
 */
router.delete('/users/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Cascade delete defined in DB schema handles deletes of corresponding vendor, reviews, favorites, chat rows
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('uid', id);

        if (error) throw error;

        // Delete from Firebase Auth as well
        try {
            await auth.deleteUser(id);
        } catch (firebaseErr) {
            console.warn('User deleted from DB, but failed to delete from Firebase Auth (non-blocking):', firebaseErr);
        }

        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error: any) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user', message: error.message });
    }
});

/**
 * @route   POST /api/admin/vendors/create
 * @desc    Admin creates a new vendor account
 * @access  Private (Admin only)
 */
router.post('/vendors/create', async (req: Request, res: Response) => {
    try {
        const { email, password, fullName, businessName, category, description, address, services, phoneNumber } = req.body;

        // Validation
        if (!email || !password || !fullName || !businessName || !category) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Create user in Firebase Auth
        const userProperties: any = {
            email,
            password,
            displayName: fullName,
        };

        if (phoneNumber && phoneNumber.trim() !== '') {
            userProperties.phoneNumber = phoneNumber;
        }

        const userRecord = await auth.createUser(userProperties);

        // Create user profile in Supabase
        const { error: userError } = await supabase.from('users').insert({
            uid: userRecord.uid,
            email,
            full_name: fullName,
            phone_number: phoneNumber || null,
            role: 'vendor',
            is_verified: false,
        });

        if (userError) throw userError;

        // Create vendor profile in Supabase
        const { error: vendorError } = await supabase.from('vendors').insert({
            uid: userRecord.uid,
            business_name: businessName,
            category,
            description: description || '',
            address: address || '',
            services: services || '',
            location: null,
            verification_status: 'pending',
            is_active: false,
            documents: [],
            payment_status: 'unpaid',
        });

        if (vendorError) throw vendorError;

        res.status(201).json({
            message: 'Vendor created successfully',
            vendor: {
                uid: userRecord.uid,
                email,
                businessName,
                category,
            },
        });
    } catch (error: any) {
        console.error('Create vendor error:', error);
        res.status(500).json({ error: 'Failed to create vendor', message: error.message });
    }
});

/**
 * @route   GET /api/admin/users
 * @desc    Get all users
 * @access  Private (Admin only)
 */
router.get('/users', async (req: Request, res: Response) => {
    try {
        let dbUsers: any[] = [];

        // 1. Try Supabase
        try {
            const { data: users, error } = await supabase
                .from('users')
                .select('*, vendors(*)')
                .order('created_at', { ascending: false });

            if (!error && users) {
                dbUsers = users;
            }
        } catch (e: any) {
            console.warn('Supabase get users error:', e.message);
        }

        // 2. Try Firestore fallback / merge
        try {
            const firestoreUsers = await db.collection('users').get();
            const firestoreMap = new Map();
            firestoreUsers.docs.forEach((doc: any) => {
                firestoreMap.set(doc.id, doc.data());
            });

            if (dbUsers.length === 0) {
                firestoreUsers.docs.forEach((doc: any) => {
                    const d = doc.data();
                    const isVerified = d.isVerified ?? d.is_verified ?? (d.role === 'admin');
                    dbUsers.push({
                        uid: doc.id,
                        email: d.email,
                        full_name: d.fullName || d.full_name || d.displayName,
                        phone_number: d.phoneNumber || d.phone_number,
                        role: d.role || 'client',
                        is_verified: Boolean(isVerified),
                        isVerified: Boolean(isVerified),
                        is_suspended: Boolean(d.isSuspended ?? d.is_suspended ?? false),
                        isSuspended: Boolean(d.isSuspended ?? d.is_suspended ?? false),
                        profile_image: d.profileImage || d.profile_image,
                        created_at: d.createdAt || d.created_at || new Date().toISOString(),
                    });
                });
            } else {
                dbUsers = dbUsers.map(u => {
                    const fData = firestoreMap.get(u.uid);
                    if (fData) {
                        const isVerified = fData.isVerified ?? fData.is_verified ?? u.is_verified ?? (u.role === 'admin');
                        return {
                            ...u,
                            full_name: u.full_name || fData.fullName || fData.full_name || fData.displayName,
                            phone_number: u.phone_number || fData.phoneNumber || fData.phone_number,
                            profile_image: u.profile_image || fData.profileImage || fData.profile_image,
                            is_verified: Boolean(isVerified),
                            isVerified: Boolean(isVerified),
                            is_suspended: Boolean(fData.isSuspended ?? fData.is_suspended ?? u.is_suspended ?? false),
                            isSuspended: Boolean(fData.isSuspended ?? fData.is_suspended ?? u.is_suspended ?? false),
                        };
                    }
                    return u;
                });
            }
        } catch (e: any) {
            console.warn('Firestore get users error:', e.message);
        }

        // 3. Fallback to Firebase Auth user display names
        try {
            const listUsersResult = await auth.listUsers(100);
            const authMap = new Map();
            listUsersResult.users.forEach((u: any) => {
                authMap.set(u.uid, u);
            });

            dbUsers = dbUsers.map(u => {
                const aUser = authMap.get(u.uid);
                const vendorInfo = Array.isArray(u.vendors) ? u.vendors[0] : (u.vendors || null);
                const businessName = vendorInfo?.business_name || u.business_name;
                const fullName = u.full_name || u.fullName || aUser?.displayName || businessName || (u.email ? u.email.split('@')[0] : 'User');
                return {
                    ...u,
                    full_name: fullName,
                    fullName: fullName,
                    businessName: businessName || null,
                    email: u.email || aUser?.email || '',
                    phoneNumber: u.phone_number || u.phoneNumber || aUser?.phoneNumber || null,
                };
            });
        } catch (e: any) {
            console.warn('Firebase Auth list users error:', e.message);
        }

        const mappedUsers = (dbUsers || []).map(mapUser).filter(Boolean);

        res.status(200).json({ users: mappedUsers, count: mappedUsers.length });
    } catch (error: any) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to retrieve users', message: error.message });
    }
});

/**
 * @route   GET /api/admin/reviews
 * @desc    Get all reviews across all vendors
 * @access  Private (Admin only)
 */
router.get('/reviews', async (req: Request, res: Response) => {
    try {
        const { data: rawReviews, error } = await supabase
            .from('reviews')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const reviews = rawReviews || [];
        let vendorMap = new Map<string, { name: string; isVerified: boolean }>();
        let userMap = new Map<string, { name: string; isVerified: boolean; isAdmin: boolean }>();

        if (reviews.length > 0) {
            const vendorIds = Array.from(new Set(reviews.map((r: any) => r.vendor_id).filter(Boolean)));
            const clientIds = Array.from(new Set(reviews.map((r: any) => r.client_id).filter(Boolean)));

            if (vendorIds.length > 0) {
                const { data: vendors } = await supabase
                    .from('vendors')
                    .select('uid, business_name, is_verified')
                    .in('uid', vendorIds);
                (vendors || []).forEach((v: any) => vendorMap.set(v.uid, {
                    name: v.business_name || 'Vendor',
                    isVerified: Boolean(v.is_verified)
                }));
            }

            if (clientIds.length > 0) {
                const { data: users } = await supabase
                    .from('users')
                    .select('uid, full_name, email, is_verified, role')
                    .in('uid', clientIds);
                (users || []).forEach((u: any) => userMap.set(u.uid, {
                    name: u.full_name || u.email?.split('@')[0] || 'Anonymous',
                    isVerified: Boolean(u.is_verified),
                    isAdmin: u.role === 'admin'
                }));
            }
        }

        const mappedReviews = reviews.map((r: any) => {
            const vendor = vendorMap.get(r.vendor_id);
            const user = userMap.get(r.client_id);
            return {
                id: r.id,
                rating: Number(r.rating || 0),
                comment: r.comment || '',
                vendorId: r.vendor_id,
                vendorName: vendor?.name || 'Vendor',
                vendorIsVerified: vendor?.isVerified ?? false,
                clientId: r.client_id,
                clientName: user?.name || r.client_name || 'Anonymous',
                clientIsVerified: user?.isVerified ?? false,
                clientIsAdmin: user?.isAdmin ?? false,
                createdAt: r.created_at,
            };
        });

        res.status(200).json({ reviews: mappedReviews, count: mappedReviews.length });
    } catch (error: any) {
        console.error('Get admin reviews error:', error);
        res.status(500).json({ error: 'Failed to retrieve reviews', message: error.message });
    }
});

/**
 * @route   PUT /api/admin/users/:id/suspend
 * @desc    Suspend or unsuspend a user
 * @access  Private (Admin only)
 */
router.put('/users/:id/suspend', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { suspended } = req.body; // true to suspend, false to unsuspend

        const suspendedAt = suspended ? new Date().toISOString() : null;

        // 1. Update Firestore users collection
        try {
            await db.collection('users').doc(id).set({
                isSuspended: Boolean(suspended),
                suspendedAt: suspendedAt,
                updatedAt: new Date().toISOString()
            }, { merge: true });
        } catch (fsErr: any) {
            console.warn('Firestore user suspend warning:', fsErr.message);
        }

        // 2. Update Supabase users table
        try {
            await supabase
                .from('users')
                .update({
                    is_suspended: Boolean(suspended),
                    suspended_at: suspendedAt,
                })
                .eq('uid', id);
        } catch (sbErr: any) {
            console.warn('Supabase user suspend warning:', sbErr.message);
        }

        res.status(200).json({
            message: suspended ? 'User suspended successfully' : 'User unsuspended successfully',
            isSuspended: Boolean(suspended)
        });
    } catch (error: any) {
        console.error('Suspend user error:', error);
        res.status(500).json({ error: 'Failed to update user status', message: error.message });
    }
});

/**
 * @route   PUT /api/admin/users/:id/verified
 * @desc    Admin: Grant or revoke verified badge for any user (vendor or client)
 * @access  Private (Admin only)
 */
router.put('/users/:id/verified', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { isVerified } = req.body; // true to grant, false to revoke

        if (typeof isVerified !== 'boolean') {
            return res.status(400).json({ error: 'isVerified must be a boolean (true or false).' });
        }

        const now = new Date();
        const expiresAt = isVerified ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;

        const updateData: any = {
            isVerified,
            badgeSubscribedAt: isVerified ? now.toISOString() : null,
            badgeExpiresAt: expiresAt,
            updatedAt: now.toISOString(),
        };

        // Write to Firestore users collection
        try {
            await db.collection('users').doc(id).set(updateData, { merge: true });
        } catch (fsErr: any) {
            console.warn('Firestore user badge update warning:', fsErr.message);
        }

        // Also write to Firestore vendors collection (in case the user is a vendor)
        try {
            await db.collection('vendors').doc(id).set(updateData, { merge: true });
        } catch (fsErr: any) {
            console.warn('Firestore vendor badge update warning:', fsErr.message);
        }

        // Write to Supabase users table
        try {
            await supabase
                .from('users')
                .update({
                    is_verified: isVerified,
                    badge_subscribed_at: isVerified ? now.toISOString() : null,
                    badge_expires_at: expiresAt,
                })
                .eq('uid', id);
        } catch (_) {}

        // Write to Supabase vendors table
        try {
            await supabase
                .from('vendors')
                .update({
                    is_verified: isVerified,
                    badge_subscribed_at: isVerified ? now.toISOString() : null,
                    badge_expires_at: expiresAt,
                })
                .eq('uid', id);
        } catch (_) {}

        res.status(200).json({
            message: isVerified
                ? `Verified badge granted to user ${id}`
                : `Verified badge revoked from user ${id}`,
            isVerified,
            expiresAt,
        });
    } catch (error: any) {
        console.error('Admin badge update error:', error);
        res.status(500).json({ error: 'Failed to update verified badge', message: error.message });
    }
});

export default router;
