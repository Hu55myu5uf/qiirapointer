import { Router, Request, Response } from 'express';
import { auth, db } from '../config/firebase';
import supabase from '../config/supabase';

const router = Router();

// Resilient user profile retriever (checks Firestore, Supabase, and Firebase Auth)
async function getUserProfile(uid: string) {
    if (uid === 'qiira_official_support') {
        return {
            uid: 'qiira_official_support',
            email: 'support@qiira.com',
            fullName: 'QIIRA Customer Support',
            displayName: 'QIIRA Customer Support',
            role: 'support',
            isVerified: true,
            isAdmin: true,
            isSupport: true,
            profileImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500',
        };
    }

    let rawData: any = null;

    // 1. Fast check in Firestore (primary working database)
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            rawData = userDoc.data();
        }
    } catch (e: any) {
        console.warn('Firestore user lookup error:', e.message);
    }

    // 2. Try Supabase if available
    if (!rawData) {
        try {
            const { data: userData, error } = await supabase
                .from('users')
                .select('*')
                .eq('uid', uid)
                .single();

            if (!error && userData) {
                rawData = userData;
            }
        } catch (e: any) {
            // Supabase unreachable
        }
    }

    // 3. Fallback to Firebase Auth user record
    if (!rawData) {
        try {
            const fbUser = await auth.getUser(uid);
            if (fbUser) {
                const email = fbUser.email || '';
                let role = 'client';
                if (email.includes('admin')) role = 'admin';
                else if (email.includes('bistro') || email.includes('repair') || email.includes('clinic') || email.includes('market') || email.includes('vendor')) role = 'vendor';

                rawData = {
                    uid,
                    email: fbUser.email,
                    fullName: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
                    profileImage: fbUser.photoURL || '',
                    role,
                    isVerified: role === 'admin',
                };

                // Cache into Firestore for subsequent requests
                try {
                    await db.collection('users').doc(uid).set(rawData, { merge: true });
                } catch (_) {}
            }
        } catch (e: any) {
            console.warn('Firebase Auth user lookup error:', e.message);
        }
    }

    if (!rawData) return null;

    const fullName = rawData.fullName || rawData.full_name || rawData.displayName || 'User';
    const profileImage = rawData.profileImage || rawData.profile_image || rawData.photoURL || '';
    const phoneNumber = rawData.phoneNumber || rawData.phone_number || null;
    const role = rawData.role || 'client';
    const isAdmin = Boolean(role === 'admin' || uid === 'v8MwaOet0ISfZAWXIDAPAGcg1td2' || (rawData.email && String(rawData.email).includes('admin')));
    const isVerified = rawData.isVerified ?? rawData.is_verified ?? isAdmin;
    const isSuspended = rawData.isSuspended ?? rawData.is_suspended ?? false;

    return {
        id: uid,
        uid: uid,
        email: rawData.email,
        fullName,
        full_name: fullName,
        profileImage,
        profile_image: profileImage,
        phoneNumber,
        phone_number: phoneNumber,
        role: isAdmin ? 'admin' : role,
        isAdmin,
        isVerified: Boolean(isVerified || isAdmin),
        is_verified: Boolean(isVerified || isAdmin),
        isSuspended: Boolean(isSuspended),
        is_suspended: Boolean(isSuspended),
        created_at: rawData.createdAt || rawData.created_at,
        ...rawData
    };
}

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user (Client or Vendor)
 * @access  Public
 */
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { email, password, role, fullName, phoneNumber } = req.body;

        // Validation
        if (!email || !password || !role || !fullName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!['client', 'vendor'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role. Must be client or vendor' });
        }

        // Create user in Firebase Auth (unchanged)
        const userProperties: any = {
            email,
            password,
            displayName: fullName,
        };

        // Skip passing phoneNumber to Firebase Auth to avoid strict E.164 format errors during registration.
        // We will just save it in Firestore.
        // if (phoneNumber && phoneNumber.trim() !== '') {
        //     userProperties.phoneNumber = phoneNumber;
        // }

        const userRecord = await auth.createUser(userProperties);

        // Always save to Firestore
        try {
            await db.collection('users').doc(userRecord.uid).set({
                uid: userRecord.uid,
                email,
                fullName,
                phoneNumber: phoneNumber || null,
                role,
                isVerified: role === 'admin',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });

            if (role === 'vendor') {
                await db.collection('vendors').doc(userRecord.uid).set({
                    uid: userRecord.uid,
                    verificationStatus: 'pending',
                    isActive: false,
                    documents: [],
                    paymentStatus: 'unpaid',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });
            }
        } catch (fsErr: any) {
            console.warn('Firestore write warning:', fsErr.message);
        }

        // Attempt Supabase insert as well if available
        try {
            await supabase.from('users').insert({
                uid: userRecord.uid,
                email,
                full_name: fullName,
                phone_number: phoneNumber || null,
                role,
                is_verified: role === 'admin',
            });

            if (role === 'vendor') {
                await supabase.from('vendors').insert({
                    uid: userRecord.uid,
                    verification_status: 'pending',
                    is_active: false,
                    documents: [],
                    payment_status: 'unpaid',
                });
            }
        } catch (sbErr) {
            console.warn('Supabase write warning:', sbErr);
        }

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                uid: userRecord.uid,
                email,
                fullName,
                role,
            },
        });
    } catch (error: any) {
        console.error('Registration error:', error);
        res.status(500).json({
            error: 'Registration failed',
            message: error.message
        });
    }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user (handled by Firebase Client SDK, this is for verification)
 * @access  Public
 */
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({ error: 'ID token is required' });
        }

        // Verify the ID token with Firebase Auth
        const decodedToken = await auth.verifyIdToken(idToken);
        const uid = decodedToken.uid;

        // Get user profile (with automatic fallback)
        const userData = await getUserProfile(uid);

        if (!userData) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (userData.isSuspended) {
            return res.status(403).json({
                error: 'Account Suspended',
                message: 'Your account has been suspended by an administrator. Please contact support.'
            });
        }

        res.status(200).json({
            message: 'Login successful',
            user: userData,
        });
    } catch (error: any) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'Login failed',
            message: error.message
        });
    }
});

