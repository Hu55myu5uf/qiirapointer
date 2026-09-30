# QIIRAPOINTER Server

## Overview
Backend API server for QIIRAPOINTER mobile application built with Node.js, Express, TypeScript, and Firebase.

## Tech Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Storage**: Firebase Storage

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your Firebase credentials:
```bash
cp .env.example .env
```

Update the following variables:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `PAYSTACK_SECRET_KEY` (for payment processing)

### 3. Firebase Service Account
1. Go to Firebase Console → Project Settings → Service Accounts
2. Generate a new private key (JSON file)
3. Save it as `firebase-service-account.json` in the server root directory
4. **Alternative**: Use environment variables instead (recommended for production)

## Development

### Run Development Server
```bash
npm run dev
```

Server will start on `http://localhost:5000`

### Build for Production
```bash
npm run build
```

### Run Production Server
```bash
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user (Client or Vendor)
- `POST /api/auth/login` - Login user
- `GET /api/auth/user/:uid` - Get user profile

### Vendors
- `GET /api/vendors` - Get all verified vendors (with filters)
- `GET /api/vendors/:id` - Get vendor by ID
- `PUT /api/vendors/:id/profile` - Update vendor profile
- `POST /api/vendors/:id/documents` - Upload verification documents
- `POST /api/vendors/:id/payment` - Process verification fee payment

### Clients
- `POST /api/clients/:id/reviews` - Submit vendor review
- `GET /api/clients/:id/favorites` - Get favorite vendors
- `POST /api/clients/:id/favorites` - Add vendor to favorites

### Admin
- `GET /api/admin/vendors/pending` - Get vendors pending verification
- `PUT /api/admin/vendors/:id/verify` - Approve/reject vendor
- `GET /api/admin/analytics` - Get platform analytics
- `DELETE /api/admin/users/:id` - Delete user

## Project Structure
```
server/
├── src/
│   ├── config/
│   │   └── firebase.ts       # Firebase configuration
│   ├── routes/
│   │   ├── auth.routes.ts    # Authentication routes
│   │   ├── vendor.routes.ts  # Vendor routes
│   │   ├── client.routes.ts  # Client routes
│   │   └── admin.routes.ts   # Admin routes
│   └── index.ts              # Main server file
├── .env.example              # Environment variables template
├── tsconfig.json             # TypeScript configuration
└── package.json              # Dependencies
```

## Security Notes
- Never commit `.env` or `firebase-service-account.json` to version control
- Always validate user inputs
- Implement authentication middleware for protected routes
- Use HTTPS in production

## TODO
- [ ] Add authentication middleware
- [ ] Implement rate limiting
- [ ] Add request validation with Joi or Zod
- [ ] Integrate Paystack/Stripe for payments
- [ ] Add WebSocket support for real-time notifications
- [ ] Implement geolocation search
- [ ] Add comprehensive error handling
- [ ] Write unit and integration tests
