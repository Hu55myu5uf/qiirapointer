/**
 * One place that turns Firestore vendor + user documents into the vendor shape the app uses.
 * No invented data: no default ratings, no made-up locations, no "approved" unless an admin approved.
 */
import { db } from '../config/firebase';
import { MASTER_ADMIN_UID } from './authMiddleware';
import { usableImage } from './profiles';

export type LatLng = { latitude: number; longitude: number };

export function validLatLng(v: any): LatLng | null {
    if (!v || typeof v !== 'object') return null;
    const latitude = Number(v.latitude ?? v._latitude);
    const longitude = Number(v.longitude ?? v._longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    if (latitude === 0 && longitude === 0) return null;
    return { latitude, longitude };
}

/** Where to show the vendor: live GPS when they chose it, otherwise their business address pin. */
export function effectiveLocation(v: any): LatLng | null {
    if (v?.useLiveLocation) {
        const live = validLatLng(v.liveLocation);
        if (live) return live;
    }
    return validLatLng(v?.location);
}

export function distanceMeters(a: LatLng, b: LatLng): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * Two separate things that used to share one field:
 * - listingStatus: has the business been approved to appear in listings (vendors only)
 * - badgeStatus:   the free identity check behind the gold verified badge (vendors and clients)
 * The badge lives on the vendor document for vendors and on the user document for clients.
 */
export type ListingStatus = 'approved' | 'pending' | 'rejected';
export type BadgeStatus = 'verified' | 'pending' | 'rejected' | 'none';

export function verificationState(vendorDoc: any | null, userDoc: any | null, isAdmin = false) {
    const src = vendorDoc || userDoc || {};
    const isVerified = Boolean(isAdmin || src.isVerified === true);
    const request = src.verificationRequest || null;
    const badgeStatus: BadgeStatus = isVerified ? 'verified'
        : request === 'pending' ? 'pending'
        : request === 'rejected' ? 'rejected'
        : 'none';
    const listingStatus: ListingStatus | null = vendorDoc
        ? (vendorDoc.verificationStatus === 'rejected' ? 'rejected' : 'approved')
        : null;
    return {
        isVerified,
        badgeStatus,
        listingStatus,
        // Only meaningful to the account owner; never put this in public responses
        badgeRejectionReason: badgeStatus === 'rejected' ? (src.rejectionReason || null) : null,
    };
}

/** Public vendor shape. `user` is the matching users/{uid} document data (may be empty). */
export function toVendorResponse(uid: string, v: any, user: any = {}) {
    const isAdmin = user.role === 'admin' || uid === MASTER_ADMIN_UID;
    const { isVerified, badgeStatus, listingStatus } = verificationState(v, user, isAdmin);
    const totalReviews = Number(v.totalReviews) || 0;
    const averageRating = totalReviews > 0 ? Math.round((Number(v.averageRating) || 0) * 10) / 10 : 0;
    const businessImage = usableImage(v.businessImage) || usableImage(user.profileImage);
    const phone = v.phoneNumber || user.phoneNumber || null; // vendor phone numbers are public by design

    return {
        id: uid,
        uid,
        businessName: v.businessName || user.fullName || 'Vendor',
        category: v.category || '',
        description: v.description || '',
        address: v.address || '',
        services: Array.isArray(v.services) ? v.services : (v.services ? [String(v.services)] : []),
        location: effectiveLocation(v),
        useLiveLocation: Boolean(v.useLiveLocation),
        businessImage,
        bannerImage: usableImage(v.bannerImage),
        businessHours: v.businessHours || null,
        // Old field names kept for app versions already installed
        verificationStatus: isListed(v) ? 'approved' : 'rejected',
        verificationRequest: v.verificationRequest || null,
        listingStatus,
        badgeStatus,
        isVerified,
        is_verified: isVerified,
        isAdmin,
        role: isAdmin ? 'admin' : 'vendor',
        isActive: isListed(v),
        averageRating,
        totalReviews,
        createdAt: v.createdAt || null,
        updatedAt: v.updatedAt || null,
        userInfo: {
            uid,
            fullName: user.fullName || v.businessName || 'Vendor',
            phoneNumber: phone,
            role: isAdmin ? 'admin' : 'vendor',
            isAdmin,
            isVerified,
            profileImage: usableImage(user.profileImage) || businessImage,
        },
    };
}

// ─── Approved vendor list cache ─────────────────────────────────────────────
// Browsing loads the approved-vendor list constantly but it changes rarely, so it is cached
// briefly (and invalidated on every vendor write in this process) to keep Firestore reads low.
const LIST_TTL_MS = 30_000;
let listCache: { at: number; vendors: ReturnType<typeof toVendorResponse>[] } | null = null;

export function invalidateVendorList() { listCache = null; }

/**
 * Whether a store is listed. Since Stage 0 stores are listed straight away; only an admin's
 * "reject listing" takes one down. Stores from before that ("pending" or no status) count as
 * listed. Suspension (on the user) is checked separately.
 */
export function isListed(vendorDoc: any): boolean {
    return Boolean(vendorDoc) && vendorDoc.verificationStatus !== 'rejected';
}

/** Discover only shows stores that have chosen a business category. */
export function hasCategory(vendorDoc: any): boolean {
    return Boolean(String(vendorDoc?.category || '').split(' - ')[0].trim());
}

export async function getApprovedVendors(): Promise<ReturnType<typeof toVendorResponse>[]> {
    if (listCache && Date.now() - listCache.at < LIST_TTL_MS) return listCache.vendors;

    const all = await db.collection('vendors').limit(1000).get();
    const snap = { docs: all.docs.filter(d => isListed(d.data())) };
    const userRefs = snap.docs.map(d => db.collection('users').doc(d.id));
    const userDocs = await Promise.all(userRefs.map(r => r.get()));
    const users = new Map(userDocs.map(d => [d.id, d.exists ? d.data() : null]));

    const vendors = snap.docs
        .filter(d => {
            const u: any = users.get(d.id);
            // Only real, active vendor (or admin) accounts — not suspended, not deleted
            return u && !u.isSuspended && (u.role === 'vendor' || u.role === 'admin');
        })
        .map(d => toVendorResponse(d.id, d.data(), users.get(d.id)));

    listCache = { at: Date.now(), vendors };
    return vendors;
}
