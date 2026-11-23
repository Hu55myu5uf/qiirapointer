import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    Modal,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { Image } from '../components/CachedImage';
import MapView, { Marker, Callout } from '../components/MapView';
import { useTheme } from '../context/ThemeContext';
import { listingAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { VerificationBadgeInline } from '../components/VerificationBadge';
import { SPACING, FONT_SIZES, BORDER_RADIUS, CONTENT_MAX_WIDTH } from '../constants/theme';
import {
    LISTING_PURPOSES, PROPERTY_TYPES, FURNISHED_OPTIONS, NIGERIAN_STATES,
    labelOf, priceLabel,
} from '../constants/listings';

type Filters = { purpose: string; type: string; state: string; minPrice: string; maxPrice: string; bedrooms: string; furnished: string; nearMe: boolean };
const EMPTY: Filters = { purpose: '', type: '', state: '', minPrice: '', maxPrice: '', bedrooms: '', furnished: '', nearMe: false };

/** Homes & Spaces: places for rent, short-let, sale, lease or hire, with filters and a map. */
export default function ListingsScreen({ navigation, route }: any) {
    const agentId: string | undefined = route?.params?.agentId;
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const userRole = useAuthStore(s => s.userRole);

    const [filters, setFilters] = useState<Filters>(EMPTY);
    const [draft, setDraft] = useState<Filters>(EMPTY);
    const [q, setQ] = useState('');
    const [listings, setListings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);
    const [mapMode, setMapMode] = useState(false);
    const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

    const load = useCallback(async () => {
        try {
            const params: Record<string, any> = {};
            if (filters.purpose) params.purpose = filters.purpose;
            if (filters.type) params.type = filters.type;
            if (filters.state) params.state = filters.state;
            if (filters.furnished) params.furnished = filters.furnished;
            if (filters.minPrice) params.minPrice = filters.minPrice.replace(/\D/g, '');
            if (filters.maxPrice) params.maxPrice = filters.maxPrice.replace(/\D/g, '');
            if (filters.bedrooms) params.bedrooms = filters.bedrooms;
            if (q.trim()) params.q = q.trim();
            if (filters.nearMe && coords) { params.latitude = coords.latitude; params.longitude = coords.longitude; }
            const res = agentId ? await listingAPI.byAgent(agentId) : await listingAPI.list(params);
            setListings(res.data?.listings || []);
        } catch {
            // keep what is shown
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [filters, q, coords]);

    useEffect(() => { load(); }, [filters, coords]);
    useEffect(() => { if (route?.params?.agentName) navigation.setOptions({ title: `${route.params.agentName}'s listings` }); }, [route?.params?.agentName]);

    const askLocation = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return false;
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            return true;
        } catch {
            return false;
        }
    };

    const activeCount = Object.entries(filters).filter(([k, v]) => k !== 'purpose' && Boolean(v)).length;

    const renderCard = ({ item: l }: { item: any }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('ListingDetail', { listingId: l.id })}
            accessibilityRole="button"
            accessibilityLabel={`${l.title}, ${priceLabel(l.price, l.pricePeriod)}, ${l.area}, ${l.state}`}
        >
            <View>
                {l.photos?.[0] ? <Image source={{ uri: l.photos[0] }} style={styles.photo} /> : <View style={[styles.photo, styles.photoEmpty]}><Ionicons name="home-outline" size={36} color={colors.textTertiary} /></View>}
                <View style={styles.purposePill}><Text style={styles.purposeText}>{labelOf(LISTING_PURPOSES, l.purpose)}</Text></View>
                {l.photos?.length > 1 ? (
                    <View style={styles.countPill}>
                        <Ionicons name="images-outline" size={12} color="#FFFFFF" />
                        <Text style={styles.countText}>{l.photos.length}</Text>
                    </View>
                ) : null}
            </View>
            <View style={styles.cardBody}>
                <Text style={styles.price}>{priceLabel(l.price, l.pricePeriod)}</Text>
                <Text style={styles.title} numberOfLines={2}>{l.title}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                    <Ionicons name="location-outline" size={12} color={colors.textSecondary} /> {l.area}{l.city ? `, ${l.city}` : ''} · {l.state}
                    {l.distanceMeters != null && Number.isFinite(l.distanceMeters) ? ` · ${(l.distanceMeters / 1000).toFixed(1)} km` : ''}
                </Text>
                <View style={styles.facts}>
                    <Text style={styles.fact}>{labelOf(PROPERTY_TYPES, l.propertyType)}</Text>
                    {l.bedrooms != null ? <Text style={styles.fact}>{l.bedrooms} bed</Text> : null}
                    {l.bathrooms != null ? <Text style={styles.fact}>{l.bathrooms} bath</Text> : null}
                    {l.furnished ? <Text style={styles.fact}>{labelOf(FURNISHED_OPTIONS, l.furnished)}</Text> : null}
                </View>
                {l.agent ? (
                    <View style={styles.agentRow}>
                        <Text style={styles.agentName} numberOfLines={1}>{l.agent.name}</Text>
                        {l.agent.isVerified ? <VerificationBadgeInline isVerified size={13} /> : <Text style={styles.unverified}>Unverified agent</Text>}
                    </View>
                ) : null}
            </View>
        </TouchableOpacity>
    );

    const withPins = listings.filter(l => l.approxLocation);
    const region = withPins[0]?.approxLocation || coords || { latitude: 6.5244, longitude: 3.3792 };

    return (
        <View style={styles.container}>
            {!agentId ? (<View style={styles.top}>
                <View style={styles.searchRow}>
                    <View style={styles.search}>
                        <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Area, estate or keyword"
                            placeholderTextColor={colors.textTertiary}
                            value={q}
                            onChangeText={setQ}
                            returnKeyType="search"
                            onSubmitEditing={() => load()}
                        />
                    </View>
                    <TouchableOpacity style={styles.iconButton} onPress={() => { setDraft(filters); setFilterOpen(true); }} accessibilityRole="button" accessibilityLabel={`Filters${activeCount ? `, ${activeCount} on` : ''}`}>
                        <Ionicons name="options-outline" size={20} color={activeCount ? colors.primary : colors.textPrimary} />
                        {activeCount ? <View style={styles.dot} /> : null}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconButton} onPress={() => setMapMode(m => !m)} accessibilityRole="button" accessibilityLabel={mapMode ? 'Show list' : 'Show map'}>
                        <Ionicons name={mapMode ? 'list-outline' : 'map-outline'} size={20} color={colors.textPrimary} />
                    </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {[{ key: '', label: 'All' }, ...LISTING_PURPOSES].map(p => (
                        <TouchableOpacity key={p.key || 'all'} style={[styles.chip, filters.purpose === p.key && styles.chipActive]} onPress={() => setFilters(f => ({ ...f, purpose: p.key }))} accessibilityRole="button" accessibilityState={{ selected: filters.purpose === p.key }}>
                            <Text style={[styles.chipText, filters.purpose === p.key && styles.chipTextActive]}>{p.label}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <View style={styles.safety}>
                    <Ionicons name="shield-checkmark-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.safetyText}>Never pay before inspecting. Pointer never asks you to pay an agent.</Text>
                </View>
            </View>) : null}

            {loading ? (
                <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
            ) : mapMode ? (
                <MapView style={{ flex: 1 }} initialRegion={{ ...region, latitudeDelta: 0.2, longitudeDelta: 0.2 }} showsUserLocation>
                    {withPins.map(l => (
                        <Marker key={l.id} coordinate={l.approxLocation} title={priceLabel(l.price, l.pricePeriod)} description={l.title}>
                            <Callout onPress={() => navigation.navigate('ListingDetail', { listingId: l.id })}>
                                <View style={{ maxWidth: 220 }}>
                                    <Text style={{ fontWeight: '700' }}>{priceLabel(l.price, l.pricePeriod)}</Text>
                                    <Text numberOfLines={2}>{l.title}</Text>
                                    <Text style={{ color: colors.primary, marginTop: 4 }}>Tap for details</Text>
                                </View>
                            </Callout>
                        </Marker>
                    ))}
                </MapView>
            ) : (
                <FlashList
                    data={listings}
                    keyExtractor={l => l.id}
                    renderItem={renderCard}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.primary]} tintColor={colors.primary} />}
                    contentContainerStyle={{ paddingBottom: 100, paddingTop: SPACING.sm }}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="home-outline" size={44} color={colors.textTertiary} />
                            <Text style={styles.emptyTitle}>No places match</Text>
                            <Text style={styles.emptyText}>Try another area, price range or fewer filters.</Text>
                        </View>
                    }
                />
            )}

            {userRole === 'vendor' && !agentId ? (
                <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('ListingForm')} accessibilityRole="button" accessibilityLabel="List a place">
                    <Ionicons name="add" size={22} color={colors.textInverse} />
                    <Text style={styles.fabText}>List a place</Text>
                </TouchableOpacity>
            ) : null}

            {/* Filters */}
            <Modal visible={filterOpen} animationType="slide" transparent onRequestClose={() => setFilterOpen(false)}>
                <View style={styles.modalWrap}>
                    <View style={styles.modal}>
                        <View style={styles.modalHead}>
                            <Text style={styles.modalTitle}>Filters</Text>
                            <TouchableOpacity onPress={() => setFilterOpen(false)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
                                <Ionicons name="close" size={24} color={colors.textPrimary} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={{ maxHeight: 460 }}>
                            <Text style={styles.label}>Property type</Text>
                            <View style={styles.wrap}>
                                {[{ key: '', label: 'Any' }, ...PROPERTY_TYPES].map(t => (
                                    <TouchableOpacity key={t.key || 'any'} style={[styles.chip, draft.type === t.key && styles.chipActive]} onPress={() => setDraft(d => ({ ...d, type: t.key }))}>
                                        <Text style={[styles.chipText, draft.type === t.key && styles.chipTextActive]}>{t.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <Text style={styles.label}>State</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                                {['', ...NIGERIAN_STATES].map(s => (
                                    <TouchableOpacity key={s || 'any'} style={[styles.chip, draft.state === s && styles.chipActive]} onPress={() => setDraft(d => ({ ...d, state: s }))}>
                                        <Text style={[styles.chipText, draft.state === s && styles.chipTextActive]}>{s || 'Any'}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                            <Text style={styles.label}>Price (₦)</Text>
                            <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                                <TextInput style={[styles.input, { flex: 1 }]} keyboardType="number-pad" placeholder="Min" placeholderTextColor={colors.textTertiary} value={draft.minPrice} onChangeText={t => setDraft(d => ({ ...d, minPrice: t }))} />
                                <TextInput style={[styles.input, { flex: 1 }]} keyboardType="number-pad" placeholder="Max" placeholderTextColor={colors.textTertiary} value={draft.maxPrice} onChangeText={t => setDraft(d => ({ ...d, maxPrice: t }))} />
                            </View>
                            <Text style={styles.label}>Bedrooms (at least)</Text>
                            <View style={styles.wrap}>
                                {['', '1', '2', '3', '4', '5'].map(b => (
                                    <TouchableOpacity key={b || 'any'} style={[styles.chip, draft.bedrooms === b && styles.chipActive]} onPress={() => setDraft(d => ({ ...d, bedrooms: b }))}>
                                        <Text style={[styles.chipText, draft.bedrooms === b && styles.chipTextActive]}>{b ? `${b}+` : 'Any'}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <Text style={styles.label}>Furnishing</Text>
                            <View style={styles.wrap}>
                                {[{ key: '', label: 'Any' }, ...FURNISHED_OPTIONS].map(f => (
                                    <TouchableOpacity key={f.key || 'any'} style={[styles.chip, draft.furnished === f.key && styles.chipActive]} onPress={() => setDraft(d => ({ ...d, furnished: f.key }))}>
                                        <Text style={[styles.chipText, draft.furnished === f.key && styles.chipTextActive]}>{f.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <TouchableOpacity
                                style={[styles.chip, { alignSelf: 'flex-start', marginTop: SPACING.md }, draft.nearMe && styles.chipActive]}
                                onPress={async () => {
                                    if (!draft.nearMe && !coords && !(await askLocation())) return;
                                    setDraft(d => ({ ...d, nearMe: !d.nearMe }));
                                }}
                            >
                                <Text style={[styles.chipText, draft.nearMe && styles.chipTextActive]}>📍 Nearest to me first</Text>
                            </TouchableOpacity>
                        </ScrollView>
                        <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
                            <TouchableOpacity style={[styles.button, styles.buttonOutline]} onPress={() => setDraft({ ...EMPTY, purpose: draft.purpose })}>
                                <Text style={[styles.buttonText, { color: colors.textPrimary }]}>Clear</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.button, styles.buttonFilled, { flex: 1 }]} onPress={() => { setFilters(draft); setFilterOpen(false); }}>
                                <Text style={[styles.buttonText, { color: colors.textInverse }]}>Show results</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    top: { backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingTop: SPACING.sm },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.md },
    search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.md, minHeight: 42, borderRadius: BORDER_RADIUS.md, backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border },
    searchInput: { flex: 1, fontSize: FONT_SIZES.sm, color: colors.textPrimary, paddingVertical: 6 },
    iconButton: { width: 42, height: 42, borderRadius: BORDER_RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border },
    dot: { position: 'absolute', top: 7, right: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
    chips: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: 6 },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: colors.textSecondary },
    chipTextActive: { color: colors.textInverse },
    safety: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
    safetyText: { flex: 1, fontSize: 12, color: colors.textSecondary },
    card: { marginHorizontal: SPACING.md, marginBottom: SPACING.md, backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', maxWidth: CONTENT_MAX_WIDTH, width: '100%', alignSelf: 'center' },
    photo: { width: '100%', aspectRatio: 16 / 10, backgroundColor: colors.surfaceLight },
    photoEmpty: { alignItems: 'center', justifyContent: 'center' },
    purposePill: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    purposeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
    countPill: { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
    countText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
    cardBody: { padding: SPACING.md, gap: 4 },
    price: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: colors.textPrimary },
    title: { fontSize: FONT_SIZES.md, fontWeight: '600', color: colors.textPrimary },
    meta: { fontSize: 13, color: colors.textSecondary },
    facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    fact: { fontSize: 12, color: colors.textSecondary, backgroundColor: colors.surfaceLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
    agentRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    agentName: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
    unverified: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
    empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: SPACING.xl, gap: SPACING.sm },
    emptyTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: colors.textPrimary },
    emptyText: { fontSize: FONT_SIZES.sm, color: colors.textSecondary, textAlign: 'center' },
    fab: { position: 'absolute', right: SPACING.md, bottom: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 18, minHeight: 48, borderRadius: 24, elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
    fabText: { color: colors.textInverse, fontWeight: '800', fontSize: FONT_SIZES.sm },
    modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
    modal: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.lg, paddingBottom: SPACING.xl, maxWidth: 640, width: '100%', alignSelf: 'center' },
    modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
    modalTitle: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: colors.textPrimary },
    label: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: colors.textSecondary, marginTop: SPACING.md, marginBottom: 6 },
    input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceLight, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 10, fontSize: FONT_SIZES.md, color: colors.textPrimary },
    button: { minHeight: 46, borderRadius: 23, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
    buttonFilled: { backgroundColor: colors.primary },
    buttonOutline: { borderWidth: 1, borderColor: colors.border },
    buttonText: { fontSize: FONT_SIZES.sm, fontWeight: '800' },
});
