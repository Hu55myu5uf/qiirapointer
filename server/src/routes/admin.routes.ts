import { Router, Request, Response } from 'express';
import { auth, db } from '../config/firebase';
import { notifyVendorApproval } from '../utils/pushNotifications';
import { authenticateUser, requireAdmin, MASTER_ADMIN_UID, SUPPORT_UID } from '../utils/authMiddleware';
import { signedUrlFor } from '../utils/fileStorage';
import { clearProfileCache, getDisplayProfiles, usableImage } from '../utils/profiles';
import { invalidateVendorList } from '../utils/vendors';
import { deleteAccountData } from '../utils/accountDeletion';
import { authLimiter } from '../utils/rateLimiter';

const router = Router();

// Every admin route requires a logged-in administrator
router.use(authenticateUser, requireAdmin);

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Admins may not act on themselves, the root admin, or the Support identity through these routes. */
function protectedTarget(req: Request, targetUid: string): string | null {
    if (targetUid === req.user!.uid) return 'You cannot do this to your own account.';
    if (targetUid === MASTER_ADMIN_UID) return 'The root administrator account is protected.';
    if (targetUid === SUPPORT_UID) return 'The Support identity is protected.';
    return null;
}

/** Turn a stored verification document into what the dashboard shows, with a short-lived link. */
async function presentDocument(doc: any) {
    if (!doc) return null;
    const ref = doc.ref || doc.url || doc.documentUrl;
    return {
        documentType: doc.type || doc.documentType || 'Identity Document',
        documentName: doc.name || doc.documentName || 'Document',
        documentFileType: doc.fileType || doc.documentFileType || 'image/jpeg',
        documentUrl: await signedUrlFor(ref), // private files: valid for 15 minutes
        notes: doc.notes || '',
        submittedAt: doc.submittedAt || null,
    };
}

function mapUser(id: string, u: any, v: any = null) {
    return {
        uid: id,
        id,
        email: u.email || '',
        fullName: u.fullName || v?.businessName || 'User',
        full_name: u.fullName || v?.businessName || 'User',
        businessName: v?.businessName || null,
        phoneNumber: u.phoneNumber || null,
        phone_number: u.phoneNumber || null,
        role: id === MASTER_ADMIN_UID ? 'admin' : (u.role || 'client'),
        isVerified: Boolean(v ? v.isVerified : u.isVerified),
        isSuspended: Boolean(u.isSuspended),
        suspendedAt: u.suspendedAt || null,
        vendorStatus: v?.verificationStatus || null,
        profileImage: usableImage(u.profileImage) || usableImage(v?.businessImage) || null,
        createdAt: u.createdAt || null,
        updatedAt: u.updatedAt || null,
    };
}

/**
 * @route   GET /api/admin/vendors/pending
 * @desc    Everything awaiting review: new vendor stores and identity-verification requests
 */
router.get('/vendors/pending', async (_req: Request, res: Response) => {
    try {
        const [newStores, vendorRequests, clientRequests] = await Promise.all([
            db.collection('vendors').where('verificationStatus', '==', 'pending').get(),
            db.collection('vendors').where('verificationRequest', '==', 'pending').get(),
            db.collection('users').where('verificationRequest', '==', 'pending').get(),
        ]);

        const items = new Map<string, { id: string; v: any | null; u: any | null }>();
        for (const d of [...newStores.docs, ...vendorRequests.docs]) items.set(d.id, { id: d.id, v: d.data(), u: null });
        for (const d of clientRequests.docs) if (!items.has(d.id)) items.set(d.id, { id: d.id, v: null, u: d.data() });

        // Load the missing user profiles
        await Promise.all([...items.values()].filter(i => !i.u).map(async i => {
            const doc = await db.collection('users').doc(i.id).get();
            i.u = doc.exists ? doc.data() : {};
        }));

        const vendors = await Promise.all([...items.values()]
            .filter(i => !i.u?.isSuspended)
            .map(async ({ id, v, u }) => {
                const isClientRequest = !v;
                const src = v || u;
                return {
                    id,
                    uid: id,
                    requestType: isClientRequest ? 'client-verification' : (v.verificationStatus === 'pending' ? 'new-store' : 'vendor-verification'),
                    businessName: v?.businessName || u.fullName || 'User',
                    category: isClientRequest ? 'Client verification request' : (v.category || 'Vendor'),
                    description: v?.description || '',
                    address: v?.address || '',
                    services: v?.services || [],
                    verificationStatus: v?.verificationStatus || 'pending',
                    verificationRequest: src.verificationRequest || null,
                    isVerified: Boolean(src.isVerified),
                    verificationDocument: await presentDocument(src.verificationDocument),
                    createdAt: src.verificationDocument?.submittedAt || src.createdAt || null,
                    userInfo: {
                        uid: id,
                        email: u.email || '',
                        fullName: u.fullName || 'User',
                        phoneNumber: u.phoneNumber || v?.phoneNumber || '',
                        role: u.role || (v ? 'vendor' : 'client'),
                        isVerified: Boolean(src.isVerified),
                    },
                };
            }));

        vendors.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
        res.status(200).json({ vendors, count: vendors.length });
    } catch (error: any) {
        console.error('Get pending vendors error:', error);
        res.status(500).json({ error: 'Failed to retrieve pending verifications' });
    }
});

