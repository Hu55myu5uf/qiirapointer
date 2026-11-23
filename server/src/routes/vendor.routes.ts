import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../config/firebase';
import { authenticateUser, optionalAuthenticateUser, requireSelfOrAdmin } from '../utils/authMiddleware';
import { decodeUpload, saveUpload, isOwnPrivateRef, UploadError, FileKind } from '../utils/fileStorage';
import { getDisplayProfiles, clearProfileCache, usableImage } from '../utils/profiles';
import { toVendorResponse, getApprovedVendors, invalidateVendorList, validLatLng, distanceMeters, verificationState, isListed } from '../utils/vendors';
import { checkFieldLock, lockedUntil } from '../utils/fieldLocks';
import { uploadLimiter, writeLimiter } from '../utils/rateLimiter';

const router = Router();

/**
 * Identity verification badge (Option C: FREE at launch).
 * A vendor submits an identity document; an administrator reviews it and grants the badge.
 * Paid features ("Pointer Pro") will come later through Apple / Google in-app purchase.
 */
export const VERIFIED_BADGE = {
    price: 0,
    currency: '₦',
    period: '',
    isFree: true,
    badgeColor: '#B28A45',
    icon: 'checkmark-circle',
    features: [
        'Verified badge on your profile',
        'Shows customers your identity has been checked',
        'Increased trust & credibility',
    ],
};

// Paid ad boosts are switched off for launch (store payment rules). Set ADVERTS_ENABLED=true to re-enable.
const advertsEnabled = () => process.env.ADVERTS_ENABLED === 'true';

const LIMITS = {
    businessName: 100, category: 80, description: 2000, address: 300,
    service: 80, services: 30, docTitle: 120, catalogName: 100, catalogDescription: 500,
    catalogItems: 200, menuDocuments: 30,
};

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const isHttpsUrl = (v: unknown) => typeof v === 'string' && v.length <= 2048 && /^https:\/\/[^\s]+$/i.test(v);

/** Categories are stored as "Main category - Subcategory"; filtering is by the main category. */
const mainCategoryOf = (category: string) => String(category || '').split(' - ')[0].trim().toLowerCase();

function matchesCategory(vendorCategory: string, wanted: string) {
    const v = mainCategoryOf(vendorCategory);
    const w = mainCategoryOf(wanted);
    if (!v || !w) return false;
    return v === w;
}

async function loadVendor(uid: string) {
    const [vDoc, uDoc] = await Promise.all([
        db.collection('vendors').doc(uid).get(),
        db.collection('users').doc(uid).get(),
    ]);
    return { v: vDoc.exists ? vDoc.data()! : null, u: uDoc.exists ? uDoc.data()! : null };
}

/** After any vendor write: drop cached lists/profiles so changes show up immediately. */
function vendorChanged(uid: string) {
    invalidateVendorList();
    clearProfileCache(uid);
}

/**
 * @route   GET /api/vendors
 * @desc    Approved vendors. Filters: category, search. With latitude/longitude: distance-sorted,
 *          optional radius (metres). Paging: limit (max 100) + offset.
 * @access  Public
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const { category, search } = req.query;
        const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
        const offset = Math.max(Number(req.query.offset) || 0, 0);
        const origin = validLatLng({ latitude: req.query.latitude, longitude: req.query.longitude });
        const radius = Number(req.query.radius) || 0;

        // Discover lists businesses only: a vendor appears once their profile has a category
        let vendors: any[] = (await getApprovedVendors()).filter(v => Boolean(mainCategoryOf(v.category)));

        if (typeof category === 'string' && category && category !== 'All') {
            vendors = vendors.filter(v => matchesCategory(v.category, category));
        }
        if (typeof search === 'string' && search.trim()) {
            const s = search.trim().toLowerCase().slice(0, 100);
            vendors = vendors.filter(v =>
                v.businessName.toLowerCase().includes(s) ||
                v.description.toLowerCase().includes(s) ||
                v.category.toLowerCase().includes(s) ||
                v.services.some((x: string) => String(x).toLowerCase().includes(s)));
        }

        if (origin) {
            vendors = vendors.map(v => ({ ...v, distanceMeters: v.location ? distanceMeters(origin, v.location) : null }));
            if (radius > 0) vendors = vendors.filter(v => v.distanceMeters !== null && v.distanceMeters <= radius);
            vendors.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
        } else {
            // Verified first, then best rated, then newest
            vendors = [...vendors].sort((a, b) =>
                Number(b.isVerified) - Number(a.isVerified) ||
                b.averageRating - a.averageRating ||
                String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        }

        const page = vendors.slice(offset, offset + limit);
        res.status(200).json({
            vendors: page,
            count: page.length,
            total: vendors.length,
            nextOffset: offset + limit < vendors.length ? offset + limit : null,
        });
    } catch (error: any) {
        console.error('Get vendors error:', error);
        res.status(500).json({ error: 'Failed to retrieve vendors' });
    }
});

/**
 * @route   GET /api/vendors/badge/info
 */
