import React, { useCallback, useMemo, useState } from 'react';
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
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from '../components/CachedImage';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../store/authStore';
import { communityAPI } from '../services/api';
import { uploadImageViaBackend } from '../utils/backendUpload';
import { SPACING, FONT_SIZES, BORDER_RADIUS, CONTENT_MAX_WIDTH } from '../constants/theme';
import { POPULAR_CATEGORIES, categoryIconOf } from '../constants/categories';

type Community = {
    id: string;
    name: string;
    description: string;
    category: string;
    image: string;
    status: 'pending' | 'verified' | 'rejected';
    isVerified: boolean;
    memberCount: number;
    followerCount: number;
    ownerName?: string | null;
    role?: string;
};

type Tab = 'browse' | 'mine' | 'review';

/** Browse communities, see yours (member / following / invitations), and create one (vendors). */
export default function CommunitiesScreen({ navigation }: any) {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const userRole = useAuthStore(s => s.userRole);
    const isVendor = userRole === 'vendor';
    const isAdmin = userRole === 'admin';

    const [tab, setTab] = useState<Tab>('browse');
    const [category, setCategory] = useState('All');
    const [q, setQ] = useState('');
    const [list, setList] = useState<Community[]>([]);
    const [mine, setMine] = useState<{ member: Community[]; following: Community[]; invites: Community[] }>({ member: [], following: [], invites: [] });
    const [pending, setPending] = useState<Community[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);

    const load = useCallback(async () => {
        try {
            const [browse, my, review] = await Promise.all([
                communityAPI.list({ category: category === 'All' ? undefined : category, q: q.trim() || undefined }),
                communityAPI.mine().catch(() => null),
                isAdmin ? communityAPI.pending().catch(() => null) : Promise.resolve(null),
            ]);
            setList(browse.data?.communities || []);
            if (my?.data) setMine({ member: my.data.member || [], following: my.data.following || [], invites: my.data.invites || [] });
            if (review?.data) setPending(review.data.communities || []);
        } catch {
            // keep what is shown
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [category, q, isAdmin]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const open = (c: Community) => navigation.navigate('CommunityDetail', { communityId: c.id, name: c.name });

    const data: (Community | { header: string })[] = useMemo(() => {
        if (tab === 'browse') return list;
        if (tab === 'review') return pending;
        const out: (Community | { header: string })[] = [];
        if (mine.invites.length) { out.push({ header: 'Invitations' }); out.push(...mine.invites); }
        if (mine.member.length) { out.push({ header: 'Member' }); out.push(...mine.member); }
        if (mine.following.length) { out.push({ header: 'Following' }); out.push(...mine.following); }
        return out;
    }, [tab, list, mine, pending]);

    const renderItem = ({ item }: { item: Community | { header: string } }) => {
        if ('header' in item) return <Text style={styles.sectionHeader} accessibilityRole="header">{item.header}</Text>;
        const c = item;
        return (
            <TouchableOpacity style={styles.card} onPress={() => open(c)} accessibilityRole="button" accessibilityLabel={`${c.name}, ${c.category} community, ${c.memberCount} members`}>
                {c.image ? (
                    <Image source={{ uri: c.image }} style={styles.cardImage} />
                ) : (
                    <View style={[styles.cardImage, styles.cardIcon]}>
                        <Ionicons name={categoryIconOf(c.category) as any} size={26} color={colors.primary} />
                    </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.nameRow}>
                        <Text style={styles.cardName} numberOfLines={1}>{c.name}</Text>
                        {c.isVerified ? <Ionicons name="checkmark-circle" size={16} color={colors.primary} /> : null}
                    </View>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                        {c.category} · {c.memberCount} member{c.memberCount === 1 ? '' : 's'} · {c.followerCount} follower{c.followerCount === 1 ? '' : 's'}
                    </Text>
                    {c.status === 'pending' ? <Text style={styles.unverified}>Unverified</Text> : null}
                    {c.description ? <Text style={styles.cardDesc} numberOfLines={2}>{c.description}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
        );
    };

    const tabs: { key: Tab; label: string; count?: number }[] = [
        { key: 'browse', label: 'Discover' },
        { key: 'mine', label: 'Yours', count: mine.invites.length || undefined },
        ...(isAdmin ? [{ key: 'review' as Tab, label: 'To verify', count: pending.length || undefined }] : []),
    ];

    return (
        <View style={styles.container}>
            <View style={styles.top}>
                <View style={styles.tabs}>
                    {tabs.map(t => (
                        <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }}>
                            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}{t.count ? ` (${t.count})` : ''}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                {tab === 'browse' ? (
                    <>
                        <View style={styles.search}>
                            <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search communities"
                                placeholderTextColor={colors.textTertiary}
                                value={q}
                                onChangeText={setQ}
                                returnKeyType="search"
                                onSubmitEditing={() => load()}
                            />
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                            {POPULAR_CATEGORIES.map(cat => (
                                <TouchableOpacity key={cat} style={[styles.chip, category === cat && styles.chipActive]} onPress={() => setCategory(cat)}>
                                    <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>{cat}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </>
                ) : null}
            </View>

            {loading ? (
                <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
            ) : (
                <FlashList
                    data={data}
                    keyExtractor={(item: any) => ('header' in item ? `h-${item.header}` : item.id)}
                    getItemType={(item: any) => ('header' in item ? 'header' : 'row')}
                    renderItem={renderItem}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.primary]} tintColor={colors.primary} />}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="people-outline" size={44} color={colors.textTertiary} />
                            <Text style={styles.emptyTitle}>
                                {tab === 'mine' ? 'No communities yet' : tab === 'review' ? 'Nothing to verify' : 'No communities found'}
                            </Text>
                            <Text style={styles.emptyText}>
                                {tab === 'mine'
                                    ? (isVendor ? 'Join one for your category, or start your own.' : 'Follow communities to see what local businesses are sharing.')
                                    : isVendor ? 'Be the first to start one for your category.' : 'Try another category.'}
                            </Text>
                        </View>
                    }
                />
            )}

            {isVendor ? (
                <TouchableOpacity style={styles.fab} onPress={() => setCreateOpen(true)} accessibilityRole="button" accessibilityLabel="Create a community">
                    <Ionicons name="add" size={22} color={colors.textInverse} />
                    <Text style={styles.fabText}>New community</Text>
                </TouchableOpacity>
            ) : null}

            <CreateCommunityModal
                visible={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={(c) => { setCreateOpen(false); load(); open(c); }}
            />
        </View>
    );
}

function CreateCommunityModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (c: Community) => void }) {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const user = useAuthStore(s => s.user);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [image, setImage] = useState('');
    const [saving, setSaving] = useState(false);

    const pick = async () => {
        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
        if (!res.canceled && res.assets?.[0]?.uri) setImage(res.assets[0].uri);
    };

    const create = async () => {
        if (name.trim().length < 3) return Alert.alert('Name needed', 'Give your community a name of at least 3 characters.');
        setSaving(true);
        try {
            let imageUrl = '';
            if (image) imageUrl = await uploadImageViaBackend(image, 'post', user?.uid);
            const res = await communityAPI.create({ name: name.trim(), description: description.trim(), image: imageUrl || undefined });
            setName(''); setDescription(''); setImage('');
            onCreated(res.data.community);
        } catch (e: any) {
            Alert.alert('Could not create', e?.response?.data?.error || 'Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.modal}>
                    <View style={styles.modalHead}>
                        <Text style={styles.modalTitle}>New community</Text>
                        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
                            <Ionicons name="close" size={24} color={colors.textPrimary} />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.modalNote}>
                        Communities are for vendors in your category. Other vendors ask to join and you approve them; customers can follow. It shows as unverified until Pointer verifies it.
                    </Text>
                    <TouchableOpacity style={styles.imagePick} onPress={pick} accessibilityRole="button" accessibilityLabel="Choose a picture">
                        {image ? <Image source={{ uri: image }} style={styles.imagePreview} /> : (
                            <>
                                <Ionicons name="image-outline" size={24} color={colors.primary} />
                                <Text style={styles.imagePickText}>Add a picture (optional)</Text>
                            </>
                        )}
                    </TouchableOpacity>
                    <Text style={styles.label}>Name</Text>
                    <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={60} placeholder="e.g. Lagos Bakers Network" placeholderTextColor={colors.textTertiary} />
                    <Text style={styles.label}>About</Text>
                    <TextInput style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]} value={description} onChangeText={setDescription} maxLength={500} multiline placeholder="What is this community for?" placeholderTextColor={colors.textTertiary} />
                    <TouchableOpacity style={[styles.primaryButton, saving && { opacity: 0.6 }]} onPress={create} disabled={saving} accessibilityRole="button">
                        {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.primaryButtonText}>Create community</Text>}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    top: { backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingTop: SPACING.sm },
    tabs: { flexDirection: 'row', marginHorizontal: SPACING.md, backgroundColor: colors.surfaceLight, borderRadius: BORDER_RADIUS.md, padding: 4, marginBottom: SPACING.sm },
    tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 36, borderRadius: BORDER_RADIUS.sm },
    tabActive: { backgroundColor: colors.primary },
    tabText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: colors.textSecondary },
    tabTextActive: { color: colors.textInverse },
    search: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: SPACING.md, paddingHorizontal: SPACING.md, minHeight: 40, borderRadius: BORDER_RADIUS.md, backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border },
    searchInput: { flex: 1, fontSize: FONT_SIZES.sm, color: colors.textPrimary, paddingVertical: 6 },
    chips: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: 6 },
    chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: colors.textSecondary },
    chipTextActive: { color: colors.textInverse },
    sectionHeader: { fontSize: FONT_SIZES.md, fontWeight: '800', color: colors.textPrimary, paddingHorizontal: SPACING.md, paddingTop: SPACING.lg, paddingBottom: SPACING.xs, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
    card: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, marginHorizontal: SPACING.md, marginTop: SPACING.sm, backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.lg, borderWidth: 1, borderColor: colors.border, maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', width: '100%' },
    cardImage: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.surfaceLight },
    cardIcon: { alignItems: 'center', justifyContent: 'center' },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    cardName: { fontSize: FONT_SIZES.md, fontWeight: '800', color: colors.textPrimary, flexShrink: 1 },
    cardMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    unverified: { alignSelf: 'flex-start', fontSize: 11, fontWeight: '700', color: colors.textSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginTop: 4 },
    cardDesc: { fontSize: FONT_SIZES.sm, color: colors.textSecondary, marginTop: 4 },
    empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: SPACING.xl, gap: SPACING.sm },
    emptyTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: colors.textPrimary },
    emptyText: { fontSize: FONT_SIZES.sm, color: colors.textSecondary, textAlign: 'center' },
    fab: { position: 'absolute', right: SPACING.md, bottom: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 18, minHeight: 48, borderRadius: 24, elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
    fabText: { color: colors.textInverse, fontWeight: '800', fontSize: FONT_SIZES.sm },
    modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
    modal: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.lg, paddingBottom: SPACING.xl, gap: 6, maxWidth: 640, width: '100%', alignSelf: 'center' },
    modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    modalTitle: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: colors.textPrimary },
    modalNote: { fontSize: FONT_SIZES.sm, color: colors.textSecondary, marginBottom: SPACING.sm },
    imagePick: { alignSelf: 'flex-start', width: 88, height: 88, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 4 },
    imagePreview: { width: 88, height: 88 },
    imagePickText: { fontSize: 10, color: colors.textSecondary, textAlign: 'center' },
    label: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: colors.textSecondary, marginTop: SPACING.sm },
    input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceLight, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 10, fontSize: FONT_SIZES.md, color: colors.textPrimary },
    primaryButton: { marginTop: SPACING.md, backgroundColor: colors.primary, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    primaryButtonText: { color: colors.textInverse, fontWeight: '800', fontSize: FONT_SIZES.md },
});