/**
 * @route   PUT /api/admin/vendors/:id/verify
 * @desc    Approve / reject. For vendors this lists (or rejects) the store and grants (or refuses)
 *          the identity-verified badge. For clients it grants or refuses the badge.
 */
router.put('/vendors/:id/verify', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be approved or rejected.' });
        }
        const rejectionReason = str(req.body.rejectionReason, 500) || 'Your application did not meet our verification requirements.';
        const approved = status === 'approved';
        const now = new Date().toISOString();

        const [vDoc, uDoc] = await Promise.all([db.collection('vendors').doc(id).get(), db.collection('users').doc(id).get()]);
        if (!uDoc.exists) return res.status(404).json({ error: 'User not found' });
        const user = uDoc.data()!;
        const isVendor = vDoc.exists && user.role === 'vendor';

        if (isVendor) {
            const v = vDoc.data()!;
            const update: Record<string, any> = { verificationRequest: null, updatedAt: now };
            if (approved) {
                Object.assign(update, { verificationStatus: 'approved', isVerified: true, verifiedAt: now, rejectionReason: null });
            } else {
                // Rejecting the badge never unlists an already-approved store
                if (v.verificationStatus !== 'approved') update.verificationStatus = 'rejected';
                Object.assign(update, { isVerified: false, rejectionReason });
            }
            await db.collection('vendors').doc(id).set(update, { merge: true });
        } else {
            await db.collection('users').doc(id).set({
                verificationRequest: null,
                isVerified: approved,
                verifiedAt: approved ? now : null,
                rejectionReason: approved ? null : rejectionReason,
                updatedAt: now,
            }, { merge: true });
        }
        invalidateVendorList();
        clearProfileCache(id);

        if (user.pushToken) {
            const name = (vDoc.exists && vDoc.data()!.businessName) || user.fullName || 'Your account';
            notifyVendorApproval(user.pushToken, status, name, approved ? undefined : rejectionReason).catch(() => {});
        }

        res.status(200).json({ message: `Account ${status} successfully`, isVerified: approved, status });
    } catch (error: any) {
        console.error('Verify vendor error:', error);
        res.status(500).json({ error: 'Failed to update verification status' });
    }
});

/**
 * @route   GET /api/admin/analytics
 */
router.get('/analytics', async (_req: Request, res: Response) => {
    try {
        const count = async (q: FirebaseFirestore.Query) => (await q.count().get()).data().count;
        const [totalUsers, totalVendors, activeVendors, pendingVendors, totalReviews] = await Promise.all([
            count(db.collection('users')),
            count(db.collection('vendors')),
            count(db.collection('vendors').where('verificationStatus', '==', 'approved')),
            count(db.collection('vendors').where('verificationStatus', '==', 'pending')),
            count(db.collection('reviews')),
        ]);
        res.status(200).json({ totalUsers, totalVendors, activeVendors, pendingVendors, totalReviews });
    } catch (error: any) {
        console.error('Get analytics error:', error);
        res.status(500).json({ error: 'Failed to retrieve analytics' });
    }
});

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    Permanently delete a user and all their data
 */
