import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { notifyNewReview } from '../utils/pushNotifications';
import { authenticateUser, requireSelfOrAdmin } from '../utils/authMiddleware';
import { isOwnPrivateRef } from '../utils/fileStorage';
import { getDisplayProfile } from '../utils/profiles';
import { toVendorResponse, invalidateVendorList, isListed } from '../utils/vendors';
import { writeLimiter } from '../utils/rateLimiter';

const router = Router();

const MAX_REVIEW_LENGTH = 1000;
const MAX_FAVORITES = 500;

/** One review per (vendor, client) pair — the document id enforces it. */
export const reviewIdFor = (vendorId: string, clientId: string) => `${vendorId}_${clientId}`;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Recalculate a vendor's rating inside a transaction from the stored running totals.
 * `delta` adjusts the sum and count (e.g. a new review: +rating, +1).
 */
function applyRatingDelta(current: any, sumDelta: number, countDelta: number) {
    const ratingSum = Math.max(0, (Number(current.ratingSum) || 0) + sumDelta);
    const totalReviews = Math.max(0, (Number(current.totalReviews) || 0) + countDelta);
    const averageRating = totalReviews > 0 ? Math.round((ratingSum / totalReviews) * 100) / 100 : 0;
    return { ratingSum, totalReviews, averageRating };
}

/**
 * @route   POST /api/clients/:id/reviews
 * @desc    Write (or update) your review of a vendor. One review per vendor; you can't review yourself.
 * @access  Owner
 */
router.post('/:id/reviews', authenticateUser, requireSelfOrAdmin('id'), writeLimiter, async (req: Request, res: Response) => {
    try {
        const clientId = req.params.id;
        const { vendorId } = req.body;
        const rating = Number(req.body.rating);
        const comment = str(req.body.comment, MAX_REVIEW_LENGTH + 1);

        if (!vendorId || typeof vendorId !== 'string') {
            return res.status(400).json({ error: 'Vendor ID is required' });
        }
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Rating must be a whole number from 1 to 5' });
        }
        if (comment.length > MAX_REVIEW_LENGTH) {
            return res.status(400).json({ error: `Reviews can be at most ${MAX_REVIEW_LENGTH} characters` });
        }
        // Neither the account the review is for nor the person sending it may own the business
        if (vendorId === clientId || vendorId === req.user!.uid) {
            return res.status(400).json({ error: 'You cannot review your own business' });
        }

        const vendorRef = db.collection('vendors').doc(vendorId);
        const reviewRef = db.collection('reviews').doc(reviewIdFor(vendorId, clientId));
        const now = new Date().toISOString();

        const outcome = await db.runTransaction(async tx => {
            const [vendorSnap, reviewSnap] = await Promise.all([tx.get(vendorRef), tx.get(reviewRef)]);
            if (!vendorSnap.exists || !isListed(vendorSnap.data())) return 'no-vendor' as const;

            const previous = reviewSnap.exists ? Number(reviewSnap.data()!.rating) || 0 : null;
            const totals = previous === null
                ? applyRatingDelta(vendorSnap.data(), rating, 1)
                : applyRatingDelta(vendorSnap.data(), rating - previous, 0);

            tx.set(reviewRef, {
                vendorId,
                clientId,
                rating,
                comment,
                createdAt: reviewSnap.exists ? reviewSnap.data()!.createdAt : now,
                updatedAt: now,
            });
            tx.set(vendorRef, totals, { merge: true });
            return previous === null ? 'created' as const : 'updated' as const;
        });

        if (outcome === 'no-vendor') return res.status(404).json({ error: 'Vendor not found' });
        invalidateVendorList();

        // Notify the vendor about new reviews (best effort)
        if (outcome === 'created') {
            try {
                const [vendorUser, vendorDoc, reviewer] = await Promise.all([
                    db.collection('users').doc(vendorId).get(),
                    vendorRef.get(),
                    getDisplayProfile(clientId),
                ]);
                const pushToken = vendorUser.data()?.pushToken;
                if (pushToken) {
                    await notifyNewReview(pushToken, reviewer.name, rating, vendorDoc.data()?.businessName || 'your business');
                }
            } catch (e: any) {
                console.warn('Review notification note:', e.message);
            }
        }

        res.status(outcome === 'created' ? 201 : 200).json({
            message: outcome === 'created' ? 'Review submitted successfully' : 'Your review has been updated',
            reviewId: reviewRef.id,
            updated: outcome === 'updated',
        });
    } catch (error: any) {
        console.error('Submit review error:', error);
        res.status(500).json({ error: 'Failed to submit review' });
    }
});

