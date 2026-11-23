import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
    Alert,
    useWindowDimensions,
    RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Image } from '../components/CachedImage';
import { useTheme } from '../context/ThemeContext';
import { listingAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { openChat } from '../navigation/openChat';
import ReportModal from '../components/ReportModal';
import CallOptionModal from '../components/CallOptionModal';
import { VerificationBadgeInline } from '../components/VerificationBadge';
import { SPACING, FONT_SIZES, BORDER_RADIUS, CONTENT_MAX_WIDTH } from '../constants/theme';
import { PLACEHOLDER_AVATARS } from '../assets';
import {
    LISTING_PURPOSES, PROPERTY_TYPES, FURNISHED_OPTIONS, AMENITIES, FEE_FIELDS, PRICE_PERIODS,
    labelOf, naira, priceLabel,
} from '../constants/listings';

function VideoTour({ uri }: { uri: string }) {
    const player = useVideoPlayer(uri, p => { p.loop = false; });
    return <VideoView player={player} style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 12 }} nativeControls contentFit="contain" />;
}

/** One place: photos, price and move-in cost, details, and Enquire / Call. The agent also manages it here. */
export default function ListingDetailScreen({ route, navigation }: any) {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const { width } = useWindowDimensions();
    const user = useAuthStore(s => s.user);
    const id: string = route.params?.listingId;

    const [listing, setListing] = useState<any>(null);
    const [isOwner, setIsOwner] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [photoIndex, setPhotoIndex] = useState(0);
    const [reportOpen, setReportOpen] = useState(false);
    const [callOpen, setCallOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await listingAPI.get(id);
            setListing(res.data.listing);
            setIsOwner(Boolean(res.data.isOwner));
        } catch (e: any) {
            if (e?.response?.status === 404) {
                Alert.alert('Listing unavailable', 'It may have been taken or removed.');
                navigation.goBack();
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [id, navigation]);

    useEffect(() => { load(); }, [load]);

    if (loading || !listing) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

    const l = listing;
    const agent = l.agent;
    const photoWidth = Math.min(width, CONTENT_MAX_WIDTH);
    const fees = FEE_FIELDS.filter(f => l.fees?.[f.key]);
    const periodLabel = PRICE_PERIODS.find(p => p.key === l.pricePeriod)?.label || '';

    const enquire = () => {
        if (!agent) return;
        if (!user) return Alert.alert('Sign in needed', 'Sign in to message the agent.');
        openChat(navigation, {
            otherUserId: agent.uid,
            otherUserName: agent.name,
            otherUserImage: agent.avatar,
            receiverId: agent.uid,
            receiverName: agent.name,
            receiverImage: agent.avatar,
            initialMessage: `Hello, I'm interested in "${l.title}" (${priceLabel(l.price, l.pricePeriod)}, ${l.area}). Is it still available?`,
        });
    };

    const act = async (fn: () => Promise<any>, ok?: string) => {
        if (busy) return;
        setBusy(true);
        try {
            await fn();
            if (ok) Alert.alert(ok);
            await load();
        } catch (e: any) {
            Alert.alert('Not possible', e?.response?.data?.error || 'Please try again.');
        } finally {
            setBusy(false);
        }
    };

    const daysLeft = Math.ceil((new Date(l.expiresAt).getTime() - Date.now()) / 86400000);

    return (
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={{ paddingBottom: isOwner ? SPACING.xl : 110 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.primary]} tintColor={colors.primary} />}
            >
                <View style={{ width: photoWidth, alignSelf: 'center' }}>
                    {l.photos?.length ? (
                        <ScrollView
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            onMomentumScrollEnd={e => setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / photoWidth))}
                        >
                            {l.photos.map((p: string, i: number) => (
                                <Image key={p + i} source={{ uri: p }} style={{ width: photoWidth, aspectRatio: 4 / 3, backgroundColor: colors.surfaceLight }} accessibilityLabel={`Photo ${i + 1} of ${l.photos.length}`} />
                            ))}
                        </ScrollView>
                    ) : null}
                    {l.photos?.length > 1 ? (
                        <View style={styles.photoCount}><Text style={styles.photoCountText}>{photoIndex + 1} / {l.photos.length}</Text></View>
                    ) : null}
                </View>

                <View style={styles.column}>
                    {l.status !== 'available' || l.expired ? (
                        <View style={[styles.banner, { borderColor: l.status === 'taken' ? colors.error : colors.border }]}>
                            <Text style={[styles.bannerText, l.status === 'taken' && { color: colors.error }]}>
                                {l.status === 'taken' ? 'This place has been taken.' : l.status === 'paused' ? 'Paused: hidden from search.' : 'Expired: hidden from search until renewed.'}
                            </Text>
                        </View>
                    ) : null}

                    <View style={styles.tags}>
                        <Text style={styles.tag}>{labelOf(LISTING_PURPOSES, l.purpose)}</Text>
                        <Text style={styles.tag}>{labelOf(PROPERTY_TYPES, l.propertyType)}</Text>
                    </View>
                    <Text style={styles.price}>{naira(l.price)} <Text style={styles.period}>{periodLabel}</Text></Text>
                    <Text style={styles.title} accessibilityRole="header">{l.title}</Text>
                    <Text style={styles.location}>
                        <Ionicons name="location-outline" size={14} color={colors.textSecondary} /> {l.area}{l.city ? `, ${l.city}` : ''}, {l.state}
                    </Text>
                    {isOwner && l.exactAddress ? (
                        <Text style={styles.privateNote}>🔒 Exact address (only you see this): {l.exactAddress}</Text>
                    ) : !isOwner ? (
                        <Text style={styles.privateNote}>The exact address is shared by the agent when you enquire.</Text>
                    ) : null}

                    {/* Move-in cost */}
                    {fees.length ? (
                        <View style={styles.box}>
                            <Text style={styles.boxTitle}>Total to move in</Text>
                            <Row label={`Price (${periodLabel})`} value={naira(l.price)} styles={styles} />
                            {fees.map(f => <Row key={f.key} label={f.label} value={naira(l.fees[f.key])} styles={styles} />)}
                            <View style={styles.divider} />
                            <Row label="Total" value={naira(l.totalMoveIn)} styles={styles} bold />
                        </View>
                    ) : null}

                    {/* Facts */}
                    <View style={styles.factsGrid}>
                        {l.bedrooms != null ? <Fact icon="bed-outline" label={`${l.bedrooms} bedroom${l.bedrooms === 1 ? '' : 's'}`} styles={styles} colors={colors} /> : null}
                        {l.bathrooms != null ? <Fact icon="water-outline" label={`${l.bathrooms} bathroom${l.bathrooms === 1 ? '' : 's'}`} styles={styles} colors={colors} /> : null}
                        {l.toilets != null ? <Fact icon="male-female-outline" label={`${l.toilets} toilet${l.toilets === 1 ? '' : 's'}`} styles={styles} colors={colors} /> : null}
                        {l.furnished ? <Fact icon="cube-outline" label={labelOf(FURNISHED_OPTIONS, l.furnished)} styles={styles} colors={colors} /> : null}
                        {l.availableFrom ? <Fact icon="calendar-outline" label={`From ${new Date(l.availableFrom).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`} styles={styles} colors={colors} /> : null}
                    </View>

                    {l.description ? (
                        <>
                            <Text style={styles.sectionTitle}>About this place</Text>
                            <Text style={styles.body}>{l.description}</Text>
                        </>
                    ) : null}

                    {l.amenities?.length ? (
                        <>
                            <Text style={styles.sectionTitle}>Amenities</Text>
                            <View style={styles.amenities}>
                                {l.amenities.map((a: string) => {
                                    const def = AMENITIES.find(x => x.key === a);
                                    return (
                                        <View key={a} style={styles.amenity}>
                                            <Ionicons name={(def?.icon || 'checkmark-outline') as any} size={15} color={colors.primary} />
                                            <Text style={styles.amenityText}>{def?.label || a}</Text>
                                        </View>
                                    );
                                })}
                            </View>
                        </>
                    ) : null}

                    {l.videoUrl ? (
                        <>
                            <Text style={styles.sectionTitle}>Video tour</Text>
                            <VideoTour uri={l.videoUrl} />
                        </>
                    ) : null}

                    {/* Agent */}
                    {agent && !isOwner ? (
                        <TouchableOpacity style={styles.agent} onPress={() => navigation.navigate('VendorDetails', { vendorId: agent.uid })} accessibilityRole="button" accessibilityLabel={`Agent ${agent.name}. Open profile`}>
                            <Image source={agent.avatar ? { uri: agent.avatar } : PLACEHOLDER_AVATARS.vendor} style={styles.agentAvatar} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={styles.agentName} numberOfLines={1}>{agent.name}</Text>
                                    <VerificationBadgeInline isVerified={Boolean(agent.isVerified)} size={15} />
                                </View>
                                <Text style={styles.agentSub}>{agent.isVerified ? 'ID-verified agent' : 'Unverified agent: Pointer has not checked their ID'}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                        </TouchableOpacity>
                    ) : null}

                    <View style={styles.safety}>
                        <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
                        <Text style={styles.safetyText}>
                            Stay safe: inspect the place in person before paying anything, and never pay "inspection" or "booking" fees to someone you haven't met. Pointer never asks you to pay an agent.
                        </Text>
                    </View>

                    {!isOwner ? (
                        <TouchableOpacity onPress={() => setReportOpen(true)} style={styles.reportLink} accessibilityRole="button">
                            <Ionicons name="flag-outline" size={15} color={colors.textSecondary} />
                            <Text style={styles.reportText}>Report this listing</Text>
                        </TouchableOpacity>
                    ) : null}

                    {/* Agent's controls */}
                    {isOwner ? (
                        <View style={styles.box}>
                            <Text style={styles.boxTitle}>Manage</Text>
                            <Text style={styles.manageNote}>
                                {l.expired ? 'Expired. Renew to show it again.' : `Visible for ${daysLeft} more day${daysLeft === 1 ? '' : 's'}.`}
                            </Text>
                            <View style={styles.manageRow}>
                                <ManageButton label="Edit" icon="create-outline" onPress={() => navigation.navigate('ListingForm', { listingId: l.id })} styles={styles} colors={colors} />
                                <ManageButton label="Renew 30 days" icon="refresh-outline" onPress={() => act(() => listingAPI.renew(l.id), 'Renewed for 30 days')} styles={styles} colors={colors} />
                                {l.status !== 'taken' ? (
                                    <ManageButton label="Mark as taken" icon="checkmark-done-outline" onPress={() => act(() => listingAPI.setStatus(l.id, 'taken'))} styles={styles} colors={colors} />
                                ) : (
                                    <ManageButton label="Available again" icon="home-outline" onPress={() => act(() => listingAPI.setStatus(l.id, 'available'))} styles={styles} colors={colors} />
                                )}
                                {l.status === 'available' ? (
                                    <ManageButton label="Pause" icon="pause-outline" onPress={() => act(() => listingAPI.setStatus(l.id, 'paused'))} styles={styles} colors={colors} />
                                ) : l.status === 'paused' ? (
                                    <ManageButton label="Resume" icon="play-outline" onPress={() => act(() => listingAPI.setStatus(l.id, 'available'))} styles={styles} colors={colors} />
                                ) : null}
                                <ManageButton
                                    label="Delete"
                                    icon="trash-outline"
                                    danger
                                    onPress={() => Alert.alert('Delete listing?', 'This cannot be undone.', [
                                        { text: 'Cancel', style: 'cancel' },
                                        { text: 'Delete', style: 'destructive', onPress: () => act(async () => { await listingAPI.remove(l.id); navigation.goBack(); }) },
                                    ])}
                                    styles={styles}
                                    colors={colors}
                                />
                            </View>
                        </View>
                    ) : null}
                </View>
            </ScrollView>

            {!isOwner && agent && l.status === 'available' ? (
                <View style={styles.bottomBar}>
                    <TouchableOpacity style={[styles.cta, styles.ctaOutline]} onPress={() => setCallOpen(true)} accessibilityRole="button" accessibilityLabel="Call the agent">
                        <Ionicons name="call-outline" size={18} color={colors.textPrimary} />
                        <Text style={[styles.ctaText, { color: colors.textPrimary }]}>Call</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.cta, styles.ctaFilled]} onPress={enquire} accessibilityRole="button" accessibilityLabel="Message the agent">
                        <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.textInverse} />
                        <Text style={[styles.ctaText, { color: colors.textInverse }]}>Enquire</Text>
                    </TouchableOpacity>
                </View>
            ) : null}

            <ReportModal visible={reportOpen} onClose={() => setReportOpen(false)} targetType="listing" targetId={l.id} targetUserId={agent?.uid} targetTitle={l.title} />
            {agent ? (
                <CallOptionModal
                    visible={callOpen}
                    onClose={() => setCallOpen(false)}
                    vendor={{ id: agent.uid, uid: agent.uid, businessName: agent.name, businessImage: agent.avatar, isVerified: agent.isVerified, role: 'vendor' }}
                    navigation={navigation}
                />
            ) : null}
        </View>
    );
}

