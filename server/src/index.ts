import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth.routes';
import vendorRoutes from './routes/vendor.routes';
import clientRoutes from './routes/client.routes';
import adminRoutes from './routes/admin.routes';
import chatRoutes from './routes/chat.routes';
import postRoutes from './routes/post.routes';
import cartRoutes from './routes/cart.routes';
import callRoutes from './routes/call.routes';
import { ensureSupportAccount } from './scripts/seedSupport';

// Initialize Express app
const app: Application = express();
const PORT = Number(process.env.PORT) || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
        status: 'healthy',
        message: 'QIIRAPOINTER API is running',
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

// Serve uploaded images statically (for testing without Firebase Storage)
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Error:', err.stack);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server - Listen on all network interfaces (0.0.0.0) to allow connections from Expo Go
app.listen(PORT as number, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);

    // Get local IP address
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    let localIP = 'localhost';

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                localIP = net.address;
                break;
            }
        }
    }

    console.log(`🌐 Access from network: http://${localIP}:${PORT}`);
    ensureSupportAccount().catch(e => console.warn('Support seed note:', e.message));
});

export default app;
