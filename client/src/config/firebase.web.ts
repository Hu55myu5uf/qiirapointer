import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFirestore } from 'firebase/firestore';

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

// Initialize Firebase Auth for web
const auth = getAuth(app);

// Initialize Storage
const storage = getStorage(app);

// Read-only real-time listeners (chat, calls); all writes go through the API server
const firestore = getFirestore(app);

export { auth, storage, firestore };
export default app;
