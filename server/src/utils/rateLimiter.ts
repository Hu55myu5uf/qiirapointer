import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
    [key: string]: {
        count: number;
        resetTime: number;
    };
}

/**
 * Creates an in-memory sliding window rate limiter
 * @param windowMs Time window in milliseconds
 * @param max Max allowed requests per window
 * @param message Custom error message
 */
export function rateLimiter(windowMs: number = 15 * 60 * 1000, max: number = 100, message?: string) {
    const hits: RateLimitStore = {};

    // Periodically clean up expired entries every 5 minutes
    setInterval(() => {
        const now = Date.now();
        for (const ip in hits) {
            if (hits[ip].resetTime <= now) {
                delete hits[ip];
            }
        }
    }, 5 * 60 * 1000);

    return (req: Request, res: Response, next: NextFunction): void => {
        // Prefer x-forwarded-for header, fallback to remoteAddress
        const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
            req.socket.remoteAddress ||
            'unknown';

        const now = Date.now();
        const record = hits[clientIp];

        if (!record || record.resetTime <= now) {
            hits[clientIp] = {
                count: 1,
                resetTime: now + windowMs,
            };
            res.setHeader('X-RateLimit-Limit', max);
            res.setHeader('X-RateLimit-Remaining', max - 1);
            return next();
        }

        record.count++;
        const remaining = Math.max(0, max - record.count);
        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

        if (record.count > max) {
            res.status(429).json({
                error: 'Too Many Requests',
                message: message || 'You have exceeded the rate limit. Please wait and try again later.',
                retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000),
            });
            return;
        }

        next();
    };
}
