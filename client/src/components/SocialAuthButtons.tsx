import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { signInWithGoogle, signInWithApple } from '../services/oauth';
import { useAuthStore } from '../store/authStore';
import { auth } from '../config/firebase';

interface SocialAuthButtonsProps {
    mode?: 'login' | 'register';
    role?: 'client' | 'vendor';
    onSuccess?: (user: any) => void;
    onError?: (error: string) => void;
}

export default function SocialAuthButtons({
    mode = 'login',
    role = 'client',
    onSuccess,
    onError,
}: SocialAuthButtonsProps) {
    const { colors } = useTheme();
    const { setUser, setUserRole } = useAuthStore();
    const [loadingProvider, setLoadingProvider] = useState<'google' | 'apple' | null>(null);

    const handleGoogleAuth = async () => {
        setLoadingProvider('google');
        try {
            const res = await signInWithGoogle(role);
            if (res.success && res.user) {
                if (auth.currentUser) {
                    setUser(auth.currentUser);
                }
                setUserRole(res.user.role);
                onSuccess?.(res.user);
            } else if (res.error && res.error !== 'Sign-in cancelled') {
                onError?.(res.error);
                if (Platform.OS !== 'web') Alert.alert('Authentication Failed', res.error);
            }
        } catch (e: any) {
            const msg = e.message || 'Google authentication failed';
            onError?.(msg);
        } finally {
            setLoadingProvider(null);
        }
    };

    const handleAppleAuth = async () => {
        setLoadingProvider('apple');
        try {
            const res = await signInWithApple(role);
            if (res.success && res.user) {
                if (auth.currentUser) {
                    setUser(auth.currentUser);
                }
                setUserRole(res.user.role);
                onSuccess?.(res.user);
            } else if (res.error && res.error !== 'Sign-in cancelled') {
                onError?.(res.error);
                if (Platform.OS !== 'web') Alert.alert('Authentication Failed', res.error);
            }
        } catch (e: any) {
            const msg = e.message || 'Apple authentication failed';
            onError?.(msg);
        } finally {
            setLoadingProvider(null);
        }
    };

    const styles = getStyles(colors);

    return (
        <View style={styles.container}>
            <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
                <View style={styles.dividerLine} />
            </View>

            <View style={styles.buttonsRow}>
                {/* Google Button */}
                <TouchableOpacity
                    style={[styles.socialButton, styles.googleButton]}
                    onPress={handleGoogleAuth}
                    disabled={loadingProvider !== null}
                    activeOpacity={0.8}
                >
                    {loadingProvider === 'google' ? (
                        <ActivityIndicator size="small" color={colors.textPrimary} />
                    ) : (
                        <View style={styles.buttonContent}>
                            <Ionicons name="logo-google" size={20} color="#EA4335" />
                            <Text style={styles.socialButtonText}>Google</Text>
                        </View>
                    )}
                </TouchableOpacity>

                {/* Apple Button */}
                <TouchableOpacity
                    style={[styles.socialButton, styles.appleButton]}
                    onPress={handleAppleAuth}
                    disabled={loadingProvider !== null}
                    activeOpacity={0.8}
                >
                    {loadingProvider === 'apple' ? (
                        <ActivityIndicator size="small" color={colors.textPrimary} />
                    ) : (
                        <View style={styles.buttonContent}>
                            <Ionicons name="logo-apple" size={20} color={colors.textPrimary} />
                            <Text style={styles.socialButtonText}>Apple ID</Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const getStyles = (colors: any) =>
    StyleSheet.create({
        container: {
            width: '100%',
            marginTop: SPACING.lg,
            marginBottom: SPACING.md,
        },
        dividerContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: SPACING.md,
        },
        dividerLine: {
            flex: 1,
            height: 1,
            backgroundColor: colors.border,
        },
        dividerText: {
            paddingHorizontal: SPACING.md,
            fontSize: FONT_SIZES.xs,
            fontWeight: '600',
            color: colors.textTertiary,
            letterSpacing: 0.8,
        },
        buttonsRow: {
            flexDirection: 'row',
            gap: SPACING.md,
        },
        socialButton: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: SPACING.md,
            borderRadius: BORDER_RADIUS.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
        },
        googleButton: {},
        appleButton: {},
        buttonContent: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACING.sm,
        },
        socialButtonText: {
            fontSize: FONT_SIZES.sm,
            fontWeight: '700',
            color: colors.textPrimary,
        },
    });
