import { Router, Request, Response } from 'express';
import supabase from '../config/supabase';
import { db } from '../config/firebase';
import { notifyNewReview } from '../utils/pushNotifications';

const router = Router();

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

    if (!location) {
        const hash = (v.uid || v.id || v.business_name || 'vendor')
            .split('')
            .reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
        const latOffset = ((hash % 100) - 50) * 0.002;
        const lngOffset = (((hash * 7) % 100) - 50) * 0.002;
        location = {
            latitude: 6.5244 + latOffset,
            longitude: 3.3792 + lngOffset
        };
    }

    const isVerified = Boolean(v.is_verified === true || v.isVerified === true || v.users?.is_verified === true || v.users?.isVerified === true || v.users?.role === 'admin' || v.role === 'admin');

    return {
        id: v.uid,
        uid: v.uid,
        businessName: v.business_name || v.businessName || 'Vendor',
        category: v.category || 'Retail',
        description: v.description || '',
        address: v.address || '',
        services: v.services || [],
        location,
        businessImage: v.business_image || v.businessImage,
        bannerImage: v.banner_image || v.bannerImage,
        businessHours: v.business_hours || v.businessHours,
        verificationStatus: v.verification_status || v.verificationStatus || 'approved',
        isVerified,
        is_verified: isVerified,
        isActive: v.is_active ?? true,
        documents: v.documents || [],
        paymentStatus: v.payment_status,
        paymentReference: v.payment_reference,
        paymentAmount: v.payment_amount,
        paidAt: v.paid_at,
        averageRating: Number(v.average_rating || v.averageRating || 0),
        totalReviews: Number(v.total_reviews || v.totalReviews || 0),
        rejectionReason: v.rejection_reason,
        verifiedAt: v.verified_at,
        createdAt: v.created_at || v.createdAt,
        updatedAt: v.updated_at || v.updatedAt
    };
}

/**
 * @route   POST /api/clients/:id/reviews
 * @desc    Submit a review for a vendor
 * @access  Private (Client only)
 */
router.post('/:id/reviews', async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // Client ID
        const { vendorId, rating, comment } = req.body;

        if (!vendorId || !rating) {
            return res.status(400).json({ error: 'Vendor ID and rating are required' });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Rating must be between 1 and 5' });
        }

        // Create review in Supabase
        const { data: newReview, error: reviewError } = await supabase
            .from('reviews')
            .insert({
                client_id: id,
                vendor_id: vendorId,
                rating,
                comment: comment || '',
            })
            .select()
            .single();

        if (reviewError) throw reviewError;

        // Fetch all reviews for vendor to calculate average rating
        const { data: reviews, error: reviewsError } = await supabase
            .from('reviews')
            .select('rating')
            .eq('vendor_id', vendorId);

        if (reviewsError) throw reviewsError;

        const totalReviews = reviews.length;
        const avgRating = totalReviews > 0
            ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
            : 0;

        // Update vendor's average rating and total reviews
        const { error: vendorUpdateError } = await supabase
            .from('vendors')
            .update({
                average_rating: avgRating,
                total_reviews: totalReviews,
            })
            .eq('uid', vendorId);

        if (vendorUpdateError) throw vendorUpdateError;

        // Send push notification to vendor
        try {
            // Get vendor user, vendor details, and reviewer profile
            const { data: vendorUser } = await supabase.from('users').select('*').eq('uid', vendorId).single();
            const { data: vendorDoc } = await supabase.from('vendors').select('*').eq('uid', vendorId).single();
            const { data: reviewerDoc } = await supabase.from('users').select('*').eq('uid', id).single();

            const pushToken = vendorUser?.push_token;
            const businessName = vendorDoc?.business_name || 'Your business';
            const reviewerName = reviewerDoc?.full_name || 'A customer';

            if (pushToken) {
                await notifyNewReview(pushToken, reviewerName, rating, businessName);
                console.log('Review notification sent to vendor:', vendorId);
            }
        } catch (notifError) {
            console.error('Error sending review notification (non-blocking):', notifError);
        }

        res.status(201).json({
            message: 'Review submitted successfully',
            reviewId: newReview.id
        });
    } catch (error: any) {
        console.error('Submit review error:', error);
        res.status(500).json({ error: 'Failed to submit review', message: error.message });
    }
});

/**
 * @route   GET /api/clients/:id/favorites
 * @desc    Get client's favorite vendors
 * @access  Private (Client only)
 */
router.get('/:id/favorites', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Fetch favorites
        const { data: favorites, error } = await supabase
            .from('favorites')
            .select('vendor_id')
            .eq('client_id', id);

        if (error) throw error;

        const vendorIds = (favorites || []).map(f => f.vendor_id);
        if (vendorIds.length === 0) {
            return res.status(200).json({ favorites: [] });
        }

        const { data: vendorList, error: vendorError } = await supabase
            .from('vendors')
            .select('*')
            .in('uid', vendorIds);

        if (vendorError) throw vendorError;

        const mappedVendors = (vendorList || []).map(mapVendor);
        res.status(200).json({ favorites: mappedVendors });
    } catch (error: any) {
        console.error('Get favorites error:', error);
        res.status(500).json({ error: 'Failed to retrieve favorites', message: error.message });
    }
});

/**
 * @route   POST /api/clients/:id/favorites
 * @desc    Add vendor to favorites
 * @access  Private (Client only)
 */
router.post('/:id/favorites', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { vendorId } = req.body;

        if (!vendorId) {
            return res.status(400).json({ error: 'Vendor ID is required' });
        }

        const { error } = await supabase
            .from('favorites')
            .insert({
                client_id: id,
                vendor_id: vendorId,
            });

        if (error) {
            // If duplicate favorite, PostgreSQL throws unique violation (23505)
            if (error.code === '23505') {
                return res.status(400).json({ error: 'Vendor is already in favorites' });
            }
            throw error;
        }

        res.status(201).json({ message: 'Vendor added to favorites' });
    } catch (error: any) {
        console.error('Add favorite error:', error);
        res.status(500).json({ error: 'Failed to add favorite', message: error.message });
    }
});

/**
 * @route   DELETE /api/clients/:id/favorites/:vendorId
 * @desc    Remove vendor from favorites
 * @access  Private (Client only)
 */
router.delete('/:id/favorites/:vendorId', async (req: Request, res: Response) => {
    try {
        const { id, vendorId } = req.params;
        console.log(`Comparing Remove Fav: Client ${id}, Vendor ${vendorId}`);

        const { error, count } = await supabase
            .from('favorites')
            .delete({ count: 'exact' })
            .eq('client_id', id)
            .eq('vendor_id', vendorId);

        if (error) throw error;

        if (count === 0) {
            console.log('Favorite not found during remove');
            return res.status(404).json({ error: 'Favorite not found' });
        }

        console.log('Favorite removed successfully');
        res.status(200).json({ message: 'Favorite removed' });
    } catch (error: any) {
        console.error('Remove favorite error:', error);
        res.status(500).json({ error: 'Failed to remove favorite', message: error.message });
    }
});

export default router;
