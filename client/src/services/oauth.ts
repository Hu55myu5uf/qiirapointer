import { GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithCredential } from 'firebase/auth';
import { auth } from '../config/firebase';
import { authAPI } from './api';
import { Platform, Alert } from 'react-native';

/**
 * Google sign-in on phones uses Google's own account picker (native), then hands the Google ID
 * token to Firebase. It needs the "web client ID" of the Firebase project
 * (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) and the app's SHA fingerprints registered in Firebase.
 * Until that is configured the Google button is hidden instead of failing.
 */
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
export const googleSignInAvailable = Platform.OS === 'web' || Boolean(GOOGLE_WEB_CLIENT_ID);
// Apple's own sign-in screen only exists on Apple devices; Apple requires it on iPhone (added with
// the iPhone version). On Android it is hidden.
export const appleSignInAvailable = Platform.OS === 'web';

export interface OAuthResult {
    success: boolean;
    user?: any;
    error?: string;
}

/**
 * Handle Google Sign-In / Registration
 */
export async function signInWithGoogle(role: 'client' | 'vendor' = 'client'): Promise<OAuthResult> {
    try {
        let result;
        if (Platform.OS === 'web') {
            const provider = new GoogleAuthProvider();
            provider.addScope('profile');
            provider.addScope('email');
            result = await signInWithPopup(auth, provider);
        } else {
            if (!GOOGLE_WEB_CLIENT_ID) {
                return { success: false, error: 'Google sign-in is not set up yet. Please use email and password.' };
            }
            // Loaded only when used, so an app build without the native module can't crash on start
            const { GoogleSignin, isSuccessResponse } = require('@react-native-google-signin/google-signin');
            GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
            await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
            const response = await GoogleSignin.signIn();
            if (!isSuccessResponse(response)) {
                return { success: false, error: 'Sign-in cancelled' };
            }
            const googleIdToken = response.data.idToken;
            if (!googleIdToken) {
                return { success: false, error: 'Google did not return a sign-in token. Please try again.' };
            }
            result = await signInWithCredential(auth, GoogleAuthProvider.credential(googleIdToken));
        }
        // The server always receives a Firebase ID token and verifies it itself
        const idToken = await result.user.getIdToken();

        const response = await authAPI.oauth({
            idToken,
            provider: 'google',
            role,
            fullName: result.user.displayName || undefined,
            email: result.user.email || undefined,
            photoURL: result.user.photoURL || undefined,
        });

        return {
            success: true,
            user: response.data.user,
        };
    } catch (error: any) {
        console.error('Google Sign-In Error:', error);
        const cancelled = error.code === 'auth/popup-closed-by-user' || error.code === 'SIGN_IN_CANCELLED' || error.code === '-5' || error.code === '12501';
        const msg = cancelled
            ? 'Sign-in cancelled'
            : error.code === 'auth/account-exists-with-different-credential'
            ? 'An account with this email already exists. Sign in with your email and password.'
            : (error.response?.data?.error || error.response?.data?.message || error.message || 'Google sign-in failed');
        return {
            success: false,
            error: msg,
        };
    }
}

/**
 * Handle Apple Sign-In / Registration
 */
export async function signInWithApple(role: 'client' | 'vendor' = 'client'): Promise<OAuthResult> {
    try {
        if (Platform.OS !== 'web') {
            return {
                success: false,
                error: 'Apple Sign-In on mobile is available in standalone app builds. Please sign in with email & password in Expo Go.',
            };
        }

        const provider = new OAuthProvider('apple.com');
        provider.addScope('email');
        provider.addScope('name');

        const result = await signInWithPopup(auth, provider);
        const idToken = await result.user.getIdToken();

        const response = await authAPI.oauth({
            idToken,
            provider: 'apple',
            role,
            fullName: result.user.displayName || undefined,
            email: result.user.email || undefined,
            photoURL: result.user.photoURL || undefined,
        });

        return {
            success: true,
            user: response.data.user,
        };
    } catch (error: any) {
        console.error('Apple Sign-In Error:', error);
        const msg = error.code === 'auth/popup-closed-by-user'
            ? 'Sign-in cancelled'
            : (error.response?.data?.message || error.message || 'Apple sign-in failed');
        return {
            success: false,
            error: msg,
        };
    }
}