router.get('/badge/info', (_req: Request, res: Response) => {
    res.status(200).json({ badge: VERIFIED_BADGE });
});

/**
 * @route   GET /api/vendors/:id
 * @desc    Vendor details. Unapproved vendors are only visible to themselves and admins.
 * @access  Public
 */
router.get('/:id', optionalAuthenticateUser, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { v, u } = await loadVendor(id);
        const isOwnerOrAdmin = Boolean(req.user && (req.user.uid === id || req.user.isAdmin));

        if (!v || !u || (u.role !== 'vendor' && u.role !== 'admin')) {
            return res.status(404).json({ error: 'Vendor not found' });
        }
        if ((!isListed(v) || u.isSuspended) && !isOwnerOrAdmin) {
            return res.status(404).json({ error: 'Vendor not found' });
        }

        const vendor: any = toVendorResponse(id, v, u);
        if (isOwnerOrAdmin) {
            vendor.rejectionReason = v.rejectionReason || null;
            vendor.verificationDocumentSubmitted = Boolean(v.verificationDocument);
        }
        res.status(200).json({ vendor });
    } catch (error: any) {
        console.error('Get vendor error:', error);
        res.status(500).json({ error: 'Failed to retrieve vendor' });
    }
});

/**
 * @route   PUT /api/vendors/:id/profile
 * @access  Vendor (self) or admin
 */
