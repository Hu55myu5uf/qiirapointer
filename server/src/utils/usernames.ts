import crypto from 'crypto';
import { db } from '../config/firebase';
import { clearProfileCache } from './profiles';

/**
 * Unique @usernames.
 *
 * usernames/{name} = { uid, u: name, createdAt } is the uniqueness index (one document per
 * name, created in a transaction), users/{uid}.username is the user's current name. Names are
 * stored lowercase: 3–30 characters, letters, numbers, "." and "_", not starting or ending
 * with ".", no "..". A few names are reserved so nobody can pose as the platform.
 * Everyone gets one automatically; changing it is allowed once every 30 days.
 */
export const USERNAME_CHANGE_DAYS = 30;
const DAY_MS = 86_400_000;

const RESERVED = new Set([
    'admin', 'administrator', 'support', 'help', 'helpdesk', 'pointer', 'pointerapp', 'pointer_app',
    'pointerofficial', 'pointer_official', 'qiira', 'qiirapointer', 'official', 'moderator', 'mod',
    'staff', 'team', 'security', 'system', 'root', 'api', 'www', 'mail', 'info', 'contact',
    'billing', 'payments', 'verify', 'verified', 'verification', 'customer_support', 'customercare',
    'everyone', 'here', 'null', 'undefined', 'anonymous', 'deleted', 'user',
]);

export function normalizeUsername(raw: unknown): string {
    return String(raw ?? '').trim().replace(/^@+/, '').toLowerCase();
}

/** null when valid, otherwise the reason to show the user */
export function usernameProblem(name: string): string | null {
    if (name.length < 3) return 'Usernames need at least 3 characters.';
    if (name.length > 30) return 'Usernames can be at most 30 characters.';
    if (!/^[a-z0-9._]+$/.test(name)) return 'Use only letters, numbers, "." and "_".';
    if (name.startsWith('.') || name.endsWith('.')) return 'A username can\'t start or end with ".".';
    if (name.includes('..')) return 'A username can\'t contain "..".';
    if (!/[a-z]/.test(name)) return 'Include at least one letter.';
    // "admin", "a.d.m.i.n", "pointer_support", "qiiraofficial"... are not available
    const squashed = name.replace(/[._]/g, '');
    if (RESERVED.has(name) || RESERVED.has(squashed)) return 'That username is reserved.';
    if (/(pointer|qiira)/.test(squashed) && /(official|support|admin|team|help|staff|care)/.test(squashed)) {
        return 'That username is reserved.';
    }
    return null;
}

export const usernameRef = (name: string) => db.collection('usernames').doc(name);

export class UsernameError extends Error {
    constructor(public status: number, message: string, public nextAllowedAt?: string) {
        super(message);
    }
}

/**
 * Give `uid` the username `desired`. Throws UsernameError (taken, invalid, too soon).
 * `force` (admins, first automatic name) skips the 30-day limit; `initial` doesn't start it.
 */
export async function claimUsername(uid: string, desired: string, opts: { force?: boolean; initial?: boolean } = {}): Promise<string> {
    const name = normalizeUsername(desired);
    const problem = usernameProblem(name);
    if (problem) throw new UsernameError(400, problem);

    const now = new Date();
    await db.runTransaction(async tx => {
        const userRef = db.collection('users').doc(uid);
        const [userSnap, nameSnap] = await Promise.all([tx.get(userRef), tx.get(usernameRef(name))]);
        if (!userSnap.exists) throw new UsernameError(404, 'User not found');
        const user = userSnap.data() || {};
        const current: string | undefined = user.username;
        if (current === name) return;
        if (nameSnap.exists && nameSnap.data()?.uid !== uid) throw new UsernameError(409, 'That username is taken.');

        if (current && !opts.force && user.usernameChangedAt) {
            const next = new Date(new Date(user.usernameChangedAt).getTime() + USERNAME_CHANGE_DAYS * DAY_MS);
            if (next > now) throw new UsernameError(429, `You can change your username again on ${next.toDateString()}.`, next.toISOString());
        }

        tx.set(usernameRef(name), { uid, u: name, createdAt: now.toISOString() });
        if (current) tx.delete(usernameRef(current));
        tx.set(userRef, {
            username: name,
            // The automatic first name doesn't use up the monthly change
            usernameChangedAt: opts.initial ? (user.usernameChangedAt || null) : now.toISOString(),
            updatedAt: now.toISOString(),
        }, { merge: true });
        if (user.role === 'vendor') {
            tx.set(db.collection('vendors').doc(uid), { username: name }, { merge: true });
        }
    });
    clearProfileCache(uid);
    return name;
}

/** Turn a display name into a username base: "Ada's Kitchen & Bar" -> "adaskitchenbar" */
function baseFrom(text: string): string {
    const ascii = String(text || '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
    let base = ascii.slice(0, 20);
    if (!/[a-z]/.test(base)) base = `user${base}`.slice(0, 20);
    if (base.length < 3) base = (base + 'user').slice(0, 20);
    return base;
}

/**
 * Make sure `uid` has a username, creating one from their (business) name if needed.
 * Returns the username, or null if one couldn't be created right now.
 */
export async function ensureUsername(uid: string, displayName: string): Promise<string | null> {
    try {
        const snap = await db.collection('users').doc(uid).get();
        if (!snap.exists) return null;
        const existing = snap.data()?.username;
        if (existing) return existing;
        const base = baseFrom(displayName);
        const candidates = [base, ...Array.from({ length: 6 }, (_, i) => `${base.slice(0, 20)}${crypto.randomInt(10 ** (2 + Math.min(i, 3)), 10 ** (3 + Math.min(i, 3)))}`)];
        for (const c of candidates) {
            if (usernameProblem(c)) continue;
            try {
                return await claimUsername(uid, c, { force: true, initial: true });
            } catch (e) {
                if (e instanceof UsernameError && e.status === 409) continue;
                throw e;
            }
        }
    } catch (e: any) {
        console.warn('Username not created:', e?.message);
    }
    return null;
}

/** uid for a username (or null) */
export async function uidForUsername(raw: string): Promise<string | null> {
    const name = normalizeUsername(raw);
    if (!name || name.length > 30) return null;
    const snap = await usernameRef(name).get();
    return snap.exists ? (snap.data()?.uid || null) : null;
}

/** Usernames starting with `prefix` (for @mention suggestions) */
export async function searchUsernames(prefix: string, limit = 8): Promise<{ uid: string; username: string }[]> {
    const p = normalizeUsername(prefix).replace(/[^a-z0-9._]/g, '');
    if (!p) return [];
    const snap = await db.collection('usernames').where('u', '>=', p).where('u', '<', p + '').limit(limit).get();
    return snap.docs.map(d => ({ uid: d.data().uid, username: d.data().u }));
}
