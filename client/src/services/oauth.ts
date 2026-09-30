import { GoogleAuthProvider, OAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../config/firebase';
import { authAPI } from './api';
import { Platform, Alert } from 'react-native';

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
        if (Platform.OS !== 'web') {
            return {
                success: false,
                error: 'Google Sign-In on mobile is available in standalone app builds. Please sign in with email & password in Expo Go.',
            };
        }

        const provider = new GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');

        // On Web / standard browsers
        const result = await signInWithPopup(auth, provider);
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
        const msg = error.code === 'auth/popup-closed-by-user'
            ? 'Sign-in cancelled'
            : (error.response?.data?.message || error.message || 'Google sign-in failed');
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