router.put('/:id/profile', authenticateUser, requireSelfOrAdmin('id'), writeLimiter, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const b = req.body || {};
        const update: Record<string, any> = { updatedAt: new Date().toISOString() };

        if (b.businessName !== undefined) {
            const name = str(b.businessName, LIMITS.businessName);
            if (!name || name.length < 2) return res.status(400).json({ error: 'Business name must be 2–100 characters' });
            update.businessName = name;
        }
        if (b.category !== undefined) update.category = str(b.category, LIMITS.category) || '';
        const desc = b.description ?? b.aboutUs ?? b.about_us ?? b.bio;
        if (desc !== undefined) update.description = str(desc, LIMITS.description) || '';
        if (b.address !== undefined) update.address = str(b.address, LIMITS.address) || '';
        if (b.services !== undefined) {
            const list = Array.isArray(b.services) ? b.services : String(b.services).split(',');
            update.services = list.map((s: any) => str(String(s), LIMITS.service)).filter(Boolean).slice(0, LIMITS.services);
        }
        if (b.businessHours !== undefined) {
            if (b.businessHours !== null && typeof b.businessHours !== 'object') return res.status(400).json({ error: 'Invalid business hours' });
            if (JSON.stringify(b.businessHours || {}).length > 5000) return res.status(400).json({ error: 'Business hours are too long' });
            update.businessHours = b.businessHours;
        }
        if (b.location !== undefined) {
            if (b.location === null) update.location = null;
            else {
                const loc = validLatLng(b.location);
                if (!loc) return res.status(400).json({ error: 'Invalid location' });
                update.location = loc;
            }
        }
        for (const key of ['businessImage', 'bannerImage'] as const) {
            if (b[key] !== undefined) {
                if (b[key] !== null && b[key] !== '' && !isHttpsUrl(b[key])) return res.status(400).json({ error: `Invalid ${key}` });
                update[key] = b[key] || '';
            }
        }

        // Business name, category and profile photo: once every 30 days (admins excepted)
        const current = (await db.collection('vendors').doc(id).get()).data() || {};
        const bypass = Boolean(req.user!.isAdmin && req.user!.uid !== id);
        const changedAt: Record<string, string> = { ...(current.fieldChangedAt || {}) };
        let lockTouched = false;
        for (const field of ['businessName', 'category', 'businessImage'] as const) {
            if (update[field] === undefined) continue;
            const r = checkFieldLock(field, current[field], update[field], current.fieldChangedAt, bypass);
            if (!r.ok) return res.status(429).json({ error: r.message, field: r.field, nextAllowedAt: r.nextAllowedAt });
            if (!r.changed) { delete update[field]; continue; }
            if (!bypass && String(current[field] ?? '').trim()) { changedAt[field] = update.updatedAt; lockTouched = true; }
        }
        if (lockTouched) update.fieldChangedAt = changedAt;

        const batch = db.batch();
        batch.set(db.collection('vendors').doc(id), update, { merge: true });
        if (update.businessImage) {
            batch.set(db.collection('users').doc(id), { profileImage: update.businessImage, updatedAt: update.updatedAt }, { merge: true });
        }
        await batch.commit();
        vendorChanged(id);

        res.status(200).json({ message: 'Profile updated successfully', fieldLocks: lockedUntil(update.fieldChangedAt || current.fieldChangedAt) });
    } catch (error: any) {
        console.error('Update vendor error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

/**
 * @route   POST /api/vendors/upload-image
 * @desc    Upload an image (base64). imageType: profile | banner | post | catalog (public),
 *          vendor-kyc | vendor-upgrade | document (private identity documents)
 */
router.post('/upload-image', authenticateUser, uploadLimiter, async (req: Request, res: Response) => {
    try {
        const { imageData, imageType } = req.body;
        const uid = req.user!.uid;
        if (req.body.userId && req.body.userId !== uid && !req.user!.isAdmin) {
            return res.status(403).json({ error: 'Forbidden: You can only upload images for your own profile' });
        }
        const target = req.user!.isAdmin && req.body.userId ? String(req.body.userId) : uid;

        const file = decodeUpload(imageData, ['image']);
        const privateArea = imageType === 'vendor-kyc' || imageType === 'document' ? 'kyc'
            : imageType === 'vendor-upgrade' ? 'upgrade' : null;

        const saved = privateArea
            ? await saveUpload({ folder: [privateArea, target], namePrefix: 'id', file, visibility: 'private' })
            : await saveUpload({
                folder: [imageType === 'post' ? 'posts' : 'vendors', target],
                namePrefix: ['profile', 'banner', 'post', 'catalog'].includes(imageType) ? imageType : 'image',
                file,
                visibility: 'public',
            });

        res.status(200).json({ imageUrl: saved.url, isPrivate: Boolean(privateArea) });
    } catch (error: any) {
        if (error instanceof UploadError) return res.status(error.status).json({ error: error.message });
        console.error('Upload image error:', error);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

/**
 * @route   POST /api/vendors/upload-document
 * @desc    Upload a PDF / Word document / image. purpose: "menu" (public) | "kyc" | "upgrade" (private).
 *          Defaults to private.
 */
router.post('/upload-document', authenticateUser, uploadLimiter, async (req: Request, res: Response) => {
    try {
        const { fileData, fileName } = req.body;
        const uid = req.user!.uid;
        if (req.body.userId && req.body.userId !== uid && !req.user!.isAdmin) {
            return res.status(403).json({ error: 'Forbidden: You can only upload documents for your own account' });
        }
        const purpose = ['menu', 'kyc', 'upgrade'].includes(req.body.purpose) ? req.body.purpose : 'kyc';
        const allowed: FileKind[] = purpose === 'menu' ? ['pdf', 'image', 'word'] : ['pdf', 'image'];
        const file = decodeUpload(fileData, allowed);

        const baseName = String(fileName || 'document').replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'document';
        const saved = purpose === 'menu'
            ? await saveUpload({ folder: ['vendors', uid, 'menus'], namePrefix: baseName, file, visibility: 'public' })
            : await saveUpload({ folder: [purpose, uid], namePrefix: baseName, file, visibility: 'private' });

        res.status(200).json({
            fileUrl: saved.url,
            fileName: `${baseName}${file.ext}`,
            fileSize: saved.size,
            fileType: saved.contentType,
            isPrivate: purpose !== 'menu',
        });
    } catch (error: any) {
        if (error instanceof UploadError) return res.status(error.status).json({ error: error.message });
        console.error('Upload document error:', error);
        res.status(500).json({ error: 'Failed to upload document' });
    }
});

/**
 * @route   GET /api/vendors/:id/reviews
 * @access  Public
 */
router.get('/:id/reviews', async (req: Request, res: Response) => {
    try {
        const snap = await db.collection('reviews').where('vendorId', '==', req.params.id).get();
        const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
            .slice(0, 200);
        const people = await getDisplayProfiles(docs.map(r => r.clientId));

        const reviews = docs.map(r => {
            const p = people.get(r.clientId);
            const name = p?.name || 'Pointer user';
            return {
                id: r.id,
                rating: r.rating,
                comment: r.comment || '',
                createdAt: r.createdAt,
                updatedAt: r.updatedAt || null,
                clientId: r.clientId,
                clientName: name,
                reviewerName: name,
                reviewerAvatar: p?.avatar || null,
                isVerified: Boolean(p?.isVerified),
                isAdmin: Boolean(p?.isAdmin),
            };
        });
        res.status(200).json({ reviews });
    } catch (error: any) {
        console.error('Get vendor reviews error:', error);
        res.status(500).json({ error: 'Failed to load reviews' });
    }
});

/**
 * @route   GET /api/vendors/:id/comments
 * @desc    Recent comments across this vendor's posts
 * @access  Public
 */
router.get('/:id/comments', async (req: Request, res: Response) => {
    try {
        const postsSnap = await db.collection('posts').where('vendorId', '==', req.params.id).get();
        const posts = postsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
            .slice(0, 50);

        const perPost = await Promise.all(posts.map(async post => {
            const c = await db.collection('comments').where('postId', '==', post.id).get();
            return c.docs.map(cd => ({ post, id: cd.id, ...(cd.data() as any) }));
        }));
        const all = perPost.flat()
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
            .slice(0, 200);
        const people = await getDisplayProfiles(all.map(c => c.userId));

        const comments = all.map(c => {
            const p = people.get(c.userId);
            return {
                id: c.id,
                postId: c.post.id,
                postCaption: c.post.caption || 'Product Showcase',
                postMediaUrl: usableImage(c.post.thumbnailUrl) || usableImage(c.post.mediaUrl),
                userId: c.userId,
                userName: p?.name || 'Pointer user',
                userAvatar: p?.avatar || '',
                text: c.text || '',
                createdAt: c.createdAt,
                isVerified: Boolean(p?.isVerified),
                isAdmin: Boolean(p?.isAdmin),
            };
        });
        res.status(200).json({ comments, count: comments.length });
    } catch (error: any) {
        console.error('Get vendor comments error:', error);
        res.status(500).json({ error: 'Failed to load comments' });
    }
});

/**
 * @route   GET /api/vendors/:id/badge
 * @desc    Verified-badge status for a user (vendor or client)
 * @access  Public
 */
router.get('/:id/badge', async (req: Request, res: Response) => {
    try {
        const { v, u } = await loadVendor(req.params.id);
        if (!v && !u) return res.status(404).json({ error: 'User not found' });

        const state = verificationState(u?.role === 'vendor' ? v : null, u || v, u?.role === 'admin');
        res.status(200).json({
            isVerified: state.isVerified,
            isPending: state.badgeStatus === 'pending',
            badgeStatus: state.badgeStatus,
            // Old shape kept for installed app versions
            verificationStatus: state.badgeStatus === 'verified' ? 'approved' : state.badgeStatus,
            subscribedAt: null,
            expiresAt: null,
            badgeInfo: VERIFIED_BADGE,
        });
    } catch (error: any) {
        console.error('Get badge status error:', error);
        res.status(500).json({ error: 'Failed to retrieve badge status' });
    }
});

/**
 * @route   POST /api/vendors/:id/badge/purchase
 * @desc    Retired: the badge is free and requires an identity document (submit-verification).
 */
router.post('/:id/badge/purchase', authenticateUser, (_req: Request, res: Response) => {
    res.status(410).json({
        error: 'Verification is now free',
        message: 'Submit an identity document from the verification screen to request your verified badge.',
    });
});

/**
 * @route   POST /api/vendors/:id/submit-verification
 * @desc    Submit an identity document (uploaded privately) for the free verified badge.
 *          Works for vendors and clients. Never unlists an already-approved store.
 */
router.post('/:id/submit-verification', authenticateUser, requireSelfOrAdmin('id'), writeLimiter, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { documentType, documentUrl, documentName, documentFileType, notes } = req.body;

        if (!isOwnPrivateRef(documentUrl, 'kyc', id)) {
            return res.status(400).json({ error: 'Please upload your identity document again, then submit.' });
        }

        const { v, u } = await loadVendor(id);
        if (!u) return res.status(404).json({ error: 'User not found' });
        const isVendorAccount = Boolean(v) && u.role === 'vendor';
        const current: any = isVendorAccount ? v : u;
        if (current.isVerified) return res.status(409).json({ error: 'You are already verified' });

        const now = new Date().toISOString();
        const verificationDocument = {
            type: str(documentType, 80) || 'National ID (NIN)',
            ref: documentUrl,
            name: str(documentName, 120) || 'Identity Document',
            fileType: str(documentFileType, 100) || 'image/jpeg',
            notes: str(notes, 500) || '',
            submittedAt: now,
        };
        const update = { verificationDocument, verificationRequest: 'pending', rejectionReason: null, updatedAt: now };

        // The request lives on the vendor doc for vendors, on the user doc for clients
        const target = isVendorAccount ? db.collection('vendors').doc(id) : db.collection('users').doc(id);
        await target.set(update, { merge: true });
        vendorChanged(id);

        const { ref: _hidden, ...publicDoc } = verificationDocument;
        res.status(200).json({
            message: 'Verification document submitted! An administrator will review it shortly.',
            status: 'pending',
            document: publicDoc,
        });
    } catch (error: any) {
        console.error('Submit verification error:', error);
        res.status(500).json({ error: 'Failed to submit verification' });
    }
});

// ─── Menu documents (public PDFs / images) ──────────────────────────────────

router.get(['/:id/documents', '/:id/menu-documents'], async (req: Request, res: Response) => {
    try {
        const { v } = await loadVendor(req.params.id);
        res.status(200).json({ documents: (v?.menuDocuments || []).filter((d: any) => isHttpsUrl(d.url)) });
    } catch (error: any) {
        console.error('Get documents error:', error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

router.post(['/:id/documents', '/:id/menu-documents'], authenticateUser, requireSelfOrAdmin('id'), writeLimiter, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const title = str(req.body.title, LIMITS.docTitle);
        const { url, fileType, fileSize } = req.body;
        if (!title) return res.status(400).json({ error: 'Title must be 1–120 characters' });
        // Customers tap these links directly, so only real https links are accepted
        if (!isHttpsUrl(url)) return res.status(400).json({ error: 'Document link must be an https:// URL' });

        const newDoc = {
            id: `doc_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
            title,
            url,
            fileType: str(fileType, 100) || 'application/pdf',
            fileSize: Number(fileSize) || 0,
            uploadedAt: new Date().toISOString(),
        };

        const ref = db.collection('vendors').doc(id);
        const result = await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            const list = snap.exists ? (snap.data()!.menuDocuments || []) : [];
            if (list.length >= LIMITS.menuDocuments) return 'full';
            tx.set(ref, { menuDocuments: [...list, newDoc], updatedAt: newDoc.uploadedAt }, { merge: true });
            return 'ok';
        });
        if (result === 'full') return res.status(400).json({ error: `You can add up to ${LIMITS.menuDocuments} documents` });

        res.status(201).json({ message: 'Document added successfully', document: newDoc });
    } catch (error: any) {
        console.error('Add document error:', error);
        res.status(500).json({ error: 'Failed to add document' });
    }
});

router.delete(['/:id/documents/:docId', '/:id/menu-documents/:docId'], authenticateUser, requireSelfOrAdmin('id'), async (req: Request, res: Response) => {
    try {
        const { id, docId } = req.params;
        const ref = db.collection('vendors').doc(id);
        await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            if (!snap.exists) return;
            const list = (snap.data()!.menuDocuments || []).filter((d: any) => d.id !== docId);
            tx.set(ref, { menuDocuments: list }, { merge: true });
        });
        res.status(200).json({ message: 'Document removed successfully', docId });
    } catch (error: any) {
        console.error('Delete document error:', error);
        res.status(500).json({ error: 'Failed to delete document' });
    }
});

/**
 * @route   PUT /api/vendors/:id/location
 * @desc    Switch between live GPS location and the business location
 */
router.put('/:id/location', authenticateUser, requireSelfOrAdmin('id'), writeLimiter, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const useLiveLocation = Boolean(req.body.useLiveLocation);
        const update: Record<string, any> = { useLiveLocation, updatedAt: new Date().toISOString() };

        if (useLiveLocation) {
            const live = validLatLng({ latitude: req.body.liveLatitude, longitude: req.body.liveLongitude });
            if (!live) return res.status(400).json({ error: 'A valid live location is required' });
            update.liveLocation = { ...live, updatedAt: update.updatedAt };
        }
        // Optionally set the fixed business location at the same time
        if (req.body.businessLatitude !== undefined) {
            const loc = validLatLng({ latitude: req.body.businessLatitude, longitude: req.body.businessLongitude });
            if (!loc) return res.status(400).json({ error: 'Invalid business location' });
            update.location = loc;
        }

        await db.collection('vendors').doc(id).set(update, { merge: true });
        vendorChanged(id);
        res.status(200).json({
            message: useLiveLocation ? 'Live location enabled' : 'Switched to business location',
            useLiveLocation,
        });
    } catch (error: any) {
        console.error('Update location error:', error);
        res.status(500).json({ error: 'Failed to update location' });
    }
});

// ─── Catalog ────────────────────────────────────────────────────────────────

router.get('/:id/catalog', async (req: Request, res: Response) => {
    try {
        const { v } = await loadVendor(req.params.id);
        res.status(200).json({ catalog: v?.catalogItems || [] });
    } catch (error: any) {
        console.error('Get catalog error:', error);
        res.status(500).json({ error: 'Failed to fetch catalog' });
    }
});

router.post('/:id/catalog', authenticateUser, requireSelfOrAdmin('id'), writeLimiter, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const name = str(req.body.name, LIMITS.catalogName);
        const price = Number(req.body.price);
        if (!name) return res.status(400).json({ error: 'Item name is required' });
        if (!Number.isFinite(price) || price < 0 || price > 1_000_000_000) {
            return res.status(400).json({ error: 'Please enter a valid price' });
        }
        if (req.body.imageUrl && !isHttpsUrl(req.body.imageUrl)) {
            return res.status(400).json({ error: 'Invalid image' });
        }

        const newItem = {
            id: `cat_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
            name,
            price,
            category: str(req.body.category, LIMITS.category) || 'General',
            imageUrl: req.body.imageUrl || '',
            description: str(req.body.description, LIMITS.catalogDescription) || '',
            inStock: req.body.inStock !== false,
            createdAt: new Date().toISOString(),
        };

        const ref = db.collection('vendors').doc(id);
        const result = await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            const list = snap.exists ? (snap.data()!.catalogItems || []) : [];
            if (list.length >= LIMITS.catalogItems) return 'full';
            tx.set(ref, { catalogItems: [newItem, ...list] }, { merge: true });
            return 'ok';
        });
        if (result === 'full') return res.status(400).json({ error: `Your catalog can hold up to ${LIMITS.catalogItems} items` });

        res.status(201).json({ message: 'Catalog item added successfully', item: newItem });
    } catch (error: any) {
        console.error('Add catalog item error:', error);
        res.status(500).json({ error: 'Failed to add catalog item' });
    }
});

router.delete('/:id/catalog/:itemId', authenticateUser, requireSelfOrAdmin('id'), async (req: Request, res: Response) => {
    try {
        const { id, itemId } = req.params;
        const ref = db.collection('vendors').doc(id);
        await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            if (!snap.exists) return;
            tx.set(ref, { catalogItems: (snap.data()!.catalogItems || []).filter((i: any) => i.id !== itemId) }, { merge: true });
        });
        res.status(200).json({ message: 'Catalog item removed', itemId });
    } catch (error: any) {
        console.error('Delete catalog item error:', error);
        res.status(500).json({ error: 'Failed to delete catalog item' });
    }
});

/**
 * @route   POST /api/vendors/:id/advert-request
 * @desc    Ad boost request — disabled at launch (Option C).
 */
router.post('/:id/advert-request', authenticateUser, requireSelfOrAdmin('id'), writeLimiter, async (req: Request, res: Response) => {
    if (!advertsEnabled()) {
        return res.status(403).json({ error: 'Promotions are not available yet', message: 'Post promotions are coming soon.' });
    }
    try {
        const { id } = req.params;
        const postId = str(req.body.postId, 200);
        if (!postId) return res.status(400).json({ error: 'postId is required' });

        const advertData = {
            id: `adv_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
            vendorId: id,
            postId,
            postCaption: str(req.body.postCaption, 500) || '',
            mediaUrl: isHttpsUrl(req.body.mediaUrl) ? req.body.mediaUrl : '',
            plan: str(req.body.plan, 80) || 'Standard Boost',
            durationDays: Math.min(Math.max(Number(req.body.durationDays) || 7, 1), 90),
            notes: str(req.body.notes, 500) || '',
            status: 'pending',
            createdAt: new Date().toISOString(),
        };
        await db.collection('advert_requests').doc(advertData.id).set(advertData);
        res.status(201).json({ message: 'Advert request submitted!', advert: advertData });
    } catch (error: any) {
        console.error('Advert request error:', error);
        res.status(500).json({ error: 'Failed to submit advert request' });
    }
});

export default router;
