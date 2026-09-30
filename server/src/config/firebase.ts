import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

let app;

try {
    // Option 1: Try to use service account file (recommended for development)
    const serviceAccountPath = path.join(__dirname, '../../firebase-service-account.json');

    if (fs.existsSync(serviceAccountPath)) {
        console.log('✅ Using firebase-service-account.json');
        const serviceAccount = require(serviceAccountPath);
        app = initializeApp({
            credential: cert(serviceAccount),
            storageBucket: `${serviceAccount.project_id}.appspot.com`
        });
    }
    // Option 2: Use environment variables (for production)
    else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        console.log('✅ Using Firebase credentials from environment variables');
        const serviceAccount: ServiceAccount = {
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        };

        app = initializeApp({
            credential: cert(serviceAccount),
            storageBucket: `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
        });
    }
    // No credentials found
    else {
        console.error(`
    ❌ Firebase credentials not found!
    
    Please do ONE of the following:
    
    1. Place your firebase-service-account.json file in the server/ directory
       Download from: Firebase Console → Project Settings → Service Accounts
    
    2. OR set these environment variables in server/.env:
       - FIREBASE_PROJECT_ID
       - FIREBASE_CLIENT_EMAIL
       - FIREBASE_PRIVATE_KEY
    
    See FIREBASE_SETUP.md for detailed instructions.
    `);
        process.exit(1);
    }
} catch (error) {
    console.error('❌ Failed to initialize Firebase:', error);
    process.exit(1);
}

import { getFirestore } from 'firebase-admin/firestore';

// Export Firebase services
export const auth = getAuth(app);
export const storage = getStorage(app);
export const db = getFirestore(app);

export default app;
