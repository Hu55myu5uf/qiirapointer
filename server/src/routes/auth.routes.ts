import { Router, Request, Response } from 'express';
import { auth, db } from '../config/firebase';
import supabase from '../config/supabase';
import { authenticateUser, optionalAuthenticateUser, requireSelfOrAdmin, MASTER_ADMIN_UID, SUPPORT_UID } from '../utils/authMiddleware';
import { authLimiter } from '../utils/rateLimiter';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Fields anyone may see about another user. Email, push token, block lists etc. stay private.
 * Vendors' phone numbers are public on purpose (customers call businesses directly).
 */
function toPublicProfile(user: any) {
    if (!user) return null;
    const isVendor = user.role === 'vendor';
    const phone = isVendor ? (user.phoneNumber || user.phone_number || null) : null;
    return {
        id: user.uid,
        uid: user.uid,
        fullName: user.fullName,
        full_name: user.fullName,
        displayName: user.fullName,
        profileImage: user.profileImage,
        profile_image: user.profileImage,
        role: user.role,
        isAdmin: Boolean(user.isAdmin),
        isSupport: Boolean(user.isSupport),
        isVerified: Boolean(user.isVerified),
        is_verified: Boolean(user.isVerified),
        businessName: user.businessName || null,
        phoneNumber: phone,
        phone_number: phone,
        createdAt: user.createdAt || user.created_at || null,
        created_at: user.createdAt || user.created_at || null,
    };
}

// Resilient user profile retriever (checks Firestore, Supabase, and Firebase Auth)
async function getUserProfile(uid: string) {
    if (uid === SUPPORT_UID) {
        return {
            uid: SUPPORT_UID,
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
                // Accounts with no profile document are always plain clients. (Roles are never
                // inferred from the email address.)
                rawData = {
                    uid,
                    email: fbUser.email,
                    fullName: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
                    profileImage: fbUser.photoURL || '',
                    role: 'client',
                    isVerified: false,
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
    // STRICT Admin check: Only explicit DB role === 'admin' OR the master admin UID
    const isAdmin = Boolean(role === 'admin' || uid === MASTER_ADMIN_UID);
    const isVerified = rawData.isVerified ?? rawData.is_verified ?? isAdmin;
    const isSuspended = rawData.isSuspended ?? rawData.is_suspended ?? false;

    // Stored fields first; computed, authoritative fields last so stored data can't override them
    return {
        ...rawData,
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
        createdAt: rawData.createdAt || rawData.created_at,
        created_at: rawData.createdAt || rawData.created_at,
    };
}

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user (Client or Vendor)
 * @access  Public
 */
router.post('/register', authLimiter, async (req: Request, res: Response) => {
    try {
        const { email, password, role, fullName, phoneNumber } = req.body;

        // Validation
        if (!email || !password || !role || !fullName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!['client', 'vendor'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role. Must be client or vendor' });
        }

        if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
            return res.status(400).json({ error: 'Please enter a valid email address' });
        }
        if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long` });
        }
        if (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.length > 100) {
            return res.status(400).json({ error: 'Please enter your full name (2–100 characters)' });
        }
        if (phoneNumber !== undefined && phoneNumber !== null && (typeof phoneNumber !== 'string' || phoneNumber.length > 25)) {
            return res.status(400).json({ error: 'Invalid phone number' });
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
        if (error?.code === 'auth/email-already-exists') {
            return res.status(409).json({ error: 'An account with this email already exists' });
        }
        if (error?.code === 'auth/invalid-email' || error?.code === 'auth/invalid-password') {
            return res.status(400).json({ error: 'Invalid email or password' });
        }
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user (handled by Firebase Client SDK, this is for verification)
 * @access  Public
 */
router.post('/login', authLimiter, async (req: Request, res: Response) => {
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
router.post('/oauth', authLimiter, async (req: Request, res: Response) => {
    try {
        // The email always comes from the verified token, never from the request body
        const { idToken, provider, role = 'client', fullName, photoURL } = req.body;

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
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        let userData = await getUserProfile(uid);

        if (!userData) {
            const userEmail = tokenEmail || '';
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
 * @desc    Get a user profile. The owner and admins get the full profile; everyone else gets
 *          public fields only (no email, push token, block list; phone only for vendors).
 * @access  Public (limited) / Owner or Admin (full)
 */
router.get('/user/:uid', optionalAuthenticateUser, async (req: Request, res: Response) => {
    try {
        const { uid } = req.params;
        const userData = await getUserProfile(uid);

        if (!userData) {
            return res.status(404).json({ error: 'User not found' });
        }

        const canSeePrivate = Boolean(req.user && (req.user.uid === uid || req.user.isAdmin));
        res.status(200).json({ user: canSeePrivate ? userData : toPublicProfile(userData) });
    } catch (error: any) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to retrieve user' });
    }
});

/**
 * @route   PUT /api/auth/user/:uid
 * @desc    Update user profile
 * @access  Private (requires authentication)
 */
router.put('/user/:uid', authenticateUser, requireSelfOrAdmin('uid'), async (req: Request, res: Response) => {
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
 * @desc    Admin-only: reset ANOTHER user's password.
 *          Users change their own password in the app, which first re-confirms the current
 *          password with Firebase (reauthenticate + updatePassword). A stolen session token alone
 *          can therefore never change a password.
 * @access  Admin only
 */
router.post('/change-password', authenticateUser, authLimiter, async (req: Request, res: Response) => {
    try {
        const { newPassword, uid: targetUid } = req.body;
        const callerUid = req.user!.uid;

        if (!req.user!.isAdmin) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'To change your password, confirm your current password in the app.'
            });
        }
        if (!targetUid || typeof targetUid !== 'string' || targetUid === callerUid) {
            return res.status(400).json({ error: 'A target user id (other than your own) is required' });
        }
        if (!newPassword || typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters long` });
        }

        await auth.updateUser(targetUid, { password: newPassword });
        // Sign the user out everywhere so the old password's sessions stop working
        await auth.revokeRefreshTokens(targetUid);

        console.log(`🔑 Admin ${callerUid} reset the password of ${targetUid}`);
        res.status(200).json({ message: 'Password changed successfully' });
    } catch (error: any) {
        if (error?.code === 'auth/user-not-found') {
            return res.status(404).json({ error: 'User not found' });
        }
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to update password' });
    }
});

