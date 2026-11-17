import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Alert } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { confirmAction } from '../utils/alert';
import { authAPI } from '../services/api';
import ChangePasswordModal from '../components/ChangePasswordModal';
import BlockedUsersModal from '../components/BlockedUsersModal';

export default function SettingsScreen() {
    const { theme, colors, toggleTheme } = useTheme();
    const { setUser, setUserRole } = useAuthStore();
    const [passwordModalVisible, setPasswordModalVisible] = useState(false);
    const [blockedModalVisible, setBlockedModalVisible] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const styles = getStyles(colors);

    const handleLogout = () => {
        confirmAction('Log Out', 'Are you sure you want to log out?', async () => {
            try {
                await signOut(auth);
                setUser(null);
                setUserRole(null);
            } catch (error: any) {
                console.error('Logout error:', error);
            }
        }, 'Log Out');
    };

    const handleDeleteAccount = () => {
        Alert.alert(
            'Delete Account Permanently ⚠️',
            'Are you sure you want to permanently delete your Pointer account?\n\nAll your profile information, listings, reviews, posts, chat history, and uploaded documents will be irreversibly erased from our servers.\n\nThis action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Yes, Delete My Account',
                    style: 'destructive',
                    onPress: async () => {
                        setIsDeleting(true);
                        try {
                            await authAPI.deleteAccount();
                            await signOut(auth);
                            setUser(null);
                            setUserRole(null);
                            Alert.alert('Account Deleted', 'Your account and personal data have been completely deleted.');
                        } catch (error: any) {
                            console.error('Delete account error:', error);
                            Alert.alert('Error', error.response?.data?.message || 'Failed to delete account. Please try again.');
                        } finally {
                            setIsDeleting(false);
                        }
                    }
                }
            ]
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Settings</Text>
            </View>

            <View style={styles.content}>
                <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                        <Text style={styles.settingTitle}>Dark Mode</Text>
                        <Text style={styles.settingDescription}>
                            Toggle between light and dark theme
                        </Text>
                    </View>
                    <Switch
                        value={theme === 'dark'}
                        onValueChange={toggleTheme}
                        trackColor={{ false: colors.border, true: colors.primaryLight }}
                        thumbColor={theme === 'dark' ? colors.primary : colors.surface}
                    />
                </View>

                <TouchableOpacity
                    style={styles.actionRow}
                    onPress={() => setPasswordModalVisible(true)}
                >
                    <View style={styles.settingInfo}>
                        <Text style={styles.settingTitle}>🔒 Change Password</Text>
                        <Text style={styles.settingDescription}>
                            Update your account login password
                        </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.actionRow}
                    onPress={() => setBlockedModalVisible(true)}
                >
                    <View style={styles.settingInfo}>
                        <Text style={styles.settingTitle}>🚫 Blocked Users</Text>
                        <Text style={styles.settingDescription}>
                            View and unblock accounts you have blocked
                        </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.actionRow}
                    onPress={() => {
                        Alert.alert(
                            'Community Guidelines & Safety 🛡️',
                            'Pointer is committed to a safe, trustworthy marketplace. We maintain a zero-tolerance policy for harassment, hate speech, inappropriate content, fake stores, and scam behavior. Any reported content violating these standards is investigated within 24 hours.'
                        );
                    }}
                >
                    <View style={styles.settingInfo}>
                        <Text style={styles.settingTitle}>🛡️ Community Guidelines</Text>
                        <Text style={styles.settingDescription}>
                            Learn about our safety and content standards
                        </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                    <Text style={styles.logoutButtonText}>Log Out</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.deleteAccountButton}
                    onPress={handleDeleteAccount}
                    disabled={isDeleting}
                >
                    <Text style={styles.deleteAccountButtonText}>
                        {isDeleting ? 'Deleting Account...' : '🗑️ Delete Account'}
                    </Text>
                </TouchableOpacity>
            </View>

            <ChangePasswordModal
                visible={passwordModalVisible}
                onClose={() => setPasswordModalVisible(false)}
            />

            <BlockedUsersModal
                visible={blockedModalVisible}
                onClose={() => setBlockedModalVisible(false)}
            />
        </View>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        backgroundColor: colors.primary,
        paddingTop: 50,
        paddingBottom: SPACING.md,
        paddingHorizontal: SPACING.lg,
    },
    headerTitle: {
        fontSize: FONT_SIZES.xl,
        fontWeight: 'bold',
        color: colors.textInverse,
    },
    content: {
        padding: SPACING.lg,
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: colors.surface,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: SPACING.md,
    },
    settingInfo: {
        flex: 1,
        marginRight: SPACING.md,
    },
    settingTitle: {
        fontSize: FONT_SIZES.md,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 4,
    },
    settingDescription: {
        fontSize: FONT_SIZES.sm,
        color: colors.textSecondary,
    },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: colors.surface,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: SPACING.md,
    },
    chevron: {
        fontSize: FONT_SIZES.xl,
        color: colors.textTertiary,
        fontWeight: 'bold',
    },
    logoutButton: {
        backgroundColor: colors.error || '#FF3B30',
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        alignItems: 'center',
        marginTop: SPACING.lg,
    },
    logoutButtonText: {
        color: '#FFFFFF',
        fontSize: FONT_SIZES.md,
        fontWeight: 'bold',
    },
    deleteAccountButton: {
        backgroundColor: 'transparent',
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        alignItems: 'center',
        marginTop: SPACING.sm,
        borderWidth: 1,
        borderColor: '#D9534F',
    },
    deleteAccountButtonText: {
        color: '#D9534F',
        fontSize: FONT_SIZES.sm,
        fontWeight: '600',
    },
});
