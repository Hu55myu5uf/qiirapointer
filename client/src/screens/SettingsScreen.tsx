import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { confirmAction } from '../utils/alert';
import ChangePasswordModal from '../components/ChangePasswordModal';

export default function SettingsScreen() {
    const { theme, colors, toggleTheme } = useTheme();
    const { setUser, setUserRole } = useAuthStore();
    const [passwordModalVisible, setPasswordModalVisible] = useState(false);
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

                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                    <Text style={styles.logoutButtonText}>Log Out</Text>
                </TouchableOpacity>
            </View>

            <ChangePasswordModal
                visible={passwordModalVisible}
                onClose={() => setPasswordModalVisible(false)}
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
});