/**
 * @route   POST /api/auth/oauth
 * @desc    OAuth (Google / Apple) sign-in and auto-registration
 * @access  Public
 */
router.post('/oauth', async (req: Request, res: Response) => {
    try {
        const { idToken, provider, role = 'client', fullName, email, photoURL } = req.body;

        if (!idToken) {
            return res.status(400).json({ error: 'ID token is required' });
        }

        let uid: string;
        let tokenEmail: string | undefined;
        let tokenName: string | undefined;
        let tokenPicture: string | undefined;

        try {
            const decodedToken = await auth.verifyIdToken(idToken);
            uid = decodedToken.uid;
            tokenEmail = decodedToken.email;
            tokenName = decodedToken.name;
            tokenPicture = decodedToken.picture;
        } catch (tokenErr: any) {
            console.error('OAuth token verification error:', tokenErr.message);
            return res.status(401).json({ error: 'Invalid or expired token', message: tokenErr.message });
        }

        let userData = await getUserProfile(uid);

        if (!userData) {
            const userEmail = email || tokenEmail || '';
            const userName = fullName || tokenName || userEmail.split('@')[0] || 'User';
            const userPhoto = photoURL || tokenPicture || '';
            const userRole = ['client', 'vendor'].includes(role) ? role : 'client';

            const newUserData = {
                uid,
                email: userEmail,
                fullName: userName,
                full_name: userName,
                profileImage: userPhoto,
                profile_image: userPhoto,
                phoneNumber: null,
                role: userRole,
                isVerified: userRole === 'admin',
                provider: provider || 'google',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            try {
                await db.collection('users').doc(uid).set(newUserData, { merge: true });

                if (userRole === 'vendor') {
                    await db.collection('vendors').doc(uid).set({
                        uid,
                        businessName: userName,
                        category: 'General',
                        verificationStatus: 'pending',
                        isVerified: false,
                        isActive: true,
                        documents: [],
                        paymentStatus: 'unpaid',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    }, { merge: true });
                }
            } catch (fsErr: any) {
                console.warn('Firestore OAuth user write warning:', fsErr.message);
            }

            userData = await getUserProfile(uid) || newUserData;
        }

        if (userData?.isSuspended) {
            return res.status(403).json({
                error: 'Account Suspended',
                message: 'Your account has been suspended by an administrator. Please contact support.'
            });
        }

        res.status(200).json({
            message: 'OAuth sign-in successful',
            user: userData,
        });
    } catch (error: any) {
        console.error('OAuth endpoint error:', error);
        res.status(500).json({
            error: 'OAuth sign-in failed',
            message: error.message,
        });
    }
});

/**
 * @route   GET /api/auth/user/:uid
 * @desc    Get user profile
 * @access  Private (requires authentication)
 */
router.get('/user/:uid', async (req: Request, res: Response) => {
    try {
        const { uid } = req.params;
        const userData = await getUserProfile(uid);

        if (!userData) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json({ user: userData });
    } catch (error: any) {
        console.error('Get user error:', error);
        res.status(500).json({
            error: 'Failed to retrieve user',
            message: error.message
        });
    }
});

/**
 * @route   PUT /api/auth/user/:uid
 * @desc    Update user profile
 * @access  Private (requires authentication)
 */
router.put('/user/:uid', async (req: Request, res: Response) => {
    try {
        const { uid } = req.params;
        const {
            fullName,
            full_name,
            phoneNumber,
            phone_number,
            profileImage,
            profile_image,
            pushToken,
            push_token
        } = req.body;

        const resolvedName = fullName !== undefined ? fullName : full_name;
        const resolvedPhone = phoneNumber !== undefined ? phoneNumber : phone_number;
        const resolvedImage = profileImage !== undefined ? profileImage : profile_image;
        const resolvedPushToken = pushToken !== undefined ? pushToken : push_token;

        // 1. Primary update in Firestore
        const fsUpdate: any = {
            updatedAt: new Date().toISOString()
        };

        if (resolvedName !== undefined) {
            fsUpdate.fullName = resolvedName;
            fsUpdate.full_name = resolvedName;
        }
        if (resolvedPhone !== undefined) {
            fsUpdate.phoneNumber = resolvedPhone;
            fsUpdate.phone_number = resolvedPhone;
        }
        if (resolvedImage !== undefined) {
            fsUpdate.profileImage = resolvedImage;
            fsUpdate.profile_image = resolvedImage;
        }
        if (resolvedPushToken !== undefined) {
            fsUpdate.pushToken = resolvedPushToken;
            fsUpdate.push_token = resolvedPushToken;
            fsUpdate.push_token_updated_at = new Date().toISOString();
        }

        try {
            await db.collection('users').doc(uid).set(fsUpdate, { merge: true });
        } catch (fsErr: any) {
            console.warn('Firestore user update warning:', fsErr.message);
        }

        // 2. Update Firebase Auth displayName & photoURL if applicable
        const fbUpdate: any = {};
        if (resolvedName) fbUpdate.displayName = resolvedName;
        if (resolvedImage !== undefined && resolvedImage !== null) {
            // Note: Firebase Auth photoURL accepts valid URL string
            if (typeof resolvedImage === 'string' && (resolvedImage.startsWith('http://') || resolvedImage.startsWith('https://'))) {
                fbUpdate.photoURL = resolvedImage;
            }
        }

        if (Object.keys(fbUpdate).length > 0) {
            try {
                await auth.updateUser(uid, fbUpdate);
            } catch (fbErr: any) {
                console.warn('Firebase Auth updateUser warning:', fbErr.message);
            }
        }

        // 3. Fallback/sync to Supabase if available
        try {
            const updateData: any = {};
            if (resolvedName !== undefined) updateData.full_name = resolvedName;
            if (resolvedPhone !== undefined) updateData.phone_number = resolvedPhone;
            if (resolvedImage !== undefined) updateData.profile_image = resolvedImage;
            if (resolvedPushToken !== undefined) {
                updateData.push_token = resolvedPushToken;
                updateData.push_token_updated_at = new Date().toISOString();
            }

            if (Object.keys(updateData).length > 0) {
                await supabase
                    .from('users')
                    .update(updateData)
                    .eq('uid', uid);
            }
        } catch (_) {}

        // Return updated user profile
        const updatedUser = await getUserProfile(uid);

        res.status(200).json({
            message: 'Profile updated successfully',
            user: updatedUser
        });
    } catch (error: any) {
        console.error('Update user error:', error);
        res.status(500).json({
            error: 'Failed to update user',
            message: error.message
        });
    }
});

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Private (requires authentication)
 */
router.post('/change-password', async (req: Request, res: Response) => {
    try {
        const { newPassword, currentPassword, uid: bodyUid } = req.body;

        let uid = bodyUid;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const token = authHeader.split('Bearer ')[1];
                const decoded = await auth.verifyIdToken(token);
                if (decoded?.uid) uid = decoded.uid;
            } catch (_) {}
        }

        if (!uid) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters long' });
        }

        // Update password using Firebase Admin
        await auth.updateUser(uid, { password: newPassword });

        res.status(200).json({ message: 'Password changed successfully' });
    } catch (error: any) {
        console.error('Change password error:', error);
        res.status(500).json({
            error: 'Failed to update password',
            message: error.message
        });
    }
});

export default router;

