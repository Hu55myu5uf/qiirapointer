import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
    RefreshControl,
    Alert,
    TextInput,
    Modal,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from '../components/CachedImage';
import { useTheme } from '../context/ThemeContext';
import { communityAPI } from '../services/api';
import { VerificationBadgeInline } from '../components/VerificationBadge';
import { MentionSuggestions } from '../components/Mentions';
import { SPACING, FONT_SIZES, BORDER_RADIUS, CONTENT_MAX_WIDTH } from '../constants/theme';
import { categoryIconOf } from '../constants/categories';
import { PLACEHOLDER_AVATARS } from '../assets';

type Person = { uid: string; name: string; avatar: string; username?: string | null; isVerified?: boolean; role?: string };

/**
 * One community: what it is, its members and their recent posts. Vendors of the same category
 * can ask to join (or accept an invitation); everyone can follow. The owner approves requests,
 * invites by @username and removes members; admins verify or reject it.
 */
export default function CommunityDetailScreen({ route, navigation }: any) {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const id: string = route.params?.communityId;

    const [data, setData] = useState<any>(null);
    const [posts, setPosts] = useState<any[]>([]);
    const [tab, setTab] = useState<'posts' | 'members' | 'requests'>('posts');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteName, setInviteName] = useState('');

    const load = useCallback(async () => {
        try {
            const [d, p] = await Promise.all([communityAPI.get(id), communityAPI.posts(id).catch(() => null)]);
            setData(d.data);
            setPosts(p?.data?.posts || []);
            navigation.setOptions({ title: d.data?.community?.name || 'Community' });
        } catch (e: any) {
            if (e?.response?.status === 404) {
                Alert.alert('Community unavailable', 'It may have been removed.');
                navigation.goBack();
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [id, navigation]);

    useEffect(() => { load(); }, [load]);

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

    if (loading || !data) {
        return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
    }

    const c = data.community;
    const v = data.viewer || {};
    const members: Person[] = data.members || [];
    const requests: Person[] = data.requests || [];

    const openPerson = (p: Person) => navigation.navigate('VendorDetails', { vendorId: p.uid });

    const confirm = (title: string, message: string, label: string, fn: () => Promise<any>) =>
        Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: label, style: 'destructive', onPress: () => act(fn) }]);

    // Main action for this viewer
    let primary: { label: string; icon: string; onPress: () => void; filled: boolean } | null = null;
    if (v.hasInvite && !v.isMember) primary = { label: 'Accept invitation', icon: 'checkmark', filled: true, onPress: () => act(() => communityAPI.join(id), `You joined ${c.name}`) };
    else if (v.canJoin && !v.hasRequested) primary = { label: 'Ask to join', icon: 'person-add-outline', filled: true, onPress: () => act(() => communityAPI.join(id), 'Request sent. The owner will review it.') };
    else if (v.hasRequested && !v.isMember) primary = { label: 'Request sent', icon: 'time-outline', filled: false, onPress: () => {} };

    const followButton = (
        <TouchableOpacity
            style={[styles.button, v.isFollowing ? styles.buttonOutline : (primary ? styles.buttonOutline : styles.buttonFilled)]}
            onPress={() => act(() => (v.isFollowing ? communityAPI.unfollow(id) : communityAPI.follow(id)))}
            accessibilityRole="button"
        >
            <Ionicons name={v.isFollowing ? 'notifications' : 'notifications-outline'} size={16} color={v.isFollowing || primary ? colors.textPrimary : colors.textInverse} />
            <Text style={[styles.buttonText, { color: v.isFollowing || primary ? colors.textPrimary : colors.textInverse }]}>{v.isFollowing ? 'Following' : 'Follow'}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={{ paddingBottom: SPACING.xl }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.primary]} tintColor={colors.primary} />}
            >
                <View style={styles.column}>
                    {/* About */}
                    <View style={styles.head}>
                        {c.image ? <Image source={{ uri: c.image }} style={styles.image} /> : (
                            <View style={[styles.image, styles.imageIcon]}>
                                <Ionicons name={categoryIconOf(c.category) as any} size={34} color={colors.primary} />
                            </View>
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={styles.nameRow}>
                                <Text style={styles.name} accessibilityRole="header">{c.name}</Text>
                                {c.isVerified ? <Ionicons name="checkmark-circle" size={18} color={colors.primary} accessibilityLabel="Verified community" /> : null}
                            </View>
                            <Text style={styles.meta}>{c.category} community</Text>
                            <Text style={styles.meta}>{c.memberCount} member{c.memberCount === 1 ? '' : 's'} · {c.followerCount} follower{c.followerCount === 1 ? '' : 's'}</Text>
                        </View>
                    </View>

                    {c.status === 'pending' ? (
                        <View style={styles.notice}>
                            <Ionicons name="shield-outline" size={16} color={colors.textSecondary} />
                            <Text style={styles.noticeText}>Unverified: Pointer hasn't verified this community yet.</Text>
                        </View>
                    ) : null}
                    {c.status === 'rejected' ? (
                        <View style={[styles.notice, { borderColor: colors.error }]}>
                            <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
                            <Text style={[styles.noticeText, { color: colors.error }]}>Not approved{data.rejectionReason ? `: ${data.rejectionReason}` : ''}. Only you and admins can see it.</Text>
                        </View>
                    ) : null}

                    {c.description ? <Text style={styles.description}>{c.description}</Text> : null}

                    {/* Actions */}
                    <View style={styles.actions}>
                        {primary ? (
                            <TouchableOpacity style={[styles.button, primary.filled ? styles.buttonFilled : styles.buttonOutline]} onPress={primary.onPress} disabled={!primary.filled} accessibilityRole="button">
                                <Ionicons name={primary.icon as any} size={16} color={primary.filled ? colors.textInverse : colors.textPrimary} />
                                <Text style={[styles.buttonText, { color: primary.filled ? colors.textInverse : colors.textPrimary }]}>{primary.label}</Text>
                            </TouchableOpacity>
                        ) : null}
                        {c.status !== 'rejected' ? followButton : null}
                        {v.isOwner ? (
                            <TouchableOpacity style={[styles.button, styles.buttonOutline]} onPress={() => setInviteOpen(true)} accessibilityRole="button">
                                <Ionicons name="person-add-outline" size={16} color={colors.textPrimary} />
                                <Text style={[styles.buttonText, { color: colors.textPrimary }]}>Invite</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                    {v.hasInvite && !v.isMember ? (
                        <TouchableOpacity onPress={() => act(() => communityAPI.declineInvite(id))} style={styles.linkButton} accessibilityRole="button">
                            <Text style={styles.linkText}>Decline invitation</Text>
                        </TouchableOpacity>
                    ) : null}
                    {!v.isMember && !v.canJoin && !v.hasInvite && !v.isAdmin ? (
                        <Text style={styles.hint}>Only {c.category} vendors can join. Anyone can follow to see members' posts.</Text>
                    ) : null}

                    {/* Admin */}
                    {v.isAdmin ? (
                        <View style={styles.adminBox}>
                            <Text style={styles.adminTitle}>Admin</Text>
                            <View style={styles.actions}>
                                {c.status !== 'verified' ? (
                                    <TouchableOpacity style={[styles.button, styles.buttonFilled]} onPress={() => act(() => communityAPI.verify(id, 'verified'), 'Community verified')} accessibilityRole="button">
                                        <Text style={[styles.buttonText, { color: colors.textInverse }]}>Verify</Text>
                                    </TouchableOpacity>
                                ) : null}
                                {c.status !== 'rejected' ? (
                                    <TouchableOpacity
                                        style={[styles.button, styles.buttonOutline]}
                                        onPress={() => Alert.prompt
                                            ? Alert.prompt('Reject community', 'Reason shown to the owner', (reason) => act(() => communityAPI.verify(id, 'rejected', reason || undefined)))
                                            : confirm('Reject community?', 'It will be hidden from everyone except its owner.', 'Reject', () => communityAPI.verify(id, 'rejected'))}
                                        accessibilityRole="button"
                                    >
                                        <Text style={[styles.buttonText, { color: colors.error }]}>Reject</Text>
                                    </TouchableOpacity>
                                ) : null}
                                <TouchableOpacity style={[styles.button, styles.buttonOutline]} onPress={() => confirm('Delete community?', 'This removes it for everyone.', 'Delete', async () => { await communityAPI.remove(id); navigation.goBack(); })} accessibilityRole="button">
                                    <Text style={[styles.buttonText, { color: colors.error }]}>Delete</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : null}

                    {/* Tabs */}
                    <View style={styles.tabs}>
                        {(['posts', 'members', ...(v.isOwner || v.isAdmin ? ['requests'] : [])] as const).map((t: any) => (
                            <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
                                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                                    {t === 'posts' ? 'Posts' : t === 'members' ? `Members (${members.length})` : `Requests${requests.length ? ` (${requests.length})` : ''}`}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {tab === 'posts' ? (
                        posts.length === 0 ? (
                            <Text style={styles.emptyText}>No posts from members yet.</Text>
                        ) : (
                            <View style={styles.grid}>
                                {posts.map(p => (
                                    <TouchableOpacity
                                        key={p.id}
                                        style={styles.gridItem}
                                        onPress={() => navigation.navigate('VendorDetails', { vendorId: p.authorId || p.vendorId })}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Post by ${p.vendorName}`}
                                    >
                                        {p.thumbnailUrl || p.mediaUrl ? (
                                            <Image source={{ uri: p.thumbnailUrl || p.mediaUrl }} style={styles.gridImage} />
                                        ) : (
                                            <View style={[styles.gridImage, styles.gridText]}>
                                                <Text style={styles.gridCaption} numberOfLines={4}>{p.caption}</Text>
                                            </View>
                                        )}
                                        {p.type === 'reel' ? <Ionicons name="play" size={16} color="#FFFFFF" style={styles.gridPlay} /> : null}
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )
                    ) : null}

                    {tab === 'members' ? members.map(m => (
                        <View key={m.uid} style={styles.personRow}>
                            <TouchableOpacity style={styles.person} onPress={() => openPerson(m)} accessibilityRole="button">
                                <Image source={m.avatar ? { uri: m.avatar } : PLACEHOLDER_AVATARS.vendor} style={styles.avatar} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <View style={styles.nameRow}>
                                        <Text style={styles.personName} numberOfLines={1}>{m.name}</Text>
                                        <VerificationBadgeInline isVerified={Boolean(m.isVerified)} size={14} />
                                    </View>
                                    <Text style={styles.personMeta} numberOfLines={1}>{m.username ? `@${m.username}` : ''}{m.role === 'owner' ? (m.username ? ' · Owner' : 'Owner') : ''}</Text>
                                </View>
                            </TouchableOpacity>
                            {(v.isOwner || v.isAdmin) && m.role !== 'owner' ? (
                                <TouchableOpacity onPress={() => confirm('Remove member?', `${m.name} will no longer be a member.`, 'Remove', () => communityAPI.removeMember(id, m.uid))} accessibilityRole="button" accessibilityLabel={`Remove ${m.name}`} hitSlop={8}>
                                    <Ionicons name="close-circle-outline" size={22} color={colors.textTertiary} />
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    )) : null}
                    {tab === 'members' && v.isMember && !v.isOwner ? (
                        <TouchableOpacity onPress={() => confirm('Leave community?', `You'll stop being a member of ${c.name}.`, 'Leave', () => communityAPI.leave(id))} style={styles.linkButton} accessibilityRole="button">
                            <Text style={[styles.linkText, { color: colors.error }]}>Leave community</Text>
                        </TouchableOpacity>
                    ) : null}
                    {tab === 'members' && v.isOwner ? (
                        <TouchableOpacity onPress={() => confirm('Delete community?', 'This removes it for all members and followers.', 'Delete', async () => { await communityAPI.remove(id); navigation.goBack(); })} style={styles.linkButton} accessibilityRole="button">
                            <Text style={[styles.linkText, { color: colors.error }]}>Delete community</Text>
                        </TouchableOpacity>
                    ) : null}

                    {tab === 'requests' ? (
                        requests.length === 0 ? <Text style={styles.emptyText}>No requests waiting.</Text> : requests.map(r => (
                            <View key={r.uid} style={styles.personRow}>
                                <TouchableOpacity style={styles.person} onPress={() => openPerson(r)} accessibilityRole="button">
                                    <Image source={r.avatar ? { uri: r.avatar } : PLACEHOLDER_AVATARS.vendor} style={styles.avatar} />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={styles.personName} numberOfLines={1}>{r.name}</Text>
                                        {r.username ? <Text style={styles.personMeta}>@{r.username}</Text> : null}
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.smallButton, styles.buttonFilled]} onPress={() => act(() => communityAPI.decide(id, r.uid, true))} accessibilityRole="button" accessibilityLabel={`Approve ${r.name}`}>
                                    <Text style={[styles.smallButtonText, { color: colors.textInverse }]}>Approve</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.smallButton, styles.buttonOutline]} onPress={() => act(() => communityAPI.decide(id, r.uid, false))} accessibilityRole="button" accessibilityLabel={`Decline ${r.name}`}>
                                    <Text style={[styles.smallButtonText, { color: colors.textPrimary }]}>Decline</Text>
                                </TouchableOpacity>
                            </View>
                        ))
                    ) : null}
                </View>
            </ScrollView>

            {/* Invite by @username */}
            <Modal visible={inviteOpen} transparent animationType="fade" onRequestClose={() => setInviteOpen(false)}>
                <View style={styles.modalWrap}>
                    <View style={styles.modal}>
                        <Text style={styles.modalTitle}>Invite a vendor</Text>
                        <Text style={styles.hint}>Only {c.category} vendors can be invited. The invitation is valid for 7 days.</Text>
                        <TextInput
                            style={styles.input}
                            value={inviteName}
                            onChangeText={setInviteName}
                            placeholder="@username"
                            placeholderTextColor={colors.textTertiary}
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoFocus
                        />
                        <MentionSuggestions text={inviteName.startsWith('@') ? inviteName : `@${inviteName}`} onChangeText={(t) => setInviteName(t.trim())} max={4} />
                        <View style={[styles.actions, { justifyContent: 'flex-end' }]}>
                            <TouchableOpacity style={[styles.button, styles.buttonOutline]} onPress={() => setInviteOpen(false)}>
                                <Text style={[styles.buttonText, { color: colors.textPrimary }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.button, styles.buttonFilled]}
                                onPress={() => act(async () => { await communityAPI.invite(id, inviteName.trim()); setInviteOpen(false); setInviteName(''); }, 'Invitation sent')}
                            >
                                <Text style={[styles.buttonText, { color: colors.textInverse }]}>Send</Text>
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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    column: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: SPACING.md },
    head: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingTop: SPACING.lg },
    image: { width: 76, height: 76, borderRadius: 20, backgroundColor: colors.surfaceLight },
    imageIcon: { alignItems: 'center', justifyContent: 'center' },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    name: { fontSize: FONT_SIZES.xl, fontWeight: '800', color: colors.textPrimary, flexShrink: 1 },
    meta: { fontSize: FONT_SIZES.sm, color: colors.textSecondary, marginTop: 2 },
    notice: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: BORDER_RADIUS.md, padding: SPACING.sm, marginTop: SPACING.md },
    noticeText: { flex: 1, fontSize: 13, color: colors.textSecondary },
    description: { fontSize: FONT_SIZES.md, color: colors.textPrimary, marginTop: SPACING.md, lineHeight: 22 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md },
    button: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, minHeight: 40, borderRadius: 20 },
    buttonFilled: { backgroundColor: colors.primary },
    buttonOutline: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    buttonText: { fontSize: FONT_SIZES.sm, fontWeight: '700' },
    linkButton: { paddingVertical: SPACING.sm, minHeight: 40, justifyContent: 'center' },
    linkText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: colors.textSecondary },
    hint: { fontSize: 13, color: colors.textSecondary, marginTop: SPACING.sm },
    adminBox: { marginTop: SPACING.md, padding: SPACING.md, borderRadius: BORDER_RADIUS.md, backgroundColor: colors.surfaceLight },
    adminTitle: { fontSize: FONT_SIZES.sm, fontWeight: '800', color: colors.textPrimary },
    tabs: { flexDirection: 'row', marginTop: SPACING.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
    tab: { paddingVertical: 10, marginRight: SPACING.lg, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabActive: { borderBottomColor: colors.primary },
    tabText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: colors.textSecondary },
    tabTextActive: { color: colors.textPrimary },
    emptyText: { fontSize: FONT_SIZES.sm, color: colors.textSecondary, textAlign: 'center', paddingVertical: SPACING.xl },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: SPACING.sm },
    gridItem: { width: '32.6%', aspectRatio: 1 },
    gridImage: { width: '100%', height: '100%', backgroundColor: colors.surfaceLight },
    gridText: { padding: 8, justifyContent: 'center' },
    gridCaption: { fontSize: 12, color: colors.textPrimary },
    gridPlay: { position: 'absolute', top: 6, right: 6 },
    personRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 48 },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceLight },
    personName: { fontSize: FONT_SIZES.md, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
    personMeta: { fontSize: 12, color: colors.textSecondary },
    smallButton: { paddingHorizontal: 12, minHeight: 34, borderRadius: 17, justifyContent: 'center' },
    smallButtonText: { fontSize: 13, fontWeight: '700' },
    modalWrap: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: SPACING.lg },
    modal: { backgroundColor: colors.surface, borderRadius: 18, padding: SPACING.lg, maxWidth: 480, width: '100%', alignSelf: 'center', gap: SPACING.sm },
    modalTitle: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: colors.textPrimary },
    input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceLight, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 10, fontSize: FONT_SIZES.md, color: colors.textPrimary },
});
