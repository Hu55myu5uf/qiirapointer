import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuthStore } from '../store/authStore';
import { authAPI } from '../services/api';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import SocialAuthButtons from '../components/SocialAuthButtons';

export default function LoginScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = getStyles(colors);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const { setUser, setUserRole } = useAuthStore();

    const handleLogin = async () => {
        setErrorMessage('');
        if (!email || !password) {
            const msg = 'Please fill in both email and password';
            setErrorMessage(msg);
            if (Platform.OS !== 'web') Alert.alert('Error', msg);
            return;
        }

        setLoading(true);
        try {
            // Sign in with Firebase
            const trimmedEmail = email.trim();
            const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
            const idToken = await userCredential.user.getIdToken();

            // Verify with backend and get user data
            const response = await authAPI.login(idToken);
            const userData = response.data.user;

            if (userData?.isSuspended) {
                await signOut(auth);
                const msg = 'Your account has been suspended by an administrator. Please contact support.';
                setErrorMessage(msg);
                if (Platform.OS !== 'web') Alert.alert('Account Suspended', msg);
                return;
            }

            setUser(userCredential.user);
            setUserRole(userData.role);

            // Navigation will be handled by auth state listener
        } catch (error: any) {
            console.error('Login error:', error);
            let msg = 'Please check your credentials';
            if (error.response?.data?.message) {
                msg = error.response.data.message;
            } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                msg = 'Invalid email or password. Please try again.';
            } else if (error.code === 'auth/invalid-email') {
                msg = 'Invalid email format.';
            } else if (error.message) {
                msg = error.message;
            }
            try { await signOut(auth); } catch (_) {}
            setErrorMessage(msg);
            if (Platform.OS !== 'web') {
                Alert.alert('Login Failed', msg);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.title}>Welcome Back!</Text>
                    <Text style={styles.subtitle}>Sign in to continue</Text>
                </View>

                <View style={styles.form}>
                    {errorMessage ? (
                        <View style={styles.errorBanner}>
                            <Text style={styles.errorBannerText}>⚠️ {errorMessage}</Text>
                        </View>
                    ) : null}

                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter your email"
                            placeholderTextColor={colors.textTertiary}
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>

                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>Password</Text>
                        <View style={styles.passwordContainer}>
                            <TextInput
                                style={styles.passwordInput}
                                placeholder="Enter your password"
                                placeholderTextColor={colors.textTertiary}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                            />
                            <TouchableOpacity
                                style={styles.eyeIcon}
                                onPress={() => setShowPassword(!showPassword)}
                            >
                                <Text style={styles.eyeIconText}>{showPassword ? 'Hide' : 'Show'}</Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity style={styles.forgotPasswordContainer} onPress={() => Alert.alert('Forgot Password', 'Password reset instructions would be sent to your email.')}>
                            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleLogin}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color={colors.textInverse} />
                        ) : (
                            <Text style={styles.buttonText}>Login</Text>
                        )}
                    </TouchableOpacity>

                    <SocialAuthButtons
                        mode="login"
                        onError={(err) => setErrorMessage(err)}
                    />

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Don't have an account? </Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                            <Text style={styles.linkText}>Sign Up</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: SPACING.lg,
    },
    header: {
        marginBottom: SPACING.xl,
        alignItems: 'center',
    },
    title: {
        fontSize: FONT_SIZES.xxxl,
        fontWeight: 'bold',
        color: colors.primary,
        marginBottom: SPACING.sm,
    },
    subtitle: {
        fontSize: FONT_SIZES.md,
        color: colors.textSecondary,
    },
    form: {
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.lg,
        padding: SPACING.lg,
    },
    errorBanner: {
        backgroundColor: '#fee2e2',
        borderWidth: 1,
        borderColor: '#ef4444',
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        marginBottom: SPACING.md,
    },
    errorBannerText: {
        color: '#b91c1c',
        fontSize: FONT_SIZES.sm,
        fontWeight: '500',
        textAlign: 'center',
    },
    inputContainer: {
        marginBottom: SPACING.md,
    },
    label: {
        fontSize: FONT_SIZES.sm,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: SPACING.xs,
    },
    input: {
        backgroundColor: colors.surfaceLight,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        fontSize: FONT_SIZES.md,
        color: colors.textPrimary,
        borderWidth: 1,
        borderColor: colors.border,
    },
    passwordContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surfaceLight,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    passwordInput: {
        flex: 1,
        padding: SPACING.md,
        fontSize: FONT_SIZES.md,
        color: colors.textPrimary,
    },
    eyeIcon: {
        padding: SPACING.md,
    },
    eyeIconText: {
        color: colors.textSecondary,
        fontWeight: 'bold',
        fontSize: FONT_SIZES.sm,
    },
    forgotPasswordContainer: {
        alignItems: 'flex-end',
        marginTop: SPACING.xs,
    },
    forgotPasswordText: {
        color: colors.primary,
        fontSize: FONT_SIZES.sm,
        fontWeight: 'bold',
    },
    button: {
        backgroundColor: colors.primary,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        alignItems: 'center',
        marginTop: SPACING.md,
    },
    buttonDisabled: {
        backgroundColor: colors.textTertiary,
    },
    buttonText: {
        color: colors.textInverse,
        fontSize: FONT_SIZES.md,
        fontWeight: 'bold',
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: SPACING.lg,
    },
    footerText: {
        fontSize: FONT_SIZES.sm,
        color: colors.textSecondary,
    },
    linkText: {
        fontSize: FONT_SIZES.sm,
        color: colors.primary,
        fontWeight: 'bold',
    },
});