router.delete('/users/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const blocked = protectedTarget(req, id);
        if (blocked) return res.status(403).json({ error: blocked });

        const target = await db.collection('users').doc(id).get();
        if (target.exists && target.data()!.role === 'admin' && req.user!.uid !== MASTER_ADMIN_UID) {
            return res.status(403).json({ error: 'Only the root administrator can delete another administrator.' });
        }

        const result = await deleteAccountData(id);
        console.log(`🗑️ Admin ${req.user!.uid} deleted user ${id} (${result.deletedDocuments} documents)`);
        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error: any) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

/**
 * @route   POST /api/admin/vendors/create
 * @desc    Admin creates a vendor account (store is listed immediately)
 */
router.post('/vendors/create', authLimiter, async (req: Request, res: Response) => {
    try {
        const email = str(req.body.email, 200);
        const password = typeof req.body.password === 'string' ? req.body.password : '';
        const fullName = str(req.body.fullName, 100);
        const businessName = str(req.body.businessName, 100);
        const category = str(req.body.category, 80);
        const phoneNumber = str(req.body.phoneNumber, 25);

        if (!EMAIL_RE.test(email) || !fullName || !businessName || !category) {
            return res.status(400).json({ error: 'Valid email, full name, business name and category are required' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long' });
        }

        const record = await auth.createUser({ email, password, displayName: fullName });
        const now = new Date().toISOString();
        const batch = db.batch();
        batch.set(db.collection('users').doc(record.uid), {
            uid: record.uid, email, fullName, phoneNumber: phoneNumber || null,
            role: 'vendor', isVerified: false, isSuspended: false, createdAt: now, updatedAt: now,
        });
        batch.set(db.collection('vendors').doc(record.uid), {
            uid: record.uid,
            businessName,
            category,
            description: str(req.body.description, 2000),
            address: str(req.body.address, 300),
            services: Array.isArray(req.body.services) ? req.body.services.slice(0, 30).map((s: any) => String(s).slice(0, 80)) : [],
            phoneNumber: phoneNumber || null,
            verificationStatus: 'approved',
            isVerified: false,
            location: null,
            averageRating: 0, totalReviews: 0, ratingSum: 0,
            createdAt: now, updatedAt: now,
        });
        await batch.commit();
        invalidateVendorList();

        res.status(201).json({ message: 'Vendor created successfully', vendor: { uid: record.uid, email, businessName, category } });
    } catch (error: any) {
        if (error?.code === 'auth/email-already-exists') return res.status(409).json({ error: 'An account with this email already exists' });
        console.error('Create vendor error:', error);
        res.status(500).json({ error: 'Failed to create vendor' });
    }
});

/**
 * @route   GET /api/admin/users
 */
router.get('/users', async (_req: Request, res: Response) => {
    try {
        const [usersSnap, vendorsSnap] = await Promise.all([
            db.collection('users').limit(2000).get(),
            db.collection('vendors').limit(2000).get(),
        ]);
        const vendors = new Map(vendorsSnap.docs.map(d => [d.id, d.data()]));
        const users = usersSnap.docs
            .filter(d => d.id !== SUPPORT_UID)
            .map(d => mapUser(d.id, d.data(), d.data().role === 'vendor' ? vendors.get(d.id) : null))
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        res.status(200).json({ users, count: users.length });
    } catch (error: any) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to retrieve users' });
    }
});

/**
 * @route   GET /api/admin/reviews
 */
router.get('/reviews', async (_req: Request, res: Response) => {
    try {
        const snap = await db.collection('reviews').limit(1000).get();
        const raw = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        const people = await getDisplayProfiles(raw.flatMap(r => [r.vendorId, r.clientId]));

        const reviews = raw.map(r => {
            const vendor = people.get(r.vendorId);
            const client = people.get(r.clientId);
            return {
                id: r.id,
                rating: Number(r.rating) || 0,
                comment: r.comment || '',
                vendorId: r.vendorId,
                vendorName: vendor?.name || 'Vendor',
                vendorIsVerified: Boolean(vendor?.isVerified),
                clientId: r.clientId,
                clientName: client?.name || 'Pointer user',
                clientIsVerified: Boolean(client?.isVerified),
                clientIsAdmin: Boolean(client?.isAdmin),
                createdAt: r.createdAt,
            };
        });
        res.status(200).json({ reviews, count: reviews.length });
    } catch (error: any) {
        console.error('Get admin reviews error:', error);
        res.status(500).json({ error: 'Failed to retrieve reviews' });
    }
});

/**
 * @route   DELETE /api/admin/reviews/:vendorId/:clientId
 * @desc    Remove an abusive review (the vendor's rating is corrected)
 */
router.delete('/reviews/:vendorId/:clientId', async (req: Request, res: Response) => {
    try {
        const { deleteReview } = await import('./client.routes');
        const deleted = await deleteReview(req.params.vendorId, req.params.clientId);
        if (!deleted) return res.status(404).json({ error: 'Review not found' });
        res.status(200).json({ message: 'Review removed' });
    } catch (error: any) {
        console.error('Admin delete review error:', error);
        res.status(500).json({ error: 'Failed to remove review' });
    }
});

/**
 * @route   PUT /api/admin/users/:id/suspend
 * @desc    Suspend (signs the user out everywhere and hides their store) or unsuspend
 */
router.put('/users/:id/suspend', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const suspended = Boolean(req.body.suspended);
        const blocked = protectedTarget(req, id);
        if (blocked) return res.status(403).json({ error: blocked });

        const doc = await db.collection('users').doc(id).get();
        if (!doc.exists) return res.status(404).json({ error: 'User not found' });
        if (doc.data()!.role === 'admin' && req.user!.uid !== MASTER_ADMIN_UID) {
            return res.status(403).json({ error: 'Only the root administrator can suspend another administrator.' });
        }

        const now = new Date().toISOString();
        await db.collection('users').doc(id).set({
            isSuspended: suspended,
            suspendedAt: suspended ? now : null,
            suspendedBy: suspended ? req.user!.uid : null,
            updatedAt: now,
        }, { merge: true });
        if (suspended) {
            try { await auth.revokeRefreshTokens(id); } catch (_) {}
        }
        invalidateVendorList();
        clearProfileCache(id);

        res.status(200).json({ message: suspended ? 'User suspended successfully' : 'User unsuspended successfully', isSuspended: suspended });
    } catch (error: any) {
        console.error('Suspend user error:', error);
        res.status(500).json({ error: 'Failed to update user status' });
    }
});

