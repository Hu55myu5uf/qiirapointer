import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Image,
    TouchableOpacity,
    ActivityIndicator,
    Linking,
    Platform,
    StatusBar,
    Alert,
} from 'react-native';
import { authAPI, vendorAPI } from '../services/api';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { PLACEHOLDER_AVATARS } from '../assets';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { VerificationBadgeInline, AvatarVerificationBadge } from '../components/VerificationBadge';

export default function UserProfileViewScreen({ route, navigation }: any) {
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const { userId, userName: initialName, userImage: initialImage, userRole: initialRole } = route.params || {};

    const [loading, setLoading] = useState(true);
    const [avatarError, setAvatarError] = useState(false);
    const [bannerError, setBannerError] = useState(false);
    const [profile, setProfile] = useState<any>({
        fullName: initialName || 'User',
        profileImage: initialImage || '',
        role: initialRole || 'client',
        email: '',
        phoneNumber: '',
        address: '',
        description: '',
        services: '',
        createdAt: '',
    });

    useEffect(() => {
        if (!userId) return;
        setAvatarError(false);
        setBannerError(false);
        fetchProfileData();
    }, [userId]);

    const fetchProfileData = async () => {
        try {
            setLoading(true);
            // 1. Try vendor lookup first
            try {
                const vRes = await vendorAPI.getById(userId);
                if (vRes.data?.vendor) {
                    const v = vRes.data.vendor;
                    setProfile({
                        fullName: v.businessName || 'Vendor',
                        profileImage: v.businessImage || '',
                        bannerImage: v.bannerImage || '',
                        role: 'vendor',
                        email: v.userInfo?.email || v.email || '',
                        phoneNumber: v.userInfo?.phoneNumber || v.phoneNumber || '',
                        address: v.address || '',
                        description: v.description || '',
                        services: Array.isArray(v.services) ? v.services.join(', ') : (v.services || ''),
                        category: v.category || '',
                        isVerified: Boolean(v.isVerified ?? v.is_verified ?? (v.userInfo?.isVerified || v.userInfo?.role === 'admin')),
                        createdAt: v.createdAt || '',
                    });
                    setLoading(false);
                    return;
                }
            } catch (_) {}

            // 2. Client / User lookup
            const uRes = await authAPI.getUser(userId);
            if (uRes.data?.user) {
                const u = uRes.data.user;
                setProfile({
                    fullName: u.fullName || u.full_name || u.displayName || initialName || 'User',
                    profileImage: u.profileImage || u.profile_image || u.photoURL || initialImage || '',
                    role: u.role || initialRole || 'client',
                    email: u.email || '',
                    phoneNumber: u.phoneNumber || u.phone_number || '',
                    isVerified: Boolean(u.isVerified ?? u.is_verified ?? u.role === 'admin'),
                    createdAt: u.createdAt || u.created_at || '',
                });
            }
        } catch (error) {
            console.error('Error fetching profile view:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCall = () => {
        if (profile.phoneNumber) {
            Linking.openURL(`tel:${profile.phoneNumber}`);
        } else {
            Alert.alert('No Phone Number', 'This user has not provided a phone number.');
        }
    };

    const handleEmail = () => {
        if (profile.email) {
            Linking.openURL(`mailto:${profile.email}`);
        }
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return 'Recent Member';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return 'Recent Member';
        return d.toLocaleDateString([], { month: 'long', year: 'numeric' });
    };

    const defaultAvatarSource =
        profile.role === 'vendor' ? PLACEHOLDER_AVATARS.vendor : PLACEHOLDER_AVATARS.client;
    const avatarUri = profile.profileImage && !avatarError ? { uri: profile.profileImage } : defaultAvatarSource;

    const isVendor = profile.role === 'vendor';

    return (
        <View style={styles.container}>
            {/* Header with back button */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Profile</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Profile Card */}
                <View style={styles.profileCard}>
                    {/* Banner */}
                    <View style={styles.bannerContainer}>
                        {profile.bannerImage && !bannerError ? (
                            <Image
                                source={{ uri: profile.bannerImage }}
                                style={styles.banner}
                                onError={() => setBannerError(true)}
                            />
                        ) : (
                            <LinearGradient
                                colors={
                                    isVendor
                                        ? [colors.primary, colors.primaryLight]
                                        : [colors.primary, colors.primaryLight]
                                }
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.banner}
                            />
                        )}
                    </View>

                    {/* Avatar */}
                    <View style={styles.avatarContainer}>
                        <View style={styles.avatarWrapper}>
                            <Image
                                source={avatarUri}
                                style={styles.avatar}
                                onError={() => setAvatarError(true)}
                            />
                            <AvatarVerificationBadge isVerified={Boolean(profile.isVerified || profile.role === 'admin' || userId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2')} isAdmin={profile.role === 'admin' || userId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2'} size={24} />
                            {!profile.isVerified && profile.role !== 'admin' && <View style={styles.onlineIndicator} />}
                        </View>
                    </View>

                    {/* Name and Role */}
                    <View style={styles.nameSection}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={styles.fullName}>{profile.fullName}</Text>
                            <VerificationBadgeInline isVerified={Boolean(profile.isVerified || profile.role === 'admin' || userId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2')} isAdmin={profile.role === 'admin' || userId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2'} size={20} />
                        </View>
                        <View style={styles.badgeRow}>
                            <View style={[styles.roleBadge, isVendor ? styles.vendorBadge : styles.clientBadge]}>
                                <Text style={[styles.roleBadgeText, isVendor ? styles.vendorBadgeText : styles.clientBadgeText]}>
                                    {isVendor ? '🏢 Vendor' : '👤 Client'}
                                </Text>
                            </View>
                            {profile.category ? (
                                <View style={styles.categoryBadge}>
                                    <Text style={styles.categoryBadgeText}>{profile.category}</Text>
                                </View>
                            ) : null}
                        </View>
                    </View>

                    {/* Quick Actions */}
                    <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.actionButton} onPress={() => navigation.goBack()}>
                            <Ionicons name="chatbubble" size={20} color={colors.primary} />
                            <Text style={styles.actionLabel}>Message</Text>
                        </TouchableOpacity>
                        {profile.phoneNumber ? (
                            <TouchableOpacity style={styles.actionButton} onPress={handleCall}>
                                <Ionicons name="call" size={20} color="#22c55e" />
                                <Text style={styles.actionLabel}>Call</Text>
                            </TouchableOpacity>
                        ) : null}
                        {profile.email ? (
                            <TouchableOpacity style={styles.actionButton} onPress={handleEmail}>
                                <Ionicons name="mail" size={20} color="#f59e0b" />
                                <Text style={styles.actionLabel}>Email</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </View>

                {loading ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: SPACING.xl }} />
                ) : (
                    <>
                        {/* About / Description (if vendor) */}
                        {profile.description ? (
                            <View style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
                                    <Text style={styles.cardTitle}>About</Text>
                                </View>
                                <Text style={styles.cardBody}>{profile.description}</Text>
                            </View>
                        ) : null}

                        {/* Services (if vendor) */}
                        {profile.services ? (
                            <View style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <Ionicons name="briefcase-outline" size={20} color={colors.primary} />
                                    <Text style={styles.cardTitle}>Services Offered</Text>
                                </View>
                                <Text style={styles.cardBody}>{profile.services}</Text>
                            </View>
                        ) : null}

                        {/* Contact Information Card */}
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <Ionicons name="person-outline" size={20} color={colors.primary} />
                                <Text style={styles.cardTitle}>Contact Information</Text>
                            </View>

                            {profile.email ? (
                                <TouchableOpacity style={styles.infoRow} onPress={handleEmail}>
                                    <View style={[styles.infoIconWrapper, { backgroundColor: '#fef3c7' }]}>
                                        <Ionicons name="mail-outline" size={18} color="#f59e0b" />
                                    </View>
                                    <View style={styles.infoContent}>
                                        <Text style={styles.infoLabel}>Email</Text>
                                        <Text style={styles.infoValue}>{profile.email}</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                                </TouchableOpacity>
                            ) : null}

                            {profile.phoneNumber ? (
                                <TouchableOpacity style={styles.infoRow} onPress={handleCall}>
                                    <View style={[styles.infoIconWrapper, { backgroundColor: '#dcfce7' }]}>
                                        <Ionicons name="call-outline" size={18} color="#22c55e" />
                                    </View>
                                    <View style={styles.infoContent}>
                                        <Text style={styles.infoLabel}>Phone</Text>
                                        <Text style={styles.infoValue}>{profile.phoneNumber}</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                                </TouchableOpacity>
                            ) : null}

                            {profile.address ? (
                                <View style={styles.infoRow}>
                                    <View style={[styles.infoIconWrapper, { backgroundColor: '#e0e7ff' }]}>
                                        <Ionicons name="location-outline" size={18} color="#6366f1" />
                                    </View>
                                    <View style={styles.infoContent}>
                                        <Text style={styles.infoLabel}>Location</Text>
                                        <Text style={styles.infoValue}>{profile.address}</Text>
                                    </View>
                                </View>
                            ) : null}

                            <View style={styles.infoRow}>
                                <View style={[styles.infoIconWrapper, { backgroundColor: '#fce7f3' }]}>
                                    <Ionicons name="calendar-outline" size={18} color="#ec4899" />
                                </View>
                                <View style={styles.infoContent}>
                                    <Text style={styles.infoLabel}>Member Since</Text>
                                    <Text style={styles.infoValue}>{formatDate(profile.createdAt)}</Text>
                                </View>
                            </View>
                        </View>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const getStyles = (colors: any) => {
    const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : (Platform.OS === 'web' ? 0 : 48);
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: SPACING.md,
            paddingTop: statusBarHeight + SPACING.xs,
            paddingBottom: SPACING.sm,
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        backButton: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.background,
            alignItems: 'center',
            justifyContent: 'center',
        },
        headerTitle: {
            fontSize: FONT_SIZES.lg,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        scrollContent: {
            padding: SPACING.md,
            paddingBottom: SPACING.xl * 2,
        },
        profileCard: {
            backgroundColor: colors.surface,
            borderRadius: BORDER_RADIUS.lg,
            overflow: 'hidden',
            marginBottom: SPACING.md,
            borderWidth: 1,
            borderColor: colors.border,
            ...SHADOWS.small,
        },
        bannerContainer: {
            height: 140,
            width: '100%',
        },
        banner: {
            width: '100%',
            height: '100%',
        },
        avatarContainer: {
            alignItems: 'center',
            marginTop: -50,
        },
        avatarWrapper: {
            position: 'relative',
        },
        avatar: {
            width: 100,
            height: 100,
            borderRadius: 50,
            borderWidth: 4,
            borderColor: colors.surface,
            backgroundColor: colors.primaryLight,
        },
        onlineIndicator: {
            position: 'absolute',
            bottom: 6,
            right: 6,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: '#22c55e',
            borderWidth: 3,
            borderColor: colors.surface,
        },
        nameSection: {
            alignItems: 'center',
            paddingHorizontal: SPACING.lg,
            paddingTop: SPACING.sm,
            paddingBottom: SPACING.md,
        },
        fullName: {
            fontSize: FONT_SIZES.xxl,
            fontWeight: 'bold',
            color: colors.textPrimary,
            marginBottom: 6,
        },
        badgeRow: {
            flexDirection: 'row',
            gap: SPACING.xs,
            alignItems: 'center',
        },
        roleBadge: {
            paddingHorizontal: SPACING.sm,
            paddingVertical: 4,
            borderRadius: BORDER_RADIUS.round,
        },
        clientBadge: {
            backgroundColor: colors.primary + '20',
        },
        vendorBadge: {
            backgroundColor: colors.primary + '20',
        },
        roleBadgeText: {
            fontSize: FONT_SIZES.xs,
            fontWeight: '600',
        },
        clientBadgeText: {
            color: colors.primary,
        },
        vendorBadgeText: {
            color: colors.primary,
        },
        categoryBadge: {
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: SPACING.sm,
            paddingVertical: 4,
            borderRadius: BORDER_RADIUS.round,
        },
        categoryBadgeText: {
            fontSize: FONT_SIZES.xs,
            color: colors.textSecondary,
        },
        actionRow: {
            flexDirection: 'row',
            justifyContent: 'center',
            gap: SPACING.xl,
            paddingVertical: SPACING.md,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            marginHorizontal: SPACING.md,
        },
        actionButton: {
            alignItems: 'center',
            gap: 4,
        },
        actionLabel: {
            fontSize: FONT_SIZES.xs,
            fontWeight: '600',
            color: colors.textSecondary,
        },
        card: {
            backgroundColor: colors.surface,
            borderRadius: BORDER_RADIUS.lg,
            padding: SPACING.lg,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: SPACING.md,
            ...SHADOWS.small,
        },
        cardHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACING.xs,
            marginBottom: SPACING.md,
        },
        cardTitle: {
            fontSize: FONT_SIZES.md,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        cardBody: {
            fontSize: FONT_SIZES.sm,
            color: colors.textSecondary,
            lineHeight: 22,
        },
        infoRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: SPACING.sm,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
        },
        infoIconWrapper: {
            width: 36,
            height: 36,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: SPACING.md,
        },
        infoContent: {
            flex: 1,
        },
        infoLabel: {
            fontSize: FONT_SIZES.xs,
            color: colors.textTertiary,
            marginBottom: 1,
        },
        infoValue: {
            fontSize: FONT_SIZES.sm,
            fontWeight: '500',
            color: colors.textPrimary,
        },
    });
};
