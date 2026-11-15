import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from './api';

/**
 * Start-up profile loading that survives slow networks and server cold starts.
 *
 * - The last known profile is cached on the device, so a returning user sees the app immediately.
 * - The fresh profile is fetched with patient retries (the free server can take ~60s to wake up).
 * - Only a definite answer from the server signs someone out: "suspended" (403) or
 *   "account no longer exists" (404). Network errors never do.
 */

const CACHE_KEY = (uid: string) => `qiira.profile.${uid}`;
const RETRY_DELAYS_MS = [2000, 5000, 10000, 20000];

export type ProfileResult =
    | { status: 'ok'; user: any }
    | { status: 'suspended'; message?: string }
    | { status: 'not-found' }
    | { status: 'offline' };

export async function getCachedProfile(uid: string): Promise<any | null> {
    try {
        const raw = await AsyncStorage.getItem(CACHE_KEY(uid));
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export async function cacheProfile(uid: string, user: any): Promise<void> {
    try {
        // Only what the app needs to render before the network answers
        const { uid: id, role, fullName, profileImage, businessName, isVerified, isAdmin, email } = user || {};
        await AsyncStorage.setItem(CACHE_KEY(uid), JSON.stringify({ uid: id, role, fullName, profileImage, businessName, isVerified, isAdmin, email }));
    } catch {
        // storage full / unavailable: fine, we just won't have an instant start next time
    }
}

export async function clearCachedProfile(uid: string): Promise<void> {
    try { await AsyncStorage.removeItem(CACHE_KEY(uid)); } catch {}
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Fetch the signed-in user's profile, retrying through network errors and server wake-up. */
export async function fetchProfileWithRetry(uid: string, onRetry?: (attempt: number) => void): Promise<ProfileResult> {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
            const res = await authAPI.getUser(uid);
            const user = res.data?.user;
            if (user) {
                await cacheProfile(uid, user);
                return { status: 'ok', user };
            }
            return { status: 'not-found' };
        } catch (error: any) {
            const status = error?.response?.status;
            if (status === 403) return { status: 'suspended', message: error.response?.data?.message };
            if (status === 404) return { status: 'not-found' };
            // Network error, timeout, or a 5xx while the server wakes up: wait and try again
            if (attempt < RETRY_DELAYS_MS.length) {
                onRetry?.(attempt + 1);
                await wait(RETRY_DELAYS_MS[attempt]);
            }
        }
    }
    return { status: 'offline' };
}