/**
 * @route   DELETE /api/clients/:id/reviews/:vendorId
 * @desc    Delete your own review of a vendor
 */
router.delete('/:id/reviews/:vendorId', authenticateUser, requireSelfOrAdmin('id'), async (req: Request, res: Response) => {
    try {
        const { id: clientId, vendorId } = req.params;
        const deleted = await deleteReview(vendorId, clientId);
        if (!deleted) return res.status(404).json({ error: 'Review not found' });
        res.status(200).json({ message: 'Review deleted' });
    } catch (error: any) {
        console.error('Delete review error:', error);
        res.status(500).json({ error: 'Failed to delete review' });
    }
});

/** Delete a review and take it out of the vendor's rating. Used by users, admins and account deletion. */
export async function deleteReview(vendorId: string, clientId: string): Promise<boolean> {
    const vendorRef = db.collection('vendors').doc(vendorId);
    const reviewRef = db.collection('reviews').doc(reviewIdFor(vendorId, clientId));
    const deleted = await db.runTransaction(async tx => {
        const [reviewSnap, vendorSnap] = await Promise.all([tx.get(reviewRef), tx.get(vendorRef)]);
        if (!reviewSnap.exists) return false;
        tx.delete(reviewRef);
        if (vendorSnap.exists) {
            tx.set(vendorRef, applyRatingDelta(vendorSnap.data(), -(Number(reviewSnap.data()!.rating) || 0), -1), { merge: true });
        }
        return true;
    });
    if (deleted) invalidateVendorList();
    return deleted;
}

// ─── Favourites: favorites/{clientId}_{vendorId}  { clientId, vendorId, createdAt } ─────
// A top-level collection so both "my favourites" and "who favourited this store" use
// Firestore's automatic single-field indexes.
export const favoriteIdFor = (clientId: string, vendorId: string) => `${clientId}_${vendorId}`;

router.get('/:id/favorites', authenticateUser, requireSelfOrAdmin('id'), async (req: Request, res: Response) => {
    try {
        const favSnap = await db.collection('favorites').where('clientId', '==', req.params.id).limit(MAX_FAVORITES).get();
        const ids = [...new Set(favSnap.docs.map(d => d.data().vendorId as string).filter(Boolean))];
        const [vendorDocs, userDocs] = await Promise.all([
            Promise.all(ids.map(id => db.collection('vendors').doc(id).get())),
            Promise.all(ids.map(id => db.collection('users').doc(id).get())),
        ]);

        const favorites = ids
            .map((id, i) => ({ id, v: vendorDocs[i].exists ? vendorDocs[i].data() : null, u: userDocs[i].exists ? userDocs[i].data() : null }))
            .filter(x => x.v && x.u && isListed(x.v) && !x.u.isSuspended)
            .map(x => toVendorResponse(x.id, x.v, x.u));

        res.status(200).json({ favorites });
    } catch (error: any) {
        console.error('Get favorites error:', error);
        res.status(500).json({ error: 'Failed to retrieve favorites' });
    }
});

