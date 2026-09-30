import React, { useState } from 'react';
import {
    Modal,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    Platform,
    KeyboardAvoidingView,
} from 'react-native';
import { authAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { auth } from '../config/firebase';
import { updatePassword } from 'firebase/auth';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';

interface ChangePasswordModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function ChangePasswordModal({ visible, onClose }: ChangePasswordModalProps) {
    const { colors } = useTheme();
    const styles = getStyles(colors);
    const { user } = useAuthStore();

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const handleResetState = () => {
        setNewPassword('');
        setConfirmPassword('');
        setErrorMessage('');
        setSuccessMessage('');
        setShowPassword(false);
    };

    const handleClose = () => {
        handleResetState();
        onClose();
    };

    const handleChangePassword = async () => {
        setErrorMessage('');
        setSuccessMessage('');

        if (!newPassword || newPassword.trim() === '') {
            setErrorMessage('Please enter a new password.');
            return;
        }

        if (newPassword.length < 6) {
            setErrorMessage('Password must be at least 6 characters long.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setErrorMessage('Passwords do not match.');
            return;
        }

        setLoading(true);

        try {
            // 1. Try Firebase client SDK updatePassword if current user session is fresh
            let clientSuccess = false;
            if (auth.currentUser) {
                try {
                    await updatePassword(auth.currentUser, newPassword);
                    clientSuccess = true;
                } catch (fbErr: any) {
                    console.log('Client SDK password update note (falling back to backend API):', fbErr.message);
                }
            }

            // 2. Also call backend API to ensure admin-level sync
            if (!clientSuccess) {
                await authAPI.changePassword({
                    newPassword,
                    uid: user?.uid,
                });
            }

            setSuccessMessage('Password updated successfully!');
            setTimeout(() => {
                handleClose();
                Alert.alert('Success', 'Password updated successfully!');
            }, 1200);
        } catch (error: any) {
            console.error('Password change error:', error);
            const msg =
                error.response?.data?.error ||
                error.response?.data?.message ||
                error.message ||
                'Failed to update password. Please try again.';
            setErrorMessage(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={handleClose}
        >
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <TouchableOpacity
                    style={styles.backdrop}
                    activeOpacity={1}
                    onPress={handleClose}
                />

                <View style={styles.modalCard}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>🔒 Change Password</Text>
                        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                            <Text style={styles.closeButtonText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.subtitle}>
                        Enter a new secure password (minimum 6 characters).
                    </Text>

                    {/* Messages */}
                    {errorMessage ? (
                        <View style={styles.errorBanner}>
                            <Text style={styles.errorText}>{errorMessage}</Text>
                        </View>
                    ) : null}

                    {successMessage ? (
                        <View style={styles.successBanner}>
                            <Text style={styles.successText}>{successMessage}</Text>
                        </View>
                    ) : null}

                    {/* Input Fields */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>New Password</Text>
                        <View style={styles.inputWrapper}>
                            <TextInput
                                style={styles.input}
                                value={newPassword}
                                onChangeText={setNewPassword}
                                placeholder="Enter new password"
                                placeholderTextColor={colors.textTertiary}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                            />
                            <TouchableOpacity
                                onPress={() => setShowPassword(!showPassword)}
                                style={styles.eyeButton}
                            >
                                <Text style={styles.eyeText}>{showPassword ? '👁️' : '🙈'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Confirm New Password</Text>
                        <TextInput
                            style={styles.input}
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            placeholder="Re-enter new password"
                            placeholderTextColor={colors.textTertiary}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                        />
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.actions}>
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={handleClose}
                            disabled={loading}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.saveButton, loading && styles.saveButtonDisabled]}
                            onPress={handleChangePassword}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator size="small" color={colors.textInverse} />
                            ) : (
                                <Text style={styles.saveButtonText}>Update Password</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const getStyles = (colors: any) =>
    StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: SPACING.lg,
        },
        backdrop: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
        },
        modalCard: {
            width: '100%',
            maxWidth: 440,
            backgroundColor: colors.surface,
            borderRadius: BORDER_RADIUS.xl,
            padding: SPACING.xl,
            borderWidth: 1,
            borderColor: colors.border,
            ...SHADOWS.large,
            zIndex: 10,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: SPACING.xs,
        },
        title: {
            fontSize: FONT_SIZES.lg,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        closeButton: {
            padding: SPACING.xs,
        },
        closeButtonText: {
            fontSize: FONT_SIZES.md,
            color: colors.textSecondary,
            fontWeight: 'bold',
        },
        subtitle: {
            fontSize: FONT_SIZES.sm,
            color: colors.textSecondary,
            marginBottom: SPACING.lg,
        },
        formGroup: {
            marginBottom: SPACING.md,
        },
        label: {
            fontSize: FONT_SIZES.sm,
            fontWeight: '600',
            color: colors.textPrimary,
            marginBottom: SPACING.xs,
        },
        inputWrapper: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        input: {
            flex: 1,
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BORDER_RADIUS.md,
            paddingHorizontal: SPACING.md,
            paddingVertical: Platform.OS === 'ios' ? SPACING.sm : 10,
            fontSize: FONT_SIZES.md,
            color: colors.textPrimary,
        },
        eyeButton: {
            position: 'absolute',
            right: SPACING.sm,
            padding: SPACING.xs,
        },
        eyeText: {
            fontSize: 16,
        },
        errorBanner: {
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            padding: SPACING.sm,
            borderRadius: BORDER_RADIUS.sm,
            marginBottom: SPACING.md,
            borderLeftWidth: 3,
            borderLeftColor: colors.error,
        },
        errorText: {
            color: colors.error,
            fontSize: FONT_SIZES.sm,
        },
        successBanner: {
            backgroundColor: 'rgba(34, 197, 94, 0.15)',
            padding: SPACING.sm,
            borderRadius: BORDER_RADIUS.sm,
            marginBottom: SPACING.md,
            borderLeftWidth: 3,
            borderLeftColor: '#22c55e',
        },
        successText: {
            color: '#22c55e',
            fontSize: FONT_SIZES.sm,
            fontWeight: '600',
        },
        actions: {
            flexDirection: 'row',
            justifyContent: 'flex-end',
            gap: SPACING.sm,
            marginTop: SPACING.lg,
        },
        cancelButton: {
            paddingVertical: SPACING.sm,
            paddingHorizontal: SPACING.lg,
            borderRadius: BORDER_RADIUS.md,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
        },
        cancelButtonText: {
            color: colors.textSecondary,
            fontSize: FONT_SIZES.md,
            fontWeight: '600',
        },
        saveButton: {
            backgroundColor: colors.primary,
            paddingVertical: SPACING.sm,
            paddingHorizontal: SPACING.lg,
            borderRadius: BORDER_RADIUS.md,
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 130,
        },
        saveButtonDisabled: {
            opacity: 0.6,
        },
        saveButtonText: {
            color: colors.textInverse,
            fontSize: FONT_SIZES.md,
            fontWeight: 'bold',
        },
    });
