import { Request, Response, NextFunction } from 'express';
import { auth, db } from '../config/firebase';

// Root admin UID for emergency access. Configure MASTER_ADMIN_UID in the environment;
// the fallback keeps existing deployments working until it is set.
export const MASTER_ADMIN_UID = process.env.MASTER_ADMIN_UID || 'v8MwaOet0ISfZAWXIDAPAGcg1td2';

// Shared "QIIRA Customer Support" identity. It has no password and cannot log in;
// administrators read and reply to its conversations from the admin dashboard.
export const SUPPORT_UID = 'qiira_official_support';

export interface AuthUser {
    uid: string;
    email?: string;
    role: string;
    isAdmin: boolean;
    isVerified: boolean;
    isSuspended: boolean;
}

// Extend Express Request
declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}

// Short cache of role/suspension per user: every authenticated request needs it, and it rarely
// changes. Suspensions and role changes made through this server clear the entry immediately.
const USER_CACHE_TTL_MS = 10_000;
const userCache = new Map<string, { at: number; value: AuthUser }>();

export function invalidateAuthUser(uid?: string) {
    if (uid) userCache.delete(uid); else userCache.clear();
}

/**
 * Authoritative role and status for a uid, from the Firestore `users` profile.
 * Accounts without a profile are plain clients (roles are never inferred from anything else).
 */
export async function getVerifiedUser(uid: string, tokenEmail?: string): Promise<AuthUser | null> {
    if (!uid) return null;
    const hit = userCache.get(uid);
    if (hit && Date.now() - hit.at < USER_CACHE_TTL_MS) return hit.value;

    const doc = await db.collection('users').doc(uid).get();
    const data: any = doc.exists ? doc.data() : {};
    const isAdmin = data.role === 'admin' || uid === MASTER_ADMIN_UID;
    const role = isAdmin ? 'admin' : (data.role === 'vendor' ? 'vendor' : 'client');

    const value: AuthUser = {
        uid,
        email: data.email || tokenEmail || '',
        role,
        isAdmin,
        isVerified: Boolean(isAdmin || data.isVerified),
        isSuspended: Boolean(data.isSuspended),
    };
    userCache.set(uid, { at: Date.now(), value });
    return value;
}

/**
 * Middleware: Verify Firebase Bearer token and attach authenticated user to req.user.
 * Fails with 401 if missing or invalid, or 403 if suspended.
 */
export async function authenticateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication token is required to access this resource.'
            });
            return;
        }

        const idToken = authHeader.split('Bearer ')[1].trim();
        if (!idToken) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Malformed authorization header.'
            });
            return;
        }

        let decodedToken;
        try {
            decodedToken = await auth.verifyIdToken(idToken);
        } catch (tokenErr: any) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid, expired, or revoked authentication token.'
            });
            return;
        }

        const user = await getVerifiedUser(decodedToken.uid, decodedToken.email);
        if (!user) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Authenticated user profile not found.'
            });
            return;
        }

        if (user.isSuspended) {
            res.status(403).json({
                error: 'Account Suspended',
                message: 'Your account has been suspended by an administrator. Please contact support.'
            });
            return;
        }

        req.user = user;
        next();
    } catch (err: any) {
        console.error('Authentication middleware error:', err);
        res.status(500).json({ error: 'Internal authentication error' });
    }
}

/**
 * Middleware: Soft authentication. Populates req.user if token is valid, continues if not.
 */
export async function optionalAuthenticateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const idToken = authHeader.split('Bearer ')[1].trim();
            if (idToken) {
                try {
                    const decodedToken = await auth.verifyIdToken(idToken);
                    const user = await getVerifiedUser(decodedToken.uid, decodedToken.email);
                    if (user && !user.isSuspended) {
                        req.user = user;
                    } else if (user?.isSuspended) {
                        // Treated as anonymous, but routes can still tell the user they're suspended
                        (req as any).suspendedUid = user.uid;
                    }
                } catch (_) {
                    // Ignore invalid token for optional auth
                }
            }
        }
        next();
    } catch (_) {
        next();
    }
}

/**
 * Middleware: Requires the authenticated user to be a verified Administrator.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required.'
        });
        return;
    }

    if (!req.user.isAdmin && req.user.role !== 'admin' && req.user.uid !== MASTER_ADMIN_UID) {
        res.status(403).json({
            error: 'Forbidden',
            message: 'Administrator privileges are required to perform this action.'
        });
        return;
    }

    next();
}

/**
 * Middleware factory: Ensures the authenticated user matches the specified URL param (e.g. :id or :userId)
 * OR is an Administrator. Prevents IDOR (Insecure Direct Object References).
 */
export function requireSelfOrAdmin(paramKey: string = 'id') {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required.'
            });
            return;
        }

        // Only the URL param identifies the target. (Express 5 leaves req.body undefined on
        // body-less requests, and a body value must never widen access anyway.)
        const targetId = req.params?.[paramKey];
        if (!targetId) {
            res.status(400).json({ error: 'Bad Request', message: `Missing ${paramKey} in URL.` });
            return;
        }

        if (req.user.isAdmin || req.user.uid === MASTER_ADMIN_UID) {
            return next();
        }

        if (req.user.uid !== targetId) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have permission to access or modify this resource.'
            });
            return;
        }

        next();
    };
}
