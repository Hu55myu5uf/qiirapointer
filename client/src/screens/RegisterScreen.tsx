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
import { authAPI } from '../services/api';
import { scheduleLocalNotification } from '../services/notifications';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import SocialAuthButtons from '../components/SocialAuthButtons';

export default function RegisterScreen({ navigation }: any) {
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [role, setRole] = useState<'client' | 'vendor'>('client');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleRegister = async () => {
        setStatusMessage(null);

        // Validation
        if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
            const msg = 'Please fill in all required fields';
            setStatusMessage({ type: 'error', text: msg });
            Alert.alert('Registration Failed', msg);
            return;
        }

        if (password !== confirmPassword) {
            const msg = 'Passwords do not match. Please verify your passwords.';
            setStatusMessage({ type: 'error', text: msg });
            Alert.alert('Registration Failed', msg);
            return;
        }

        if (password.length < 6) {
            const msg = 'Password must be at least 6 characters long.';
            setStatusMessage({ type: 'error', text: msg });
            Alert.alert('Registration Failed', msg);
            return;
        }

        setLoading(true);
        try {
            // Register with backend (Backend handles Firebase Auth creation)
            const response = await authAPI.register({
                email: email.trim(),
                password,
                fullName: fullName.trim(),
                phoneNumber: phoneNumber.trim(),
                role,
            });

            const successText = 'Account registered successfully! Redirecting you to login...';
            setStatusMessage({ type: 'success', text: successText });

            // Trigger local/device notification
            try {
                await scheduleLocalNotification(
                    'Registration Successful 🎉',
                    `Welcome to QIIRA, ${fullName.trim()}! Your account is ready.`
                );
            } catch (_) {}

            // Themed in-app notification popup
            let navigated = false;
            const goToLogin = () => {
                if (navigated) return;
                navigated = true;
                navigation.navigate('Login', { registeredEmail: email.trim() });
            };

            Alert.alert(
                'Registration Successful 🎉',
                `Welcome to QIIRA, ${fullName.trim()}!\n\nYour account has been created. Redirecting you to the login screen...`,
                [{ text: 'Log In Now', onPress: goToLogin }]
            );

            // Automatic redirect after 1.8 seconds
            setTimeout(goToLogin, 1800);
        } catch (error: any) {
            console.error('Registration error:', error);
            const errorMessage =
                error.response?.data?.message || error.response?.data?.error || error.message || 'Registration failed. Please check your credentials and try again.';
            
            setStatusMessage({ type: 'error', text: errorMessage });

            try {
                await scheduleLocalNotification('Registration Failed ⚠️', errorMessage);
            } catch (_) {}

            Alert.alert('Registration Failed', errorMessage);
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
                    <Text style={styles.title}>Create Account</Text>
                    <Text style={styles.subtitle}>Join QIIRAPOINTER today</Text>
                </View>

                <View style={styles.form}>
                    {statusMessage && (
                        <View
                            style={[
                                styles.statusBanner,
                                statusMessage.type === 'success' ? styles.statusBannerSuccess : styles.statusBannerError,
                            ]}
                        >
                            <Ionicons
                                name={statusMessage.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
                                size={20}
                                color={statusMessage.type === 'success' ? '#10B981' : '#EF4444'}
                            />
                            <Text
                                style={[
                                    styles.statusBannerText,
                                    statusMessage.type === 'success' ? styles.statusBannerTextSuccess : styles.statusBannerTextError,
                                ]}
                            >
                                {statusMessage.text}
                            </Text>
                        </View>
                    )}

                    {/* Role Selection */}
                    <View style={styles.roleContainer}>
                        <TouchableOpacity
                            style={[
                                styles.roleButton,
                                role === 'client' && styles.roleButtonActive,
                            ]}
                            onPress={() => setRole('client')}
                        >
                            <Text
                                style={[
                                    styles.roleText,
                                    role === 'client' && styles.roleTextActive,
                                ]}
                            >
                                Client
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.roleButton,
                                role === 'vendor' && styles.roleButtonActive,
                            ]}
                            onPress={() => setRole('vendor')}
                        >
                            <Text
                                style={[
                                    styles.roleText,
                                    role === 'vendor' && styles.roleTextActive,
                                ]}
                            >
                                Vendor
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>Full Name *</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter your full name"
                            placeholderTextColor={colors.textTertiary}
                            value={fullName}
                            onChangeText={setFullName}
                            autoCapitalize="words"
                        />
                    </View>

                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>Email *</Text>
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
                        <Text style={styles.label}>Phone Number</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter your phone number"
                            placeholderTextColor={colors.textTertiary}
                            value={phoneNumber}
                            onChangeText={setPhoneNumber}
                            keyboardType="phone-pad"
                            textContentType="telephoneNumber"
                            autoComplete="tel"
                            importantForAutofill="no"
                        />
                    </View>

                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>Password *</Text>
                        <View style={styles.passwordContainer}>
                            <TextInput
                                style={[styles.input, styles.passwordInput]}
                                placeholder="Enter your password (min 6 characters)"
                                placeholderTextColor={colors.textTertiary}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                                textContentType="newPassword"
                                autoComplete="new-password"
                                importantForAutofill="no"
                            />
                            <TouchableOpacity
                                style={styles.eyeIcon}
                                onPress={() => setShowPassword(!showPassword)}
                            >
                                <Ionicons
                                    name={showPassword ? 'eye-off' : 'eye'}
                                    size={24}
                                    color={colors.textSecondary}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>Confirm Password *</Text>
                        <View style={styles.passwordContainer}>
                            <TextInput
                                style={[styles.input, styles.passwordInput]}
                                placeholder="Confirm your password"
                                placeholderTextColor={colors.textTertiary}
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                secureTextEntry={!showConfirmPassword}
                                autoCapitalize="none"
                                textContentType="newPassword"
                                autoComplete="new-password"
                                importantForAutofill="no"
                            />
                            <TouchableOpacity
                                style={styles.eyeIcon}
                                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                            >
                                <Ionicons
                                    name={showConfirmPassword ? 'eye-off' : 'eye'}
                                    size={24}
                                    color={colors.textSecondary}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleRegister}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color={colors.textInverse} />
                        ) : (
                            <Text style={styles.buttonText}>Register</Text>
                        )}
                    </TouchableOpacity>

                    <SocialAuthButtons
                        mode="register"
                        role={role}
                        onSuccess={(user) => {
                            if (user.role === 'vendor') {
                                navigation.navigate('VendorProfileCompletion', {
                                    vendorId: user.uid,
                                    email: user.email,
                                });
                            }
                        }}
                    />

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Already have an account? </Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                            <Text style={styles.linkText}>Sign In</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const getStyles = (colors: any) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        scrollContent: {
            flexGrow: 1,
            padding: SPACING.lg,
            paddingTop: SPACING.xl,
        },
        header: {
            marginBottom: SPACING.lg,
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
        roleContainer: {
            flexDirection: 'row',
            marginBottom: SPACING.md,
            gap: SPACING.sm,
        },
        roleButton: {
            flex: 1,
            padding: SPACING.md,
            borderRadius: BORDER_RADIUS.md,
            borderWidth: 2,
            borderColor: colors.border,
            alignItems: 'center',
        },
        roleButtonActive: {
            borderColor: colors.primary,
            backgroundColor: colors.primary,
        },
        roleText: {
            fontSize: FONT_SIZES.md,
            color: colors.textSecondary,
            fontWeight: '600',
        },
        roleTextActive: {
            color: colors.textInverse,
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
            borderWidth: 0,
            backgroundColor: 'transparent',
        },
        eyeIcon: {
            padding: SPACING.md,
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
        statusBanner: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: SPACING.md,
            borderRadius: BORDER_RADIUS.md,
            marginBottom: SPACING.md,
            gap: SPACING.sm,
            borderWidth: 1,
        },
        statusBannerSuccess: {
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderColor: 'rgba(16, 185, 129, 0.3)',
        },
        statusBannerError: {
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
        },
        statusBannerText: {
            flex: 1,
            fontSize: FONT_SIZES.sm,
            fontWeight: '600',
            lineHeight: 18,
        },
        statusBannerTextSuccess: {
            color: '#10B981',
        },
        statusBannerTextError: {
            color: '#EF4444',
        },
    });
