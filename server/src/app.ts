import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

import authRoutes from './routes/auth.routes';
import vendorRoutes from './routes/vendor.routes';
import clientRoutes from './routes/client.routes';
import adminRoutes from './routes/admin.routes';
import chatRoutes from './routes/chat.routes';
import postRoutes from './routes/post.routes';
import cartRoutes from './routes/cart.routes';
import callRoutes from './routes/call.routes';
import moderationRoutes from './routes/moderation.routes';
import notificationRoutes from './routes/notification.routes';
import usersRoutes from './routes/users.routes';
import communityRoutes from './routes/community.routes';
import listingRoutes from './routes/listing.routes';

// Express application (no network listener here — see index.ts). Importable by tests.
const app: Application = express();

// Security hardening: hide server framework
app.disable('x-powered-by');

// Security Headers Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// Behind Render's load balancer: trust exactly one proxy hop so req.ip is the real client IP
// (and a client-supplied X-Forwarded-For cannot spoof it). Override with TRUST_PROXY if hosting changes.
app.set('trust proxy', process.env.TRUST_PROXY !== undefined ? Number(process.env.TRUST_PROXY) : 1);

// CORS: native mobile apps send no Origin header and are unaffected. Browsers are limited to
// ALLOWED_ORIGINS (comma-separated) in production; development allows any origin for Expo web.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (process.env.NODE_ENV !== 'production') return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
    },
}));

// Body size limits: large bodies only where base64 media is uploaded, small everywhere else
const UPLOAD_PATHS = ['/api/chats/upload-attachment', '/api/vendors/upload-image', '/api/vendors/upload-document', '/api/posts'];
app.use(UPLOAD_PATHS, express.json({ limit: '30mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// In production, never send internal error details (stack messages, DB errors) to clients
if (process.env.NODE_ENV === 'production') {
    app.use((req: Request, res: Response, next: NextFunction) => {
        const originalJson = res.json.bind(res);
        res.json = (body: any) => {
            if (res.statusCode >= 500 && body && typeof body === 'object') {
                const { message: _hidden, ...rest } = body;
                return originalJson({ ...rest, message: 'An unexpected error occurred. Please try again.' });
            }
            return originalJson(body);
        };
        next();
    });
}

// Request logging middleware
if (process.env.NODE_ENV !== 'test') {
    app.use((req: Request, res: Response, next: NextFunction) => {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
        next();
    });
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
        status: 'healthy',
        message: 'Pointer API is running',
        timestamp: new Date().toISOString()
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/listings', listingRoutes);

// Serve uploaded images statically with security flags
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
    dotfiles: 'ignore',
    index: false,
    setHeaders: (res: any) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'");
    }
}));

// Error handling middleware (without leaking internal stack traces)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    // Body-parser errors: oversized or malformed JSON are client errors, not server faults
    if (err?.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Payload Too Large', message: 'The uploaded content is too large.' });
    }
    if (err?.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Bad Request', message: 'Malformed JSON body.' });
    }
    console.error('Unhandled Application Error:', err?.message);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred. Please try again.'
    });
});

// 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found' });
});

export default app;