/**
 * @route   PUT /api/admin/users/:id/verified
 * @desc    Grant or revoke the verified badge directly
 */
router.put('/users/:id/verified', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { isVerified } = req.body;
        if (typeof isVerified !== 'boolean') {
            return res.status(400).json({ error: 'isVerified must be a boolean (true or false).' });
        }
        const [uDoc, vDoc] = await Promise.all([db.collection('users').doc(id).get(), db.collection('vendors').doc(id).get()]);
        if (!uDoc.exists) return res.status(404).json({ error: 'User not found' });

        const now = new Date().toISOString();
        const update = { isVerified, verifiedAt: isVerified ? now : null, verificationRequest: null, updatedAt: now };
        const isVendor = vDoc.exists && uDoc.data()!.role === 'vendor';
        await db.collection(isVendor ? 'vendors' : 'users').doc(id).set(update, { merge: true });
        invalidateVendorList();
        clearProfileCache(id);

        res.status(200).json({
            message: isVerified ? 'Verified badge granted' : 'Verified badge revoked',
            isVerified,
            expiresAt: null,
        });
    } catch (error: any) {
        console.error('Admin badge update error:', error);
        res.status(500).json({ error: 'Failed to update badge status' });
    }
});

/**
 * @route   GET /api/admin/conversions/pending
 */