/**
 * @route   DELETE /api/auth/delete-account
 * @desc    Permanently delete the authenticated user's account and associated data (App Store & Google Play compliance)
 * @access  Private (requires authentication)
 */
router.delete('/delete-account', authenticateUser, async (req: Request, res: Response) => {
    try {
        const callerUid = req.user!.uid;
        console.log(`🗑️ Initiating account deletion for user: ${callerUid}`);

        // 1. Delete user from Supabase (cascades to related tables if foreign keys configured)
        try {
            await supabase.from('users').delete().eq('uid', callerUid);
            await supabase.from('vendors').delete().eq('uid', callerUid);
            await supabase.from('reviews').delete().or(`client_id.eq.${callerUid},vendor_id.eq.${callerUid}`);
            await supabase.from('favorites').delete().eq('client_id', callerUid);
            await supabase.from('cart_items').delete().eq('user_id', callerUid);
        } catch (sbErr: any) {
            console.warn('Supabase cleanup note during account deletion:', sbErr.message);
        }

        // 2. Delete from Firestore
        try {
            await db.collection('users').doc(callerUid).delete();
            await db.collection('vendors').doc(callerUid).delete();

            // Mark posts by this author as deleted or remove them
            const postsSnap = await db.collection('posts').where('authorId', '==', callerUid).get();
            const batch = db.batch();
            postsSnap.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        } catch (fsErr: any) {
            console.warn('Firestore cleanup note during account deletion:', fsErr.message);
        }

        // 3. Delete from Firebase Authentication
        try {
            await auth.deleteUser(callerUid);
        } catch (authErr: any) {
            console.warn('Firebase Auth delete note:', authErr.message);
        }

        console.log(`✅ User ${callerUid} account completely deleted.`);
        res.status(200).json({
            success: true,
            message: 'Your account and all associated data have been permanently deleted.'
        });
    } catch (error: any) {
        console.error('Account deletion error:', error);
        res.status(500).json({
            error: 'Failed to delete account',
            message: error.message || 'An error occurred while deleting your account. Please try again.'
        });
    }
});

export default router;