router.post('/:id/favorites', authenticateUser, requireSelfOrAdmin('id'), writeLimiter, async (req: Request, res: Response) => {
    try {
        const { vendorId } = req.body;
        if (!vendorId || typeof vendorId !== 'string') {
            return res.status(400).json({ error: 'Vendor ID is required' });
        }
        const vendor = await db.collection('vendors').doc(vendorId).get();
        if (!vendor.exists || !isListed(vendor.data())) {
            return res.status(404).json({ error: 'Vendor not found' });
        }

        const ref = db.collection('favorites').doc(favoriteIdFor(req.params.id, vendorId));
        try {
            await ref.create({ clientId: req.params.id, vendorId, createdAt: new Date().toISOString() });
        } catch (e: any) {
            if (e?.code === 6) return res.status(400).json({ error: 'Vendor is already in favorites' });
            throw e;
        }
        res.status(201).json({ message: 'Vendor added to favorites' });
    } catch (error: any) {
        console.error('Add favorite error:', error);
        res.status(500).json({ error: 'Failed to add favorite' });
    }
});

router.delete('/:id/favorites/:vendorId', authenticateUser, requireSelfOrAdmin('id'), async (req: Request, res: Response) => {
    try {
        // Also matches legacy favourites stored under random ids
        const [byId, legacy] = await Promise.all([
            db.collection('favorites').doc(favoriteIdFor(req.params.id, req.params.vendorId)).get(),
            db.collection('favorites').where('clientId', '==', req.params.id).get(),
        ]);
        const refs = [byId, ...legacy.docs.filter(d => d.data().vendorId === req.params.vendorId)]
            .filter(d => d.exists).map(d => d.ref);
        if (refs.length === 0) return res.status(404).json({ error: 'Favorite not found' });
        const batch = db.batch();
        refs.forEach(r => batch.delete(r));
        await batch.commit();
        res.status(200).json({ message: 'Favorite removed' });
    } catch (error: any) {
        console.error('Remove favorite error:', error);
        res.status(500).json({ error: 'Failed to remove favorite' });
    }
});

/**
 * @route   POST /api/clients/:id/convert-to-vendor
 * @desc    Ask to upgrade a client account to a vendor account (reviewed by an admin)
 */
router.post('/:id/convert-to-vendor', authenticateUser, requireSelfOrAdmin('id'), writeLimiter, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const businessName = str(req.body.businessName, 100);
        const category = str(req.body.category, 80);
        const { documentUrl } = req.body;

        if (businessName.length < 2 || !category) {
            return res.status(400).json({ error: 'Business name and category are required' });
        }
        if (documentUrl && !isOwnPrivateRef(documentUrl, 'upgrade', id) && !isOwnPrivateRef(documentUrl, 'kyc', id)) {
            return res.status(400).json({ error: 'Please upload your business document again, then submit.' });
        }

        const userDoc = await db.collection('users').doc(id).get();
        if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
        const user = userDoc.data()!;
        if (user.role === 'vendor' || user.role === 'admin') {
            return res.status(409).json({ error: 'Your account is already a business account' });
        }
        if (user.hasPendingVendorConversion) {
            return res.status(409).json({ error: 'You already have an upgrade request under review' });
        }

        const requestData = {
            id: `conv_${Date.now()}_${id}`,
            clientId: id,
            businessName,
            category,
            description: str(req.body.description, 2000),
            phoneNumber: str(req.body.phoneNumber, 25),
            address: str(req.body.address, 300),
            documentUrl: documentUrl || '',
            documentType: str(req.body.documentType, 80) || 'Business Document',
            status: 'pending',
            createdAt: new Date().toISOString(),
        };

        const batch = db.batch();
        batch.set(db.collection('conversion_requests').doc(requestData.id), requestData);
        batch.set(db.collection('users').doc(id), { hasPendingVendorConversion: true, pendingConversionId: requestData.id }, { merge: true });
        await batch.commit();

        const { documentUrl: _private, ...publicRequest } = requestData;
        res.status(201).json({
            message: 'Vendor conversion request submitted! An administrator will review your application.',
            request: publicRequest,
        });
    } catch (error: any) {
        console.error('Convert to vendor error:', error);
        res.status(500).json({ error: 'Failed to submit conversion request' });
    }
});

export default router;
