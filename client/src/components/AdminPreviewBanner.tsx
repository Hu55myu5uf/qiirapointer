import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function AdminPreviewBanner() {
    const { realRole, userRole, switchViewRole } = useAuthStore();
    const { colors, theme } = useTheme();

    if (realRole !== 'admin' || userRole === 'admin' || !userRole) {
        return null;
    }

    const isClient = userRole === 'client';

    return (
        <View style={styles.bannerContainer}>
            <View style={styles.content}>
                <View style={styles.infoSection}>
                    <View style={styles.badge}>
                        <Ionicons name="eye" size={14} color="#B28A45" />
                        <Text style={styles.badgeText}>ADMIN PREVIEW</Text>
                    </View>
                    <Text style={styles.titleText}>
                        Viewing as <Text style={styles.roleHighlight}>{userRole.toUpperCase()}</Text>
                    </Text>
                </View>

                <View style={styles.actionsSection}>
                    <TouchableOpacity
                        style={styles.switchButton}
                        onPress={() => switchViewRole(isClient ? 'vendor' : 'client')}
                    >
                        <Text style={styles.switchButtonText}>
                            {isClient ? '🏪 Vendor View' : '👥 Client View'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.exitButton}
                        onPress={() => switchViewRole('admin')}
                    >
                        <Ionicons name="shield-checkmark" size={14} color="#FFFFFF" />
                        <Text style={styles.exitButtonText}>Back to Admin</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    bannerContainer: {
        backgroundColor: '#1A1814',
        borderBottomWidth: 1.5,
        borderBottomColor: '#B28A45',
        paddingHorizontal: SPACING.md,
        paddingVertical: 10,
        zIndex: 9999,
        ...SHADOWS.medium,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
    },
    infoSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(178, 138, 69, 0.2)',
        borderColor: '#B28A45',
        borderWidth: 1,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    badgeText: {
        color: '#B28A45',
        fontWeight: 'bold',
        fontSize: 10,
        letterSpacing: 0.5,
    },
    titleText: {
        color: '#E0E0E0',
        fontSize: FONT_SIZES.sm,
        fontWeight: '500',
    },
    roleHighlight: {
        color: '#B28A45',
        fontWeight: 'bold',
    },
    actionsSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    switchButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.sm,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    switchButtonText: {
        color: '#FFFFFF',
        fontSize: FONT_SIZES.xs,
        fontWeight: '600',
    },
    exitButton: {
        backgroundColor: '#B28A45',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.sm,
    },
    exitButtonText: {
        color: '#FFFFFF',
        fontSize: FONT_SIZES.xs,
        fontWeight: 'bold',
    },
});
