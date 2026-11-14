import { networkInterfaces } from 'os';
import app from './app';
import { ensureSupportAccount } from './scripts/seedSupport';

const PORT = Number(process.env.PORT) || 5000;

// Listen on all network interfaces (0.0.0.0) to allow connections from Expo Go during development
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);

    let localIP = 'localhost';
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
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
