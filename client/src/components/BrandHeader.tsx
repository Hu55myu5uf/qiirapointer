import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    LayoutChangeEvent,
    NativeScrollEvent,
    NativeSyntheticEvent,
    StyleProp,
    ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useNotificationStore } from '../store/notificationStore';

/** Loaded in App (useFonts); until then the system font's heaviest weight is used. */
export const WORDMARK_FONT = 'Montserrat_900Black';

/**
 * The POINTER wordmark, drawn the way the logo is: heavy capitals with the "O" as a gold ring and
 * dot. Drawn rather than an image so it follows light / dark mode.
 */
export function PointerWordmark({ size = 22 }: { size?: number }) {
    const { colors } = useTheme();
    const letter = { fontFamily: WORDMARK_FONT, fontSize: size, color: colors.textPrimary, letterSpacing: size * 0.02, includeFontPadding: false } as const;
    const ring = Math.round(size * 0.74);
    const border = Math.max(2, Math.round(size * 0.15));
    const dot = Math.round(ring * 0.32);
    return (
        <View style={styles.wordmark} accessible accessibilityRole="header" accessibilityLabel="Pointer">
            <Text style={letter}>P</Text>
            <View
                style={{
                    width: ring,
                    height: ring,
                    borderRadius: ring / 2,
                    borderWidth: border,
                    borderColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginHorizontal: size * 0.04,
                }}
            >
                <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: colors.primary }} />
            </View>
            <Text style={letter}>INTER</Text>
        </View>
    );
}

/** Round icon button for the brand bar (same size everywhere, 44pt touch target). */
export function HeaderIconButton({
    icon,
    onPress,
    label,
    badge,
    filled,
}: {
    icon: string;
    onPress: () => void;
    label: string;
    badge?: number;
    filled?: boolean;
}) {
    const { colors } = useTheme();
    return (
        <TouchableOpacity
            onPress={onPress}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={badge ? `${label}, ${badge} new` : label}
            hitSlop={4}
        >
            <View style={[styles.iconCircle, filled && { backgroundColor: colors.primary }]}>
                <Ionicons name={icon as any} size={22} color={filled ? colors.textInverse : colors.textPrimary} />
            </View>
            {badge ? (
                <View style={[styles.badge, { backgroundColor: colors.error, borderColor: colors.surface }]}>
                    <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
                </View>
            ) : null}
        </TouchableOpacity>
    );
}

/**
 * The top bar of the main tabs: Pointer wordmark on the left; the screen's own buttons and the
 * notifications bell on the right. Covers the status bar area itself.
 */
export default function BrandHeader({
    navigation,
    actions,
    showNotifications = true,
    children,
    style,
}: {
    navigation?: any;
    actions?: React.ReactNode;
    showNotifications?: boolean;
    /** Rows under the bar (search, tabs, chips) that collapse together with it */
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const unread = useNotificationStore(s => s.unreadCount);
    return (
        <View style={[{ backgroundColor: colors.surface, paddingTop: insets.top, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, style]}>
            <View style={styles.bar}>
                <PointerWordmark />
                <View style={styles.actions}>
                    {actions}
                    {showNotifications && navigation ? (
                        <HeaderIconButton
                            icon={unread > 0 ? 'notifications' : 'notifications-outline'}
                            label="Notifications"
                            badge={unread}
                            onPress={() => navigation.navigate('Notifications')}
                        />
                    ) : null}
                </View>
            </View>
            {children}
        </View>
    );
}

/**
 * Instagram-style collapsing top area: it slides away while scrolling down through the list and
 * comes back as soon as you scroll up. The status bar area stays covered.
 *
 * Usage: put the header in <Animated.View style={[collapsible.style]} onLayout={collapsible.onLayout}>,
 * give the list `onScroll={collapsible.onScroll}` and `contentContainerStyle={{ paddingTop: collapsible.height }}`.
 */
export function useCollapsibleHeader(enabled = true) {
    const insets = useSafeAreaInsets();
    const [height, setHeight] = useState(0);
    const scrollY = useRef(new Animated.Value(0)).current;
    const travel = Math.max(0, height - insets.top);

    const translateY = useMemo(() => {
        if (!enabled || travel <= 0) return 0;
        return Animated.diffClamp(scrollY, 0, travel).interpolate({
            inputRange: [0, travel],
            outputRange: [0, -travel],
            extrapolate: 'clamp',
        });
    }, [enabled, travel, scrollY]);

    const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        scrollY.setValue(Math.max(0, e.nativeEvent.contentOffset.y));
    }, [scrollY]);

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        const h = Math.round(e.nativeEvent.layout.height);
        setHeight(prev => (Math.abs(prev - h) > 1 ? h : prev));
    }, []);

    const style: StyleProp<ViewStyle> = enabled
        ? { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, elevation: 4, transform: [{ translateY: translateY as any }] }
        : null;

    /** Keeps the status bar area covered while the header is slid away */
    const statusBarCover = enabled ? (
        <StatusBarCover />
    ) : null;

    return { height: enabled ? height : 0, onScroll, onLayout, style, statusBarCover, reset: () => scrollY.setValue(0) };
}

function StatusBarCover() {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    if (!insets.top) return null;
    return <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.surface, zIndex: 20, elevation: 5 }} />;
}

const styles = StyleSheet.create({
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 16,
        paddingRight: 8,
        minHeight: 52,
    },
    wordmark: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badge: {
        position: 'absolute',
        top: 4,
        right: 3,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        paddingHorizontal: 4,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '800',
    },
});
