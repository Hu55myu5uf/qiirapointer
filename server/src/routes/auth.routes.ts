import { Router, Request, Response } from 'express';
import { auth, db } from '../config/firebase';
import { authenticateUser, optionalAuthenticateUser, requireSelfOrAdmin, MASTER_ADMIN_UID, SUPPORT_UID } from '../utils/authMiddleware';
import { authLimiter } from '../utils/rateLimiter';
import { deleteAccountData } from '../utils/accountDeletion';
import { ensureUsername } from '../utils/usernames';
import { checkFieldLock } from '../utils/fieldLocks';
import { clearProfileCache } from '../utils/profiles';
import { verificationState } from '../utils/vendors';

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
        username: user.username || null,
        phoneNumber: phone,
        phone_number: phone,
        createdAt: user.createdAt || user.created_at || null,
        created_at: user.createdAt || user.created_at || null,
    };
}

// User profile from Firestore (falls back to the Firebase Auth record for accounts with no profile)
async function getUserProfile(uid: string) {
    if (uid === SUPPORT_UID) {
        return {
            uid: SUPPORT_UID,
            fullName: 'Pointer Customer Support',
            displayName: 'Pointer Customer Support',
            role: 'support',
            isVerified: true,
            isAdmin: false,
            isSupport: true,
            profileImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500',
        };
    }

    let rawData: any = null;

    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
        rawData = userDoc.data();
    }

    // Fallback to the Firebase Auth user record
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
    const isSuspended = rawData.isSuspended ?? rawData.is_suspended ?? false;

    // Listing approval and the identity badge, worked out separately. A vendor's badge lives on
    // the vendor document, a client's on the user document.
    let vendorDoc: any = null;
    if (role === 'vendor') {
        const vSnap = await db.collection('vendors').doc(uid).get();
        if (vSnap.exists) vendorDoc = vSnap.data();
    }
    const state = verificationState(vendorDoc, rawData, isAdmin);
    const isVerified = state.isVerified;

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
        badgeStatus: state.badgeStatus,
        badgeRejectionReason: state.badgeRejectionReason,
        listingStatus: state.listingStatus,
        // Old field kept for installed app versions: the vendor's listing status
        verificationStatus: state.listingStatus ?? rawData.verificationStatus ?? null,
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
        const now = new Date().toISOString();
        const name = fullName.trim();

        // Profile (and store, for vendors) are written together. If that fails, the login is
        // removed again so no half-created account is left behind.
        try {
            const batch = db.batch();
            batch.set(db.collection('users').doc(userRecord.uid), {
                uid: userRecord.uid,
                email: email.trim(),
                fullName: name,
                phoneNumber: phoneNumber ? phoneNumber.trim() : null,
                role,
                isVerified: false,
                isSuspended: false,
                createdAt: now,
                updatedAt: now,
            });
            if (role === 'vendor') {
                batch.set(db.collection('vendors').doc(userRecord.uid), {
                    uid: userRecord.uid,
                    businessName: name,
                    phoneNumber: phoneNumber ? phoneNumber.trim() : null,
                    verificationStatus: 'approved', // listed straight away; Discover shows it once a category is set. Admins can still suspend.
                    isVerified: false,
                    location: null,
                    averageRating: 0,
                    totalReviews: 0,
                    ratingSum: 0,
                    createdAt: now,
                    updatedAt: now,
                });
            }
            await batch.commit();
        } catch (fsErr: any) {
            await auth.deleteUser(userRecord.uid).catch(() => {});
            throw fsErr;
        }
        // Everyone gets an @username straight away (they can change it in their profile)
        const username = await ensureUsername(userRecord.uid, name);

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                uid: userRecord.uid,
                email,
                fullName,
                role,
                username,
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
        let decodedToken;
        try {
            decodedToken = await auth.verifyIdToken(idToken);
        } catch {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
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
        res.status(500).json({ error: 'Login failed' });
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

        // Look at the stored profile directly (getUserProfile would auto-create a client profile)
        const existingProfile = await db.collection('users').doc(uid).get();
        let userData = existingProfile.exists ? await getUserProfile(uid) : null;

        if (!userData) {
            const userEmail = tokenEmail || '';
            const userName = fullName || tokenName || userEmail.split('@')[0] || 'User';
            const userPhoto = photoURL || tokenPicture || '';
            const userRole = ['client', 'vendor'].includes(role) ? role : 'client';

            const now = new Date().toISOString();
            const batch = db.batch();
            batch.set(db.collection('users').doc(uid), {
                uid,
                email: userEmail,
                fullName: String(userName).slice(0, 100),
                profileImage: /^https:\/\//.test(userPhoto) ? userPhoto : '',
                phoneNumber: null,
                role: userRole,
                isVerified: false,
                isSuspended: false,
                provider: provider === 'apple' ? 'apple' : 'google',
                createdAt: now,
                updatedAt: now,
            });
            if (userRole === 'vendor') {
                batch.set(db.collection('vendors').doc(uid), {
                    uid,
                    businessName: String(userName).slice(0, 100),
                    verificationStatus: 'approved', // listed straight away (see /register)
                    isVerified: false,
                    location: null,
                    averageRating: 0, totalReviews: 0, ratingSum: 0,
                    createdAt: now,
                    updatedAt: now,
                });
            }
            await batch.commit();
            await ensureUsername(uid, String(userName));
            userData = await getUserProfile(uid);
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
        res.status(500).json({ error: 'OAuth sign-in failed' });
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

        // A suspended user loading their own profile (app start-up) must be told so explicitly
        if ((req as any).suspendedUid === uid) {
            return res.status(403).json({
                error: 'Account Suspended',
                message: 'Your account has been suspended by an administrator. Please contact support.',
            });
        }

        const userData = await getUserProfile(uid);

        if (!userData) {
            return res.status(404).json({ error: 'User not found' });
        }

        const canSeePrivate = Boolean(req.user && (req.user.uid === uid || req.user.isAdmin));
        // Accounts from before usernames get one the first time they open the app
        if (!userData.username && req.user?.uid === uid) {
            const username = await ensureUsername(uid, userData.businessName || userData.fullName || '');
            if (username) userData.username = username;
        }
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

        const update: Record<string, any> = { updatedAt: new Date().toISOString() };

        if (resolvedName !== undefined) {
            if (typeof resolvedName !== 'string' || resolvedName.trim().length < 2 || resolvedName.length > 100) {
                return res.status(400).json({ error: 'Name must be 2–100 characters' });
            }
            update.fullName = resolvedName.trim();
        }
        if (resolvedPhone !== undefined) {
            if (resolvedPhone !== null && (typeof resolvedPhone !== 'string' || resolvedPhone.length > 25 || !/^[+\d\s()-]*$/.test(resolvedPhone))) {
                return res.status(400).json({ error: 'Invalid phone number' });
            }
            update.phoneNumber = resolvedPhone ? resolvedPhone.trim() : null;
        }
        if (resolvedImage !== undefined) {
            if (resolvedImage !== null && resolvedImage !== '' && (typeof resolvedImage !== 'string' || !/^https:\/\/[^\s]+$/i.test(resolvedImage) || resolvedImage.length > 2048)) {
                return res.status(400).json({ error: 'Invalid profile image' });
            }
            update.profileImage = resolvedImage || '';
        }
        if (resolvedPushToken !== undefined) {
            if (resolvedPushToken !== null && (typeof resolvedPushToken !== 'string' || !/^Expo(nent)?PushToken\[[^\]]{10,200}\]$/.test(resolvedPushToken))) {
                return res.status(400).json({ error: 'Invalid push token' });
            }
            update.pushToken = resolvedPushToken;
            update.pushTokenUpdatedAt = update.updatedAt;
        }

        // Vendors: phone number and profile photo can only change once every 30 days
        const userSnap = await db.collection('users').doc(uid).get();
        const existing = userSnap.data() || {};
        let vendorUpdate: Record<string, any> | null = null;
        if (existing.role === 'vendor') {
            const vSnap = await db.collection('vendors').doc(uid).get();
            const v = vSnap.data() || {};
            const bypass = Boolean(req.user!.isAdmin && req.user!.uid !== uid);
            const changedAt: Record<string, string> = { ...(v.fieldChangedAt || {}) };
            let touched = false;
            if (update.phoneNumber !== undefined) {
                const currentPhone = v.phoneNumber ?? existing.phoneNumber;
                const r = checkFieldLock('phoneNumber', currentPhone, update.phoneNumber, v.fieldChangedAt, bypass);
                if (!r.ok) return res.status(429).json({ error: r.message, field: r.field, nextAllowedAt: r.nextAllowedAt });
                if (r.changed) {
                    vendorUpdate = { ...(vendorUpdate || {}), phoneNumber: update.phoneNumber };
                    if (!bypass && String(currentPhone ?? '').trim()) { changedAt.phoneNumber = update.updatedAt; touched = true; }
                }
            }
            // The photo is the store photo: keeping it in step with an accepted store change is fine
            if (update.profileImage !== undefined && update.profileImage !== (v.businessImage || '')) {
                const r = checkFieldLock('businessImage', v.businessImage || existing.profileImage, update.profileImage, v.fieldChangedAt, bypass);
                if (!r.ok) return res.status(429).json({ error: r.message, field: r.field, nextAllowedAt: r.nextAllowedAt });
                if (r.changed && !bypass && String(v.businessImage || existing.profileImage || '').trim()) { changedAt.businessImage = update.updatedAt; touched = true; }
                if (r.changed) vendorUpdate = { ...(vendorUpdate || {}), businessImage: update.profileImage };
            }
            if (touched) vendorUpdate = { ...(vendorUpdate || {}), fieldChangedAt: changedAt };
        }

        await db.collection('users').doc(uid).set(update, { merge: true });
        if (vendorUpdate) await db.collection('vendors').doc(uid).set({ ...vendorUpdate, updatedAt: update.updatedAt }, { merge: true });
        clearProfileCache(uid);

        // Keep the Firebase Auth display name / photo in step
        const authUpdate: Record<string, any> = {};
        if (update.fullName) authUpdate.displayName = update.fullName;
        if (update.profileImage) authUpdate.photoURL = update.profileImage;
        if (Object.keys(authUpdate).length > 0) {
            await auth.updateUser(uid, authUpdate).catch((e: any) => console.warn('Auth profile sync note:', e.message));
        }

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
 * @desc    Permanently delete the caller's account and ALL associated data
 *          (App Store 5.1.1(v) and Google Play account-deletion requirements)
 * @access  Private
 */
router.delete('/delete-account', authenticateUser, authLimiter, async (req: Request, res: Response) => {
    try {
        const uid = req.user!.uid;
        if (uid === MASTER_ADMIN_UID) {
            return res.status(403).json({ error: 'The root administrator account cannot be deleted from the app.' });
        }
        const result = await deleteAccountData(uid);
        console.log(`🗑️ Account ${uid} deleted (${result.deletedDocuments} documents)`);
        res.status(200).json({
            success: true,
            message: 'Your account and all associated data have been permanently deleted.',
        });
    } catch (error: any) {
        console.error('Account deletion error:', error);
        res.status(500).json({ error: 'Failed to delete account. Please try again or contact support.' });
    }
});

export default router;

