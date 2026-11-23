import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
    Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from '../components/CachedImage';
import { useTheme } from '../context/ThemeContext';
import { notificationAPI } from '../services/api';
import { useNotificationStore } from '../store/notificationStore';
import { useAuthStore } from '../store/authStore';
import { openChat } from '../navigation/openChat';
import { SPACING, FONT_SIZES, CONTENT_MAX_WIDTH } from '../constants/theme';
import { PLACEHOLDER_AVATARS } from '../assets';

type AppNotification = {
    id: string;
    type: 'missed_call' | 'review' | 'verification_approved' | 'verification_rejected' | 'listing_rejected' | 'mention' | 'community' | 'system';
    title: string;
    body: string;
    actorId?: string | null;
    actorName?: string | null;
    actorAvatar?: string | null;
    data?: Record<string, any>;
    read: boolean;
    createdAt: string;
};

type Row = { kind: 'section'; id: string; label: string } | { kind: 'item'; id: string; item: AppNotification };

const ICONS: Record<AppNotification['type'], { name: string; tint: 'error' | 'primary' | 'success' | 'warning' }> = {
    missed_call: { name: 'call', tint: 'error' },
    review: { name: 'star', tint: 'warning' },
    verification_approved: { name: 'shield-checkmark', tint: 'success' },
    verification_rejected: { name: 'shield-outline', tint: 'error' },
    listing_rejected: { name: 'storefront-outline', tint: 'error' },
    mention: { name: 'at', tint: 'primary' },
    community: { name: 'people', tint: 'primary' },
    system: { name: 'information-circle', tint: 'primary' },
};

