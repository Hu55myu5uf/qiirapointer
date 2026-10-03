import { Request, Response, NextFunction } from 'express';
import { auth, db } from '../config/firebase';
import supabase from '../config/supabase';

// Hardcoded primary system admin UID for emergency / root access
export const MASTER_ADMIN_UID = 'v8MwaOet0ISfZAWXIDAPAGcg1td2';

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

/**
 * Fetch authoritative user role and status from Firestore / Supabase / Firebase Auth
 */
export async function getVerifiedUser(uid: string): Promise<AuthUser | null> {
    if (!uid) return null;

    let role = 'client';
    let isVerified = false;
    let isSuspended = false;
    let email = '';

    // 1. Check Firestore
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            const data = userDoc.data()!;
            role = data.role || 'client';
            isVerified = Boolean(data.isVerified || data.is_verified);
            isSuspended = Boolean(data.isSuspended || data.is_suspended);
            email = data.email || '';
        }
    } catch (_) {}

    // 2. Check Supabase fallback
    if (!email) {
        try {
            const { data: sbUser } = await supabase
                .from('users')
                .select('*')
                .eq('uid', uid)
                .single();
            if (sbUser) {
                role = sbUser.role || role;
                isVerified = isVerified || Boolean(sbUser.is_verified);
                isSuspended = isSuspended || Boolean(sbUser.is_suspended);
                email = sbUser.email || '';
            }
        } catch (_) {}
    }

    // 3. Fallback to Firebase Auth user record
    if (!email) {
        try {
            const fbUser = await auth.getUser(uid);
            if (fbUser) {
                email = fbUser.email || '';
            }
        } catch (_) {}
    }

    // STRICT Admin check: Only DB role === 'admin' OR the master admin UID
    const isAdmin = Boolean(role === 'admin' || uid === MASTER_ADMIN_UID);
    if (isAdmin) {
        role = 'admin';
        isVerified = true;
    }

    return {
        uid,
        email,
        role,
        isAdmin,
        isVerified,
        isSuspended,
    };
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

        const user = await getVerifiedUser(decodedToken.uid);
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
                    const user = await getVerifiedUser(decodedToken.uid);
                    if (user && !user.isSuspended) {
                        req.user = user;
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

        const targetId = req.params[paramKey] || req.body[paramKey];

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
