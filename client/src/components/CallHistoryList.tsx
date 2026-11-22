import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from './CachedImage';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { PLACEHOLDER_AVATARS } from '../assets';
import { VerificationBadgeInline } from './VerificationBadge';

export type CallRecord = {
    id: string;
    callType: 'voice' | 'video';
    status: 'ended' | 'missed' | 'rejected';
    direction: 'incoming' | 'outgoing';
    missed: boolean;
    durationSeconds: number;
    createdAt: string;
    otherUser: { id: string; name: string; avatar: string; isVerified?: boolean };
};

const fmtDuration = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);

function when(iso: string) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return time;
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return `Yesterday, ${time}`;
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** The user's calls: who, when, incoming/outgoing, missed, and for how long. Tap to open the chat. */
export default function CallHistoryList({
    calls,
    loading,
    refreshing,
    onRefresh,
    onOpen,
}: {
    calls: CallRecord[];
    loading: boolean;
    refreshing: boolean;
    onRefresh: () => void;
    onOpen: (call: CallRecord) => void;
}) {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const [broken, setBroken] = useState<Record<string, boolean>>({});

    const renderItem = useCallback(({ item }: { item: CallRecord }) => {
        const red = item.missed;
        const arrow = item.direction === 'outgoing' ? 'arrow-up-outline' : 'arrow-down-outline';
        const detail = item.missed
            ? 'Missed'
            : item.status === 'rejected'
            ? (item.direction === 'incoming' ? 'Declined' : 'Not answered')
            : item.status === 'missed'
            ? 'No answer'
            : item.durationSeconds > 0 ? fmtDuration(item.durationSeconds) : (item.direction === 'incoming' ? 'Incoming' : 'Outgoing');
        const avatar = item.otherUser.avatar && !broken[item.id] ? { uri: item.otherUser.avatar } : PLACEHOLDER_AVATARS.client;
        return (
            <TouchableOpacity
                style={styles.row}
                onPress={() => onOpen(item)}
                accessibilityRole="button"
                accessibilityLabel={`${detail} ${item.callType} call ${item.direction === 'incoming' ? 'from' : 'to'} ${item.otherUser.name}, ${when(item.createdAt)}. Open chat.`}
            >
                <Image source={avatar} style={styles.avatar} onError={() => setBroken(b => ({ ...b, [item.id]: true }))} />
                <View style={styles.middle}>
                    <View style={styles.nameRow}>
                        <Text style={[styles.name, red && { color: colors.error }]} numberOfLines={1}>{item.otherUser.name}</Text>
                        <VerificationBadgeInline isVerified={Boolean(item.otherUser.isVerified)} size={14} />
                    </View>
                    <View style={styles.detailRow}>
                        <Ionicons name={arrow as any} size={13} color={red ? colors.error : colors.textSecondary} />
                        <Text style={[styles.detail, red && { color: colors.error }]} numberOfLines={1}>
                            {detail} · {when(item.createdAt)}
                        </Text>
                    </View>
                </View>
                <Ionicons
                    name={item.callType === 'video' ? 'videocam-outline' : 'call-outline'}
                    size={20}
                    color={colors.primary}
                />
            </TouchableOpacity>
        );
    }, [styles, colors, broken, onOpen]);

    if (loading && calls.length === 0) {
        return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
    }
    if (calls.length === 0) {
        return (
            <View style={styles.center}>
                <Ionicons name="call-outline" size={40} color={colors.textSecondary} />
                <Text style={styles.emptyText}>No calls yet</Text>
                <Text style={styles.emptySub}>Voice and video calls you make or receive will appear here.</Text>
            </View>
        );
    }
    return (
        <FlashList
            data={calls}
            keyExtractor={(c) => c.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: SPACING.xl }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        />
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2, minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surfaceLight || colors.border },
    middle: { flex: 1, minWidth: 0 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    name: { fontSize: FONT_SIZES.md, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    detail: { fontSize: 13, color: colors.textSecondary, flexShrink: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.sm },
    emptyText: { fontSize: FONT_SIZES.md, fontWeight: '700', color: colors.textPrimary },
    emptySub: { fontSize: FONT_SIZES.sm, color: colors.textSecondary, textAlign: 'center', maxWidth: 300, borderRadius: BORDER_RADIUS.md },
});
