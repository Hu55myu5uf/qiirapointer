# Firebase Setup Guide for QIIRAPOINTER

## 🔥 Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"**
3. Enter project name: `qiirapointer` (or your preferred name)
4. Disable Google Analytics (optional for now)
5. Click **"Create project"**

---

## 🔑 Step 2: Get Firebase Credentials

### For the Backend (Server)

1. In Firebase Console, click the **gear icon** ⚙️ → **Project settings**
2. Go to the **"Service accounts"** tab
3. Click **"Generate new private key"**
4. Click **"Generate key"** - A JSON file will download
5. Save this file as `firebase-service-account.json` in the `server/` directory
   - ⚠️ **DO NOT commit this file to Git** (it's already in .gitignore)

### For the Mobile App (Client)

1. In Firebase Console, click **"Project settings"**
2. Scroll down to **"Your apps"**
3. Click the **Web icon** `</>`
4. Register your app with a nickname (e.g., "QIIRAPOINTER Web")
5. Copy the `firebaseConfig` object

---

## 🛠️ Step 3: Configure Environment Variables

### Backend (.env file)

Create a file named `.env` in the `server/` directory with the following content:

```env
PORT=5000
NODE_ENV=development

# Option 1: Use service account file (RECOMMENDED)
# Just save firebase-service-account.json in server/ directory
# The app will automatically use it

# Option 2: Use environment variables (for production)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Private-Key-Here\n-----END PRIVATE KEY-----\n"

# Payment Gateway (get from Paystack/Stripe)
PAYSTACK_SECRET_KEY=sk_test_your_paystack_key
# STRIPE_SECRET_KEY=sk_test_your_stripe_key
```

**How to get these values from your service account JSON:**
```json
{
  "project_id": "← Copy this to FIREBASE_PROJECT_ID",
  "client_email": "← Copy this to FIREBASE_CLIENT_EMAIL",
  "private_key": "← Copy this entire string to FIREBASE_PRIVATE_KEY"
}
```

### Mobile App (firebase.ts)

Update `client/src/config/firebase.ts`:

```typescript
const firebaseConfig = {
  apiKey: "AIza...",              // From Firebase Console
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

---

## 🗄️ Step 4: Enable Firebase Services

### In Firebase Console:

1. **Enable Authentication:**
   - Click **"Authentication"** → **"Get started"**
   - Enable **"Email/Password"** sign-in method

2. **Enable Firestore Database:**
   - Click **"Firestore Database"** → **"Create database"**
   - Start in **Production mode** (we'll set rules later)
   - Choose a location (e.g., us-central)

3. **Enable Cloud Storage:**
   - Click **"Storage"** → **"Get started"**
   - Start in **Production mode**

4. **Set Firestore Security Rules:**
   Click **"Firestore Database"** → **"Rules"** and paste:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Vendors collection
    match /vendors/{vendorId} {
      allow read: if true; // Public read
      allow write: if request.auth != null && request.auth.uid == vendorId;
    }
    
    // Reviews collection
    match /reviews/{reviewId} {
      allow read: if true; // Public read
      allow create: if request.auth != null;
    }
    
    // Favorites collection
    match /favorites/{favoriteId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## ✅ Step 5: Verify Setup

### Test Backend:
```bash
cd server
npm run dev
```

You should see:
```
🚀 Server running on port 5000
📍 Environment: development
```

### Test Mobile App:
```bash
cd client
npx expo start
```

---

## 🚨 Common Issues & Solutions

### Issue: "Service account object must contain a string 'project_id' property"
**Solution:** Either:
- Place `firebase-service-account.json` in the `server/` directory, OR
- Set all three env vars: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`

### Issue: "Cannot find module 'firebase-admin'"
**Solution:** 
```bash
cd server
npm install
```

### Issue: Authentication not working
**Solution:** 
- Verify Email/Password is enabled in Firebase Console → Authentication
- Check that your `firebaseConfig` in client is correct

---

## 📝 Quick Start Checklist

- [ ] Create Firebase project
- [ ] Download service account JSON → save as `firebase-service-account.json`
- [ ] Create `server/.env` file with credentials
- [ ] Enable Authentication (Email/Password)
- [ ] Enable Firestore Database
- [ ] Enable Cloud Storage
- [ ] Update `client/src/config/firebase.ts` with web config
- [ ] Run `npm run dev` in server (should start successfully)
- [ ] Run `npx expo start` in client

---

## 🔐 Security Reminders

- ✅ `.env` is in `.gitignore` - never commit it
- ✅ `firebase-service-account.json` is in `.gitignore`
- ✅ Use environment variables in production
- ✅ Update Firestore security rules before deploying

---

**Need help?** Check the [Firebase Documentation](https://firebase.google.com/docs)