function ago(iso: string): string {
    const t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
    return new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export default function NotificationsScreen({ navigation }: any) {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const userRole = useAuthStore(s => s.userRole);
    const setUnread = useNotificationStore(s => s.setUnread);

    const [items, setItems] = useState<AppNotification[]>([]);
    const [nextBefore, setNextBefore] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(false);

    const load = useCallback(async (mode: 'first' | 'refresh') => {
        try {
            setError(false);
            const res = await notificationAPI.list();
            const list: AppNotification[] = res.data?.notifications || [];
            setItems(list);
            setNextBefore(res.data?.nextBefore || null);
            // Opening the page counts as seeing them; they stay highlighted until you leave
            if (list.some(n => !n.read)) {
                notificationAPI.markRead().catch(() => {});
            }
            setUnread(0);
        } catch {
            setError(true);
        } finally {
            if (mode === 'first') setLoading(false);
            setRefreshing(false);
        }
    }, [setUnread]);

    useEffect(() => { load('first'); }, [load]);

    const loadMore = async () => {
        if (!nextBefore || loadingMore) return;
        setLoadingMore(true);
        try {
            const res = await notificationAPI.list(nextBefore);
            setItems(prev => [...prev, ...(res.data?.notifications || [])]);
            setNextBefore(res.data?.nextBefore || null);
        } catch {} finally {
            setLoadingMore(false);
        }
    };

    const open = (n: AppNotification) => {
        switch (n.type) {
            case 'missed_call':
                if (n.data?.otherUserId) {
                    openChat(navigation, {
                        otherUserId: n.data.otherUserId,
                        otherUserName: n.actorName || 'User',
                        otherUserImage: n.actorAvatar || undefined,
                        receiverId: n.data.otherUserId,
                        receiverName: n.actorName || 'User',
                        receiverImage: n.actorAvatar || undefined,
                    });
                }
                return;
            case 'review':
                navigation.navigate(userRole === 'vendor' ? 'Reviews' : 'Profile');
                return;
            case 'verification_approved':
            case 'verification_rejected':
            case 'listing_rejected':
            case 'system':
                navigation.navigate('Profile');
                return;
            case 'community':
                if (n.data?.communityId) {
                    const params = { communityId: n.data.communityId };
                    if (userRole === 'admin') navigation.navigate('Dashboard', { screen: 'CommunityDetail', params, initial: false });
                    else navigation.navigate('Explore', { screen: 'CommunityDetail', params, initial: false });
                }
                return;
            case 'mention':
                if (n.data?.postId) navigation.navigate('Explore', { screen: 'ExploreMain', params: { openPostId: n.data.postId } });
                return;
        }
    };

    const remove = (n: AppNotification) => {
        Alert.alert('Remove notification?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: () => {
                    setItems(prev => prev.filter(x => x.id !== n.id));
                    notificationAPI.remove(n.id).catch(() => {});
                },
            },
        ]);
    };

    const rows: Row[] = useMemo(() => {
        const fresh = items.filter(n => !n.read);
        const earlier = items.filter(n => n.read);
        const out: Row[] = [];
        if (fresh.length) {
            out.push({ kind: 'section', id: 's-new', label: 'New' });
            fresh.forEach(item => out.push({ kind: 'item', id: item.id, item }));
        }
        if (earlier.length) {
            out.push({ kind: 'section', id: 's-earlier', label: fresh.length ? 'Earlier' : 'Recent' });
            earlier.forEach(item => out.push({ kind: 'item', id: item.id, item }));
        }
        return out;
    }, [items]);

    const renderRow = ({ item: row }: { item: Row }) => {
        if (row.kind === 'section') {
            return <Text style={styles.section} accessibilityRole="header">{row.label}</Text>;
        }
        const n = row.item;
        const icon = ICONS[n.type] || ICONS.system;
        const tint = colors[icon.tint] || colors.primary;
        return (
            <TouchableOpacity
                style={[styles.row, !n.read && styles.rowUnread]}
                onPress={() => open(n)}
                onLongPress={() => remove(n)}
                accessibilityRole="button"
                accessibilityLabel={`${n.read ? '' : 'New. '}${n.title}. ${n.body}. ${ago(n.createdAt)}`}
                accessibilityHint="Opens it. Long-press to remove."
            >
                <View style={styles.avatarWrap}>
                    {n.actorId ? (
                        <Image
                            source={n.actorAvatar ? { uri: n.actorAvatar } : PLACEHOLDER_AVATARS.client}
                            style={styles.avatar}
                        />
                    ) : (
                        <View style={[styles.avatar, styles.iconOnly, { backgroundColor: `${tint}22` }]}>
                            <Ionicons name={icon.name as any} size={22} color={tint} />
                        </View>
                    )}
                    {n.actorId ? (
                        <View style={[styles.typeBadge, { backgroundColor: tint, borderColor: colors.background }]}>
                            <Ionicons name={icon.name as any} size={10} color="#FFFFFF" />
                        </View>
                    ) : null}
                </View>
                <View style={styles.text}>
                    <Text style={styles.title} numberOfLines={2}>
                        {n.title}
                        <Text style={styles.time}>  {ago(n.createdAt)}</Text>
                    </Text>
                    <Text style={styles.body} numberOfLines={3}>{n.body}</Text>
                </View>
                {!n.read ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
            </TouchableOpacity>
        );
    };

    if (loading) {
        return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
    }

    return (
        <View style={styles.container}>
            <FlashList
                data={rows}
                keyExtractor={(r) => r.id}
                getItemType={(r) => r.kind}
                renderItem={renderRow}
                onEndReached={loadMore}
                onEndReachedThreshold={0.4}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load('refresh'); }} colors={[colors.primary]} tintColor={colors.primary} />}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Ionicons name={error ? 'cloud-offline-outline' : 'notifications-off-outline'} size={44} color={colors.textTertiary} />
                        <Text style={styles.emptyTitle}>{error ? "Couldn't load notifications" : 'No notifications yet'}</Text>
                        <Text style={styles.emptyText}>
                            {error
                                ? 'Check your connection and pull down to try again.'
                                : 'Missed calls, reviews and verification updates will show up here.'}
                        </Text>
                    </View>
                }
                ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: SPACING.md }} color={colors.primary} /> : null}
                contentContainerStyle={{ paddingBottom: SPACING.xl }}
            />
        </View>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    section: {
        fontSize: FONT_SIZES.md,
        fontWeight: '800',
        color: colors.textPrimary,
        paddingHorizontal: SPACING.md,
        paddingTop: SPACING.lg,
        paddingBottom: SPACING.sm,
        width: '100%',
        maxWidth: CONTENT_MAX_WIDTH,
        alignSelf: 'center',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.md,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm + 2,
        minHeight: 68,
        width: '100%',
        maxWidth: CONTENT_MAX_WIDTH,
        alignSelf: 'center',
    },
    rowUnread: { backgroundColor: `${colors.primary}14` },
    avatarWrap: { width: 48, height: 48 },
    avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceLight || colors.border },
    iconOnly: { alignItems: 'center', justifyContent: 'center' },
    typeBadge: {
        position: 'absolute',
        right: -2,
        bottom: -2,
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: { flex: 1, minWidth: 0 },
    title: { fontSize: FONT_SIZES.sm + 1, fontWeight: '700', color: colors.textPrimary },
    time: { fontSize: 12, fontWeight: '400', color: colors.textTertiary },
    body: { fontSize: FONT_SIZES.sm, color: colors.textSecondary, marginTop: 2, lineHeight: 19 },
    dot: { width: 9, height: 9, borderRadius: 5 },
    empty: { alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: 80, gap: SPACING.sm },
    emptyTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    emptyText: { fontSize: FONT_SIZES.sm, color: colors.textSecondary, textAlign: 'center', maxWidth: 300 },
});
