import { Request, Response, NextFunction } from 'express';

interface Bucket {
    count: number;
    resetTime: number;
}

interface RateLimitOptions {
    /** Key requests by the authenticated user (falls back to IP when not logged in). Default: IP only. */
    perUser?: boolean;
}

/**
 * In-memory fixed-window rate limiter.
 *
 * The client IP comes from `req.ip`, which Express derives from X-Forwarded-For ONLY for the
 * proxies we trust (`app.set('trust proxy', ...)` in app.ts). Reading the header directly would let
 * anyone bypass the limit by sending a fake X-Forwarded-For.
 */
export function rateLimiter(windowMs: number = 15 * 60 * 1000, max: number = 100, message?: string, options: RateLimitOptions = {}) {
    const hits = new Map<string, Bucket>();

    const cleanup = setInterval(() => {
        const now = Date.now();
        for (const [key, bucket] of hits) {
            if (bucket.resetTime <= now) hits.delete(key);
        }
    }, 5 * 60 * 1000);
    cleanup.unref(); // never keep the process alive just for cleanup

    return (req: Request, res: Response, next: NextFunction): void => {
        if (process.env.NODE_ENV === 'test' && !process.env.RATE_LIMIT_IN_TESTS) return next();

        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const key = options.perUser && req.user?.uid ? `u:${req.user.uid}` : `ip:${ip}`;
        const now = Date.now();

        let bucket = hits.get(key);
        if (!bucket || bucket.resetTime <= now) {
            bucket = { count: 0, resetTime: now + windowMs };
            hits.set(key, bucket);
        }
        bucket.count++;

        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, max - bucket.count));
        res.setHeader('X-RateLimit-Reset', Math.ceil(bucket.resetTime / 1000));

        if (bucket.count > max) {
            const retryAfter = Math.ceil((bucket.resetTime - now) / 1000);
            res.setHeader('Retry-After', retryAfter);
            res.status(429).json({
                error: 'Too Many Requests',
                message: message || 'You have exceeded the rate limit. Please wait and try again later.',
                retryAfterSeconds: retryAfter,
            });
            return;
        }

        next();
    };
}

// Shared limiters (one instance each so the counts are shared across routes)
export const authLimiter = rateLimiter(15 * 60 * 1000, 40, 'Too many authentication attempts. Please try again later.');
export const writeLimiter = rateLimiter(60 * 1000, 60, 'You are doing that too often. Please slow down.', { perUser: true });
export const messageLimiter = rateLimiter(60 * 1000, 40, 'You are sending messages too quickly. Please slow down.', { perUser: true });
export const uploadLimiter = rateLimiter(60 * 60 * 1000, 60, 'Upload limit reached. Please try again later.', { perUser: true });
export const reportLimiter = rateLimiter(60 * 60 * 1000, 20, 'Too many reports submitted. Please try again later.', { perUser: true });
export const searchLimiter = rateLimiter(60 * 1000, 120, 'Too many searches. Please slow down.', { perUser: true });