function Row({ label, value, styles, bold }: any) {
    return (
        <View style={styles.row}>
            <Text style={[styles.rowLabel, bold && styles.rowBold]}>{label}</Text>
            <Text style={[styles.rowValue, bold && styles.rowBold]}>{value}</Text>
        </View>
    );
}

function Fact({ icon, label, styles, colors }: any) {
    return (
        <View style={styles.fact}>
            <Ionicons name={icon} size={16} color={colors.primary} />
            <Text style={styles.factText}>{label}</Text>
        </View>
    );
}

function ManageButton({ label, icon, onPress, danger, styles, colors }: any) {
    return (
        <TouchableOpacity style={styles.manageButton} onPress={onPress} accessibilityRole="button">
            <Ionicons name={icon} size={16} color={danger ? colors.error : colors.textPrimary} />
            <Text style={[styles.manageText, danger && { color: colors.error }]}>{label}</Text>
        </TouchableOpacity>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    column: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', padding: SPACING.md },
    photoCount: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
    photoCountText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
    banner: { borderWidth: 1, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.sm },
    bannerText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    tags: { flexDirection: 'row', gap: 6, marginBottom: 6 },
    tag: { fontSize: 12, fontWeight: '700', color: colors.primary, backgroundColor: `${colors.primary}1A`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
    price: { fontSize: 26, fontWeight: '800', color: colors.textPrimary },
    period: { fontSize: FONT_SIZES.md, fontWeight: '600', color: colors.textSecondary },
    title: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: colors.textPrimary, marginTop: 4 },
    location: { fontSize: FONT_SIZES.sm, color: colors.textSecondary, marginTop: 4 },
    privateNote: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontStyle: 'italic' },
    box: { marginTop: SPACING.md, padding: SPACING.md, borderRadius: BORDER_RADIUS.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 6 },
    boxTitle: { fontSize: FONT_SIZES.md, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md },
    rowLabel: { fontSize: FONT_SIZES.sm, color: colors.textSecondary, flexShrink: 1 },
    rowValue: { fontSize: FONT_SIZES.sm, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
    rowBold: { fontWeight: '800', color: colors.textPrimary },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 2 },
    factsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: SPACING.md },
    fact: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.surfaceLight },
    factText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
    sectionTitle: { fontSize: FONT_SIZES.md, fontWeight: '800', color: colors.textPrimary, marginTop: SPACING.lg, marginBottom: 6 },
    body: { fontSize: FONT_SIZES.md, color: colors.textPrimary, lineHeight: 22 },
    amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    amenity: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
    amenityText: { fontSize: 13, color: colors.textPrimary },
    agent: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.lg, padding: SPACING.md, borderRadius: BORDER_RADIUS.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    agentAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceLight },
    agentName: { fontSize: FONT_SIZES.md, fontWeight: '800', color: colors.textPrimary, flexShrink: 1 },
    agentSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    safety: { flexDirection: 'row', gap: 8, marginTop: SPACING.md, padding: SPACING.md, borderRadius: BORDER_RADIUS.md, backgroundColor: `${colors.primary}12` },
    safetyText: { flex: 1, fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
    reportLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44, marginTop: SPACING.sm },
    reportText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
    manageNote: { fontSize: 13, color: colors.textSecondary },
    manageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    manageButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
    manageText: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
    bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: SPACING.sm, padding: SPACING.md, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    cta: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: 24 },
    ctaFilled: { backgroundColor: colors.primary },
    ctaOutline: { borderWidth: 1, borderColor: colors.border },
    ctaText: { fontSize: FONT_SIZES.md, fontWeight: '800' },
});
