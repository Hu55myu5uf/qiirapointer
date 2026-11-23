import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from '../components/CachedImage';
import { useTheme } from '../context/ThemeContext';
import { listingAPI } from '../services/api';
import { SPACING, FONT_SIZES, BORDER_RADIUS, CONTENT_MAX_WIDTH } from '../constants/theme';
import { LISTING_CATEGORIES, priceLabel } from '../constants/listings';

/** An agent's own listings: status, days left, and a button to add another. */
export default function MyListingsScreen({ navigation }: any) {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const [listings, setListings] = useState<any[]>([]);
    const [canList, setCanList] = useState(true);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await listingAPI.mine();
            setListings(res.data?.listings || []);
            setCanList(Boolean(res.data?.canList));
        } catch {} finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);
    useFocusEffect(useCallback(() => { load(); }, [load]));

    const statusOf = (l: any) => {
        if (l.status === 'taken') return { text: 'Taken', color: colors.textSecondary };
        if (l.status === 'paused') return { text: 'Paused', color: colors.warning };
        if (l.expired) return { text: 'Expired: renew to show it', color: colors.error };
        const days = Math.ceil((new Date(l.expiresAt).getTime() - Date.now()) / 86400000);
        return { text: `Live · ${days} day${days === 1 ? '' : 's'} left`, color: colors.success };
    };

    if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

    return (
        <View style={styles.container}>
            {!canList ? (
                <View style={styles.notice}>
                    <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
                    <Text style={styles.noticeText}>Listing places is for vendors in {LISTING_CATEGORIES.join(', ')}. Change your business category to list.</Text>
                </View>
            ) : null}
            <FlashList
                data={listings}
                keyExtractor={l => l.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.primary]} tintColor={colors.primary} />}
                contentContainerStyle={{ paddingBottom: 100, paddingTop: SPACING.sm }}
                renderItem={({ item: l }) => {
                    const st = statusOf(l);
                    return (
                        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ListingDetail', { listingId: l.id })} accessibilityRole="button" accessibilityLabel={`${l.title}. ${st.text}`}>
                            {l.photos?.[0] ? <Image source={{ uri: l.photos[0] }} style={styles.thumb} /> : <View style={styles.thumb} />}
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={styles.title} numberOfLines={2}>{l.title}</Text>
                                <Text style={styles.price}>{priceLabel(l.price, l.pricePeriod)}</Text>
                                <Text style={[styles.status, { color: st.color }]}>{st.text}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                        </TouchableOpacity>
                    );
                }}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Ionicons name="home-outline" size={44} color={colors.textTertiary} />
                        <Text style={styles.emptyTitle}>No listings yet</Text>
                        <Text style={styles.emptyText}>List a place for rent, short-let, sale, lease or hire.</Text>
                    </View>
                }
            />
            {canList ? (
                <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('ListingForm')} accessibilityRole="button" accessibilityLabel="List a place">
                    <Ionicons name="add" size={22} color={colors.textInverse} />
                    <Text style={styles.fabText}>List a place</Text>
                </TouchableOpacity>
            ) : null}
        </View>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    notice: { flexDirection: 'row', gap: 8, margin: SPACING.md, padding: SPACING.md, borderRadius: BORDER_RADIUS.md, backgroundColor: colors.surfaceLight },
    noticeText: { flex: 1, fontSize: 13, color: colors.textSecondary },
    row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, marginHorizontal: SPACING.md, marginBottom: SPACING.sm, borderRadius: BORDER_RADIUS.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, maxWidth: CONTENT_MAX_WIDTH, width: '100%', alignSelf: 'center' },
    thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: colors.surfaceLight },
    title: { fontSize: FONT_SIZES.md, fontWeight: '700', color: colors.textPrimary },
    price: { fontSize: FONT_SIZES.sm, fontWeight: '800', color: colors.textPrimary, marginTop: 2 },
    status: { fontSize: 12, fontWeight: '700', marginTop: 2 },
    empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: SPACING.xl, gap: SPACING.sm },
    emptyTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: colors.textPrimary },
    emptyText: { fontSize: FONT_SIZES.sm, color: colors.textSecondary, textAlign: 'center' },
    fab: { position: 'absolute', right: SPACING.md, bottom: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 18, minHeight: 48, borderRadius: 24, elevation: 4 },
    fabText: { color: colors.textInverse, fontWeight: '800', fontSize: FONT_SIZES.sm },
});
