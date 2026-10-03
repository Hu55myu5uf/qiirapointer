import { initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB8rHvWpp6SgCXvxxfmSQeGfX2vAdWfcBs",
    authDomain: "qiirapointer.firebaseapp.com",
    projectId: "qiirapointer",
    storageBucket: "qiirapointer.firebasestorage.app",
    messagingSenderId: "970982686292",
    appId: "1:970982686292:web:617691f0a29b2aebd7f7c1",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth with proper persistence per platform
let auth: any;
try {
    if (Platform.OS === 'web' || typeof (FirebaseAuth as any).getReactNativePersistence !== 'function') {
        auth = FirebaseAuth.getAuth(app);
    } else {
        try {
            auth = FirebaseAuth.initializeAuth(app, {
                persistence: (FirebaseAuth as any).getReactNativePersistence(AsyncStorage)
            });
        } catch (e) {
            auth = FirebaseAuth.getAuth(app);
        }
    }
} catch (err) {
    console.warn('Firebase auth initialization fallback:', err);
    try {
        auth = FirebaseAuth.getAuth(app);
    } catch (e2) {
        console.error('Critical firebase auth init error:', e2);
    }
}

// Initialize Storage
const storage = getStorage(app);

export { auth, storage };
export default app;
