import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

interface VerificationBadgeProps {
    isVerified: boolean;
    isAdmin?: boolean;
    size?: 'small' | 'medium' | 'large';
    showLabel?: boolean;
}

const BADGE_COLOR = '#B28A45'; // QIIRA golden accent

const SIZE_MAP = {
    small: { icon: 14, font: 10, padding: 3, gap: 2 },
    medium: { icon: 18, font: 12, padding: 5, gap: 3 },
    large: { icon: 22, font: 14, padding: 6, gap: 4 },
};

export default function VerificationBadge({ isVerified, isAdmin = false, size = 'medium', showLabel = false }: VerificationBadgeProps) {
    const sizeConfig = SIZE_MAP[size];

    // Don't render anything if not verified
    if (!isVerified && !isAdmin) return null;

    return (
        <View style={[styles.container, { gap: sizeConfig.gap, marginLeft: 3 }]}>
            <Ionicons
                name="checkmark-circle"
                size={sizeConfig.icon}
                color={BADGE_COLOR}
            />
            {/* Admin gets 2 badges */}
            {isAdmin && (
                <Ionicons
                    name="checkmark-circle"
                    size={sizeConfig.icon}
                    color={BADGE_COLOR}
                    style={{ marginLeft: 1 }}
                />
            )}
            {showLabel ? (
                <Text style={[styles.label, { fontSize: sizeConfig.font, color: BADGE_COLOR, marginLeft: 2 }]}>
                    {isAdmin ? 'System Admin' : 'Verified'}
                </Text>
            ) : null}
        </View>
    );
}

// Standalone badge icon for inline use (e.g., next to vendor or client name)
export function VerificationBadgeInline({ isVerified, isAdmin = false, size = 16 }: { isVerified: boolean; isAdmin?: boolean; size?: number }) {
    if (!isVerified && !isAdmin) return null;

    return (
        <View style={styles.inlineContainer}>
            <Ionicons
                name="checkmark-circle"
                size={size}
                color={BADGE_COLOR}
                style={{ marginLeft: 3 }}
            />
            {/* Admin gets 2 distinct badges */}
            {isAdmin && (
                <Ionicons
                    name="checkmark-circle"
                    size={size}
                    color={BADGE_COLOR}
                    style={{ marginLeft: 2 }}
                />
            )}
        </View>
    );
}

// Corner badge overlay positioned directly on / beside profile picture avatars
export function AvatarVerificationBadge({
    isVerified,
    isAdmin = false,
    size = 20,
    style,
}: {
    isVerified: boolean;
    isAdmin?: boolean;
    size?: number;
    style?: any;
}) {
    if (!isVerified && !isAdmin) return null;

    const overlayWidth = isAdmin ? (size * 1.8) + 4 : size + 4;
    const overlayHeight = size + 4;

    return (
        <View
            style={[
                styles.avatarBadgeOverlay,
                {
                    width: overlayWidth,
                    height: overlayHeight,
                    borderRadius: overlayHeight / 2,
                    paddingHorizontal: isAdmin ? 2 : 0,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                },
                style,
            ]}
        >
            <Ionicons name="checkmark-circle" size={size} color={BADGE_COLOR} />
            {isAdmin && (
                <Ionicons
                    name="checkmark-circle"
                    size={size}
                    color={BADGE_COLOR}
                    style={{ marginLeft: 1 }}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    inlineContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 0,
    },
    avatarBadgeOverlay: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 4,
        zIndex: 10,
    },
    label: {
        fontWeight: '600',
    },
});
