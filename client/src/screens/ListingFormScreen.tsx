import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ScrollView,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Image } from '../components/CachedImage';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../store/authStore';
import { listingAPI } from '../services/api';
import { uploadImageViaBackend } from '../utils/backendUpload';
import { uploadVideo, MAX_VIDEO_SECONDS } from '../utils/videoUpload';
import { SPACING, FONT_SIZES, BORDER_RADIUS, FORM_MAX_WIDTH } from '../constants/theme';
import {
    LISTING_PURPOSES, PROPERTY_TYPES, PRICE_PERIODS, FURNISHED_OPTIONS, AMENITIES, FEE_FIELDS, NIGERIAN_STATES, naira,
} from '../constants/listings';

const MAX_PHOTOS = 15;
const digits = (s: string) => s.replace(/\D/g, '');
const withCommas = (s: string) => (digits(s) ? Number(digits(s)).toLocaleString('en-NG') : '');

/** Create or edit a property listing. */
export default function ListingFormScreen({ route, navigation }: any) {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const user = useAuthStore(s => s.user);
    const editingId: string | undefined = route.params?.listingId;

    const [loading, setLoading] = useState(Boolean(editingId));
    const [saving, setSaving] = useState(false);
    const [progress, setProgress] = useState('');

    const [purpose, setPurpose] = useState('rent');
    const [propertyType, setPropertyType] = useState('flat');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [pricePeriod, setPricePeriod] = useState('year');
    const [fees, setFees] = useState<Record<string, string>>({});
    const [bedrooms, setBedrooms] = useState('');
    const [bathrooms, setBathrooms] = useState('');
    const [toilets, setToilets] = useState('');
    const [furnished, setFurnished] = useState('');
    const [amenities, setAmenities] = useState<string[]>([]);
    const [area, setArea] = useState('');
    const [city, setCity] = useState('');
    const [stateName, setStateName] = useState('');
    const [exactAddress, setExactAddress] = useState('');
    const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
    const [availableFrom, setAvailableFrom] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [video, setVideo] = useState<{ uri: string; size?: number | null; mime?: string | null } | null>(null);
    const [existingVideo, setExistingVideo] = useState<string | null>(null);

    useEffect(() => {
        navigation.setOptions({ title: editingId ? 'Edit listing' : 'List a place' });
        if (!editingId) return;
        listingAPI.get(editingId).then(res => {
            const l = res.data.listing;
            setPurpose(l.purpose); setPropertyType(l.propertyType); setTitle(l.title); setDescription(l.description || '');
            setPrice(withCommas(String(l.price))); setPricePeriod(l.pricePeriod);
            setFees(Object.fromEntries(Object.entries(l.fees || {}).map(([k, v]) => [k, withCommas(String(v))])));
            setBedrooms(l.bedrooms != null ? String(l.bedrooms) : ''); setBathrooms(l.bathrooms != null ? String(l.bathrooms) : ''); setToilets(l.toilets != null ? String(l.toilets) : '');
            setFurnished(l.furnished || ''); setAmenities(l.amenities || []);
            setArea(l.area); setCity(l.city || ''); setStateName(l.state); setExactAddress(l.exactAddress || '');
            setLocation(l.approxLocation || null); setAvailableFrom(l.availableFrom || '');
            setPhotos(l.photos || []); setExistingVideo(l.videoUrl || null);
        }).catch(() => {
            Alert.alert('Could not load the listing');
            navigation.goBack();
        }).finally(() => setLoading(false));
    }, [editingId]);

    // Sales are one-off; short-lets are usually per night
    useEffect(() => {
        if (purpose === 'sale') setPricePeriod('once');
        else if (purpose === 'short-let' && ['year', 'once'].includes(pricePeriod)) setPricePeriod('night');
        else if (pricePeriod === 'once') setPricePeriod('year');
    }, [purpose]);

    const pickPhotos = async () => {
        const room = MAX_PHOTOS - photos.length;
        if (room <= 0) return Alert.alert(`Up to ${MAX_PHOTOS} photos`);
        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: room, quality: 0.8 });
        if (!res.canceled) setPhotos(p => [...p, ...res.assets.map(a => a.uri)].slice(0, MAX_PHOTOS));
    };

    const pickVideo = async () => {
        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1, videoMaxDuration: MAX_VIDEO_SECONDS });
        const a = res.canceled ? null : res.assets[0];
        if (!a) return;
        if (a.duration && a.duration / 1000 > MAX_VIDEO_SECONDS + 1) return Alert.alert('Video too long', `Choose a tour of up to ${MAX_VIDEO_SECONDS} seconds.`);
        setVideo({ uri: a.uri, size: a.fileSize, mime: a.mimeType });
    };

    const useMyLocation = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return Alert.alert('Location not allowed', 'You can still list the place; it just won\'t appear on the map.');
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        } catch {
            Alert.alert('Could not get your location');
        }
    };

    const save = async () => {
        if (!digits(price)) return Alert.alert('Price needed', 'Enter the price.');
        if (photos.length === 0) return Alert.alert('Photos needed', 'Add at least one photo of the place.');
        if (availableFrom && isNaN(new Date(availableFrom).getTime())) return Alert.alert('Date', 'Use the format YYYY-MM-DD, e.g. 2026-12-01.');
        setSaving(true);
        try {
            const uploaded: string[] = [];
            for (let i = 0; i < photos.length; i++) {
                const p = photos[i];
                if (/^https:\/\//.test(p)) { uploaded.push(p); continue; }
                setProgress(`Uploading photo ${i + 1} of ${photos.length}…`);
                uploaded.push(await uploadImageViaBackend(p, 'post', user?.uid));
            }
            let videoUrl: string | null | undefined = undefined;
            if (video) {
                setProgress('Uploading video tour… 0%');
                videoUrl = await uploadVideo(video.uri, { size: video.size, mime: video.mime, onProgress: f => setProgress(`Uploading video tour… ${Math.round(f * 100)}%`) });
            } else if (editingId && !existingVideo) {
                videoUrl = null;
            }
            setProgress('Saving…');
            const body: Record<string, any> = {
                purpose, propertyType, title, description,
                price: Number(digits(price)), pricePeriod,
                fees: Object.fromEntries(FEE_FIELDS.map(f => [f.key, Number(digits(fees[f.key] || '')) || 0])),
                bedrooms: bedrooms === '' ? null : Number(bedrooms),
                bathrooms: bathrooms === '' ? null : Number(bathrooms),
                toilets: toilets === '' ? null : Number(toilets),
                furnished: furnished || null,
                amenities, area, city, state: stateName, exactAddress,
                location, availableFrom: availableFrom || null, photos: uploaded,
            };
            if (videoUrl !== undefined) body.videoUrl = videoUrl;
            if (editingId) {
                await listingAPI.update(editingId, body);
                navigation.goBack();
            } else {
                const res = await listingAPI.create(body);
                navigation.replace('ListingDetail', { listingId: res.data.listing.id });
            }
        } catch (e: any) {
            Alert.alert('Could not save', e?.response?.data?.error || e?.message || 'Please try again.');
        } finally {
            setSaving(false);
            setProgress('');
        }
    };

    if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

    const Chips = ({ options, value, onChange }: { options: readonly { key: string; label: string }[]; value: string; onChange: (k: string) => void }) => (
        <View style={styles.wrap}>
            {options.map(o => (
                <TouchableOpacity key={o.key} style={[styles.chip, value === o.key && styles.chipActive]} onPress={() => onChange(value === o.key ? '' : o.key)} accessibilityRole="button" accessibilityState={{ selected: value === o.key }}>
                    <Text style={[styles.chipText, value === o.key && styles.chipTextActive]}>{o.label}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
    const total = Number(digits(price) || 0) + FEE_FIELDS.reduce((s, f) => s + (Number(digits(fees[f.key] || '')) || 0), 0);

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <Text style={styles.label}>Photos ({photos.length}/{MAX_PHOTOS}) *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {photos.map((p, i) => (
                        <View key={p + i}>
                            <Image source={{ uri: p }} style={styles.thumb} />
                            <TouchableOpacity style={styles.remove} onPress={() => setPhotos(ps => ps.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`}>
                                <Ionicons name="close" size={14} color="#FFFFFF" />
                            </TouchableOpacity>
                            {i === 0 ? <Text style={styles.cover}>Cover</Text> : null}
                        </View>
                    ))}
                    {photos.length < MAX_PHOTOS ? (
                        <TouchableOpacity style={[styles.thumb, styles.addThumb]} onPress={pickPhotos} accessibilityRole="button" accessibilityLabel="Add photos">
                            <Ionicons name="camera-outline" size={24} color={colors.primary} />
                            <Text style={styles.addText}>Add</Text>
                        </TouchableOpacity>
                    ) : null}
                </ScrollView>

                <Text style={styles.label}>Video tour (optional, up to {MAX_VIDEO_SECONDS}s)</Text>
                {video || existingVideo ? (
                    <View style={styles.videoRow}>
                        <Ionicons name="videocam" size={18} color={colors.primary} />
                        <Text style={styles.videoText}>{video ? 'New video selected' : 'Video tour added'}</Text>
                        <TouchableOpacity onPress={() => { setVideo(null); setExistingVideo(null); }} accessibilityRole="button"><Text style={styles.link}>Remove</Text></TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.outlineButton} onPress={pickVideo} accessibilityRole="button">
                        <Ionicons name="videocam-outline" size={18} color={colors.textPrimary} />
                        <Text style={styles.outlineText}>Add a video tour</Text>
                    </TouchableOpacity>
                )}

                <Text style={styles.label}>This place is *</Text>
                <Chips options={LISTING_PURPOSES} value={purpose} onChange={k => k && setPurpose(k)} />
                <Text style={styles.label}>Property type *</Text>
                <Chips options={PROPERTY_TYPES} value={propertyType} onChange={k => k && setPropertyType(k)} />

                <Text style={styles.label}>Title *</Text>
                <TextInput style={styles.input} value={title} onChangeText={setTitle} maxLength={100} placeholder="e.g. 2 bedroom flat with parking, Lekki Phase 1" placeholderTextColor={colors.textTertiary} />

                <Text style={styles.label}>Price (₦) *</Text>
                <TextInput style={styles.input} value={price} onChangeText={t => setPrice(withCommas(t))} keyboardType="number-pad" placeholder="e.g. 2,500,000" placeholderTextColor={colors.textTertiary} />
                <Chips options={PRICE_PERIODS} value={pricePeriod} onChange={k => k && setPricePeriod(k)} />

                {purpose !== 'sale' ? (
                    <>
                        <Text style={styles.label}>One-off fees (optional)</Text>
                        {FEE_FIELDS.map(f => (
                            <View key={f.key} style={styles.feeRow}>
                                <Text style={styles.feeLabel}>{f.label}</Text>
                                <TextInput
                                    style={[styles.input, styles.feeInput]}
                                    value={fees[f.key] || ''}
                                    onChangeText={t => setFees(x => ({ ...x, [f.key]: withCommas(t) }))}
                                    keyboardType="number-pad"
                                    placeholder="0"
                                    placeholderTextColor={colors.textTertiary}
                                />
                            </View>
                        ))}
                        {total > 0 ? <Text style={styles.total}>Total to move in: {naira(total)}</Text> : null}
                    </>
                ) : null}

                <Text style={styles.label}>Rooms</Text>
                <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                    {[['Bedrooms', bedrooms, setBedrooms], ['Bathrooms', bathrooms, setBathrooms], ['Toilets', toilets, setToilets]].map(([lbl, val, set]: any) => (
                        <View key={lbl} style={{ flex: 1 }}>
                            <Text style={styles.small}>{lbl}</Text>
                            <TextInput style={styles.input} value={val} onChangeText={t => set(digits(t).slice(0, 2))} keyboardType="number-pad" placeholder="–" placeholderTextColor={colors.textTertiary} />
                        </View>
                    ))}
                </View>

                <Text style={styles.label}>Furnishing</Text>
                <Chips options={FURNISHED_OPTIONS} value={furnished} onChange={setFurnished} />

                <Text style={styles.label}>Amenities</Text>
                <View style={styles.wrap}>
                    {AMENITIES.map(a => {
                        const on = amenities.includes(a.key);
                        return (
                            <TouchableOpacity key={a.key} style={[styles.chip, on && styles.chipActive]} onPress={() => setAmenities(x => on ? x.filter(k => k !== a.key) : [...x, a.key])} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                                <Text style={[styles.chipText, on && styles.chipTextActive]}>{a.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <Text style={styles.label}>Description</Text>
                <TextInput style={[styles.input, { minHeight: 110, textAlignVertical: 'top' }]} value={description} onChangeText={setDescription} maxLength={3000} multiline placeholder="Condition, rules, nearby places, inspection times…" placeholderTextColor={colors.textTertiary} />

                <Text style={styles.label}>Area / estate *</Text>
                <TextInput style={styles.input} value={area} onChangeText={setArea} maxLength={80} placeholder="e.g. Lekki Phase 1" placeholderTextColor={colors.textTertiary} />
                <Text style={styles.label}>City / town</Text>
                <TextInput style={styles.input} value={city} onChangeText={setCity} maxLength={60} placeholder="e.g. Lagos" placeholderTextColor={colors.textTertiary} />
                <Text style={styles.label}>State *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {NIGERIAN_STATES.map(s => (
                        <TouchableOpacity key={s} style={[styles.chip, stateName === s && styles.chipActive]} onPress={() => setStateName(s)} accessibilityRole="button" accessibilityState={{ selected: stateName === s }}>
                            <Text style={[styles.chipText, stateName === s && styles.chipTextActive]}>{s}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                <Text style={styles.label}>Exact address (private)</Text>
                <TextInput style={styles.input} value={exactAddress} onChangeText={setExactAddress} maxLength={200} placeholder="Only you see this. Share it in chat when someone enquires." placeholderTextColor={colors.textTertiary} />

                <Text style={styles.label}>Map pin</Text>
                <TouchableOpacity style={styles.outlineButton} onPress={useMyLocation} accessibilityRole="button">
                    <Ionicons name={location ? 'checkmark-circle' : 'locate-outline'} size={18} color={location ? colors.success : colors.textPrimary} />
                    <Text style={styles.outlineText}>{location ? 'Pin set (shown to the public within about 1 km)' : "Use my current location (I'm at the property)"}</Text>
                </TouchableOpacity>

                <Text style={styles.label}>Available from (optional)</Text>
                <TextInput style={styles.input} value={availableFrom} onChangeText={setAvailableFrom} maxLength={10} placeholder="YYYY-MM-DD (leave empty if available now)" placeholderTextColor={colors.textTertiary} />

                <Text style={styles.note}>Listings stay visible for 30 days. You can renew, pause or mark them as taken any time.</Text>

                <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={save} disabled={saving} accessibilityRole="button">
                    {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.saveText}>{editingId ? 'Save changes' : 'Publish listing'}</Text>}
                </TouchableOpacity>
                {progress ? <Text style={styles.progress}>{progress}</Text> : null}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    content: { padding: SPACING.md, paddingBottom: 60, width: '100%', maxWidth: FORM_MAX_WIDTH, alignSelf: 'center' },
    label: { fontSize: FONT_SIZES.sm, fontWeight: '800', color: colors.textPrimary, marginTop: SPACING.lg, marginBottom: 8 },
    small: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
    input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 10, fontSize: FONT_SIZES.md, color: colors.textPrimary },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    chipTextActive: { color: colors.textInverse },
    thumb: { width: 92, height: 92, borderRadius: 12, backgroundColor: colors.surfaceLight },
    addThumb: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary },
    addText: { fontSize: 12, color: colors.primary, fontWeight: '700' },
    remove: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    cover: { position: 'absolute', bottom: 4, left: 4, color: '#FFFFFF', fontSize: 10, fontWeight: '800', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, borderRadius: 4, overflow: 'hidden' },
    videoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    videoText: { flex: 1, fontSize: FONT_SIZES.sm, color: colors.textPrimary },
    link: { color: colors.error, fontWeight: '700' },
    outlineButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingHorizontal: SPACING.md, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    outlineText: { flex: 1, fontSize: FONT_SIZES.sm, color: colors.textPrimary, fontWeight: '600' },
    feeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 6 },
    feeLabel: { flex: 1, fontSize: FONT_SIZES.sm, color: colors.textPrimary },
    feeInput: { width: 150 },
    total: { fontSize: FONT_SIZES.sm, fontWeight: '800', color: colors.primary, marginTop: 4 },
    note: { fontSize: 13, color: colors.textSecondary, marginTop: SPACING.lg },
    saveButton: { marginTop: SPACING.lg, minHeight: 50, borderRadius: 25, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    saveText: { color: colors.textInverse, fontWeight: '800', fontSize: FONT_SIZES.md },
    progress: { textAlign: 'center', marginTop: 8, fontSize: 13, color: colors.textSecondary },
});