router.get('/conversions/pending', async (_req: Request, res: Response) => {
    try {
        const snap = await db.collection('conversion_requests').where('status', '==', 'pending').get();
        const raw = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        const users = await Promise.all(raw.map(r => db.collection('users').doc(r.clientId).get()));
        const requests = await Promise.all(raw.map(async (r, i) => ({
            ...r,
            clientName: users[i].data()?.fullName || 'User',
            clientEmail: users[i].data()?.email || '',
            documentUrl: r.documentUrl ? await signedUrlFor(r.documentUrl) : '',
        })));
        res.status(200).json({ requests });
    } catch (error: any) {
        console.error('Get conversion requests error:', error);
        res.status(500).json({ error: 'Failed to fetch conversion requests' });
    }
});

/**
 * @route   PUT /api/admin/conversions/:id
 * @desc    Approve (client becomes a listed vendor) or reject an upgrade request
 */
router.put('/conversions/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be approved or rejected.' });
        }
        const reqRef = db.collection('conversion_requests').doc(id);
        const reqDoc = await reqRef.get();
        if (!reqDoc.exists) return res.status(404).json({ error: 'Conversion request not found' });
        const r = reqDoc.data()!;
        if (r.status !== 'pending') return res.status(409).json({ error: `This request was already ${r.status}` });

        const now = new Date().toISOString();
        const batch = db.batch();
        batch.set(reqRef, { status, adminNotes: str(req.body.notes, 500), resolvedAt: now, resolvedBy: req.user!.uid }, { merge: true });
        batch.set(db.collection('users').doc(r.clientId), {
            hasPendingVendorConversion: false,
            pendingConversionId: null,
            ...(status === 'approved' ? { role: 'vendor', updatedAt: now } : {}),
        }, { merge: true });
        if (status === 'approved') {
            batch.set(db.collection('vendors').doc(r.clientId), {
                uid: r.clientId,
                businessName: r.businessName,
                category: r.category,
                description: r.description || '',
                address: r.address || '',
                phoneNumber: r.phoneNumber || null,
                verificationStatus: 'approved',
                isVerified: false, // the identity badge is a separate (free) request
                location: null,
                averageRating: 0, totalReviews: 0, ratingSum: 0,
                createdAt: now,
                updatedAt: now,
            }, { merge: true });
        }
        await batch.commit();
        invalidateVendorList();
        clearProfileCache(r.clientId);

        res.status(200).json({ message: `Conversion request ${status}`, status });
    } catch (error: any) {
        console.error('Resolve conversion error:', error);
        res.status(500).json({ error: 'Failed to process conversion' });
    }
});

/**
 * @route   GET /api/admin/adverts/pending
 */
router.get('/adverts/pending', async (_req: Request, res: Response) => {
    try {
        const snap = await db.collection('advert_requests').where('status', '==', 'pending').get();
        res.status(200).json({ adverts: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    } catch (error: any) {
        console.error('Get advert requests error:', error);
        res.status(500).json({ error: 'Failed to fetch advert requests' });
    }
});

/**
 * @route   PUT /api/admin/adverts/:id
 */
router.put('/adverts/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be approved or rejected.' });
        }
        const advRef = db.collection('advert_requests').doc(id);
        const advDoc = await advRef.get();
        if (!advDoc.exists) return res.status(404).json({ error: 'Advert request not found' });
        const adv = advDoc.data()!;

        const now = new Date();
        const expiresAt = new Date(now.getTime() + (Number(adv.durationDays) || 7) * 86400000).toISOString();
        await advRef.set({
            status,
            adminNotes: str(req.body.notes, 500),
            resolvedAt: now.toISOString(),
            expiresAt: status === 'approved' ? expiresAt : null,
        }, { merge: true });

        if (status === 'approved' && adv.postId) {
            const post = await db.collection('posts').doc(adv.postId).get();
            if (post.exists) {
                await post.ref.set({ promoted: true, promotedUntil: expiresAt, boostPlan: adv.plan || 'Standard Boost' }, { merge: true });
            }
        }
        res.status(200).json({ message: `Advert request ${status}`, status });
    } catch (error: any) {
        console.error('Resolve advert error:', error);
        res.status(500).json({ error: 'Failed to process advert' });
    }
});

export default router;
