# QIIRAPOINTER - Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Set Up Firebase

**You have 2 options:**

#### Option A: Using Service Account File (Recommended for Development)
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing
3. Go to **Project Settings** → **Service Accounts**
4. Click **"Generate new private key"**
5. Save the downloaded JSON file as `firebase-service-account.json` in the `server/` folder

#### Option B: Using Environment Variables
1. Download the service account JSON (same as above)
2. Create a `.env` file in the `server/` folder:
   ```env
   PORT=5000
   NODE_ENV=development
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=your-email@project.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

### Step 2: Enable Firebase Services

In Firebase Console:
1. **Authentication** → Enable "Email/Password"
2. **Firestore Database** → Create database (Production mode)
3. **Storage** → Get started

### Step 3: Update Mobile App Config

Edit `client/src/config/firebase.ts` with your Firebase web config:
```typescript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_ID",
  appId: "YOUR_APP_ID"
};
```

---

## ▶️ Run the Application

### Start Backend
```bash
cd server
npm install
npm run dev
```

### Start Mobile App
```bash
cd client  
npm install
npx expo start
```

---

## 📚 Need More Help?

- **Detailed Setup:** See `FIREBASE_SETUP.md`
- **Progress Report:** See `DEVELOPMENT_PROGRESS.md`
- **Server README:** See `server/README.md`

---

## ✅ Verify Everything Works

1. Backend should show: `🚀 Server running on port 5000`
2. Mobile app should open Expo DevTools
3. You can scan QR code to test on your phone

**Happy coding! 🎉**
