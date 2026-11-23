/**
 * Shared, Firestore-only lookups for how a user is DISPLAYED to others
 * (name, avatar, role, verified badge). Cached briefly because chat lists, feeds and comments
 * look up the same people repeatedly.
 */
import { db } from '../config/firebase';
import { MASTER_ADMIN_UID, SUPPORT_UID, invalidateAuthUser } from './authMiddleware';

export interface DisplayProfile {
    uid: string;
    name: string;
    username: string | null;
    avatar: string;          // '' when the user has no photo (the app shows its own placeholder)
    role: 'client' | 'vendor' | 'admin' | 'support';
    isVerified: boolean;
    isAdmin: boolean;
    exists: boolean;
    blockedUserIds: string[];
}

const SUPPORT_PROFILE: DisplayProfile = {
    uid: SUPPORT_UID,
    name: 'Pointer Customer Support',
    username: null,
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500',
    role: 'support',
    isVerified: true,
    isAdmin: false,
    exists: true,
    blockedUserIds: [],
};

const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { at: number; value: DisplayProfile }>();

/** Forget cached display AND permission data for a user (call after any change to them). */
export function clearProfileCache(uid?: string) {
    if (uid) cache.delete(uid); else cache.clear();
    invalidateAuthUser(uid);
}

/** Is a stored image value usable? (Old data contains dead server-disk links and raw base64.) */
export function usableImage(v: unknown): string {
    if (typeof v !== 'string' || !v) return '';
    if (!/^https:\/\//i.test(v)) return '';                 // http://, data:, local IPs
    if (/\/uploads\//.test(v) && /onrender\.com|192\.168\./.test(v)) return ''; // wiped server disk
    return v;
}

export async function getDisplayProfile(uid: string): Promise<DisplayProfile> {
    if (uid === SUPPORT_UID) return SUPPORT_PROFILE;
    const hit = cache.get(uid);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

    const [uDoc, vDoc] = await Promise.all([
        db.collection('users').doc(uid).get(),
        db.collection('vendors').doc(uid).get(),
    ]);
    const u: any = uDoc.exists ? uDoc.data() : {};
    const v: any = vDoc.exists ? vDoc.data() : {};

    const storedRole = u.role || (vDoc.exists ? 'vendor' : 'client');
    const isAdmin = storedRole === 'admin' || uid === MASTER_ADMIN_UID;
    const role = isAdmin ? 'admin' : storedRole;
    const isVendor = role === 'vendor';

    const value: DisplayProfile = {
        uid,
        name: (isVendor && (v.businessName || v.business_name)) || u.fullName || u.full_name || u.displayName || 'User',
        username: u.username || null,
        avatar: usableImage(isVendor ? (v.businessImage || v.business_image || u.profileImage) : (u.profileImage || u.profile_image || u.photoURL)),
        role,
        isVerified: Boolean(isAdmin || (isVendor ? v.isVerified : u.isVerified)),
        isAdmin,
        exists: uDoc.exists,
        blockedUserIds: Array.isArray(u.blockedUserIds) ? u.blockedUserIds : [],
    };
    cache.set(uid, { at: Date.now(), value });
    return value;
}

export async function getDisplayProfiles(uids: string[]): Promise<Map<string, DisplayProfile>> {
    const unique = [...new Set(uids.filter(Boolean))];
    const list = await Promise.all(unique.map(getDisplayProfile));
    return new Map(list.map(p => [p.uid, p]));
}
