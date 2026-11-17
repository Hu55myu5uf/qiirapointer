import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
    RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { vendorAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS, CONTENT_MAX_WIDTH } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { QIIRA_PALETTE } from '../constants/theme';
import VendorVerificationModal from '../components/VendorVerificationModal';

const BADGE_GRADIENT = [QIIRA_PALETTE.shade20, QIIRA_PALETTE.base, QIIRA_PALETTE.tint20];

const BADGE_BENEFITS = [
    { icon: 'checkmark-circle', text: 'Verified badge on your profile' },
    { icon: 'shield-checkmark', text: 'Shows people your identity has been checked' },
    { icon: 'people', text: 'More trust from customers & vendors' },
    { icon: 'ribbon', text: 'Show you are authentic' },
];

const HOW_IT_WORKS = [
    { step: '1', title: 'Upload an ID document', desc: 'NIN, driver\'s licence, international passport or CAC certificate. It is stored privately.' },
    { step: '2', title: 'We review it', desc: 'A QIIRA administrator checks your document, usually within 1–2 working days.' },
    { step: '3', title: 'Get your badge', desc: 'The verified badge appears on your profile as soon as you are approved.' },
];

type Status = 'none' | 'pending' | 'approved' | 'rejected';

/**
 * Free identity verification. There is no payment: the user uploads an identity document
 * (stored privately), an administrator reviews it, and the verified badge is granted.
 */
export default function GetVerifiedScreen() {
    const { theme, colors } = useTheme();
    const styles = getStyles(colors, theme);
    const { user } = useAuthStore();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [status, setStatus] = useState<Status>('none');
    const [loadError, setLoadError] = useState(false);
    const [showUpload, setShowUpload] = useState(false);

    const fetchStatus = useCallback(async () => {
        if (!user) return;
        try {
            const res = await vendorAPI.getBadgeStatus(user.uid);
            const d = res.data || {};
            setStatus(d.isVerified ? 'approved' : d.isPending ? 'pending' : d.verificationStatus === 'rejected' ? 'rejected' : 'none');
            setLoadError(false);
        } catch {
            setLoadError(true);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user]);

    useFocusEffect(useCallback(() => { fetchStatus(); }, [fetchStatus]));

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        );
    }

    const isVerified = status === 'approved';
    const isPending = status === 'pending';
    const canApply = !isVerified && !isPending;

    return (
        <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.container}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchStatus(); }} />}
        >
            {/* Header */}
            <View style={styles.header}>
                <LinearGradient colors={BADGE_GRADIENT as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerBadgeCircle}>
                    <Ionicons name="checkmark-circle" size={48} color="#FFF" />
                </LinearGradient>
                <Text style={styles.title} accessibilityRole="header">Get Verified</Text>
                <Text style={styles.subtitle}>
                    Free identity verification. Show people on QIIRA that you are who you say you are.
                </Text>
            </View>

            {loadError ? (
                <View style={[styles.statusBanner, { backgroundColor: colors.surfaceLight }]}>
                    <View style={styles.statusContent}>
                        <Ionicons name="cloud-offline-outline" size={24} color={colors.textSecondary} />
                        <View style={styles.statusTextContainer}>
                            <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>Couldn't load your status</Text>
                            <Text style={[styles.statusExpiry, { color: colors.textSecondary }]}>Pull down to try again.</Text>
                        </View>
                    </View>
                </View>
            ) : isVerified ? (
                <LinearGradient colors={BADGE_GRADIENT as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.statusBanner}>
                    <View style={styles.statusContent}>
                        <Ionicons name="checkmark-circle" size={24} color="#FFF" />
                        <View style={styles.statusTextContainer}>
                            <Text style={styles.statusTitle}>You're Verified! ✓</Text>
                            <Text style={styles.statusExpiry}>Your badge is shown on your profile.</Text>
                        </View>
                    </View>
                </LinearGradient>
            ) : isPending ? (
                <View style={[styles.statusBanner, { backgroundColor: '#B28A4520', borderColor: '#B28A45', borderWidth: 1 }]}>
                    <View style={styles.statusContent}>
                        <Ionicons name="time" size={24} color="#B28A45" />
                        <View style={styles.statusTextContainer}>
                            <Text style={[styles.statusTitle, { color: '#B28A45' }]}>Under review</Text>
                            <Text style={[styles.statusExpiry, { color: colors.textSecondary }]}>
                                We've received your document. You'll be notified once an administrator has reviewed it.
                            </Text>
                        </View>
                    </View>
                </View>
            ) : status === 'rejected' ? (
                <View style={[styles.statusBanner, { backgroundColor: colors.surfaceLight, borderColor: colors.error || '#DC2626', borderWidth: 1 }]}>
                    <View style={styles.statusContent}>
                        <Ionicons name="alert-circle" size={24} color={colors.error || '#DC2626'} />
                        <View style={styles.statusTextContainer}>
                            <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>Not approved</Text>
                            <Text style={[styles.statusExpiry, { color: colors.textSecondary }]}>
                                Your last document couldn't be verified. Please upload a clear photo of a valid ID.
                            </Text>
                        </View>
                    </View>
                </View>
            ) : null}

            {/* Benefits + action */}
            <View style={styles.mainCard}>
                <View style={styles.priceSection}>
                    <Text style={styles.badgeLabel}>Verified Badge</Text>
                    <View style={styles.priceRow}>
                        <Text style={styles.priceAmount}>Free</Text>
                    </View>
                </View>

                <View style={styles.benefitsContainer}>
                    <Text style={styles.benefitsTitle}>What you get</Text>
                    {BADGE_BENEFITS.map((benefit, index) => (
                        <View key={index} style={styles.benefitRow}>
                            <View style={styles.benefitIconCircle}>
                                <Ionicons name={benefit.icon as any} size={18} color={QIIRA_PALETTE.base} />
                            </View>
                            <Text style={styles.benefitText}>{benefit.text}</Text>
                        </View>
                    ))}
                </View>

                <TouchableOpacity
                    style={[styles.ctaButton, !canApply && styles.ctaButtonVerified]}
                    onPress={() => setShowUpload(true)}
                    disabled={!canApply || loadError}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canApply }}
                >
                    <LinearGradient
                        colors={!canApply ? [colors.surfaceLight, colors.surfaceLight] as any : BADGE_GRADIENT as any}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.ctaGradient}
                    >
                        <Ionicons
                            name={isVerified ? 'checkmark-circle' : isPending ? 'time' : 'cloud-upload-outline'}
                            size={20}
                            color={!canApply ? QIIRA_PALETTE.base : '#FFF'}
                        />
                        <Text style={[styles.ctaText, !canApply && { color: QIIRA_PALETTE.base }]}>
                            {isVerified ? 'Already Verified ✓' : isPending ? 'Under review' : status === 'rejected' ? 'Upload a new document' : 'Upload ID document'}
                        </Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>

            {/* How It Works */}
            <View style={styles.howItWorks}>
                <Text style={styles.sectionTitle}>How it works</Text>
                {HOW_IT_WORKS.map((item) => (
                    <View key={item.step} style={styles.stepRow}>
                        <View style={styles.stepCircle}>
                            <Text style={styles.stepNumber}>{item.step}</Text>
                        </View>
                        <View style={styles.stepContent}>
                            <Text style={styles.stepTitle}>{item.title}</Text>
                            <Text style={styles.stepDesc}>{item.desc}</Text>
                        </View>
                    </View>
                ))}
            </View>

            <View style={styles.footer}>
                <Text style={styles.footerText}>
                    Your document is only visible to QIIRA administrators and is used solely to verify your identity.
                </Text>
            </View>

            {user ? (
                <VendorVerificationModal
                    visible={showUpload}
                    onClose={() => setShowUpload(false)}
                    vendorId={user.uid}
                    onSuccess={() => setStatus('pending')}
                />
            ) : null}
        </ScrollView>
    );
}

const getStyles = (colors: any, theme: string) => StyleSheet.create({
    scrollView: {
        flex: 1,
        backgroundColor: colors.background,
    },
    container: {
        width: '100%',
        maxWidth: CONTENT_MAX_WIDTH,
        alignSelf: 'center',
        padding: SPACING.lg,
        paddingBottom: SPACING.xxl + 40,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
    },
    loadingText: {
        marginTop: SPACING.md,
        fontSize: FONT_SIZES.md,
        color: colors.textSecondary,
    },
    header: {
        alignItems: 'center',
        marginBottom: SPACING.xl,
        paddingTop: SPACING.md,
    },
    headerBadgeCircle: {
        width: 88,
        height: 88,
        borderRadius: 44,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: SPACING.md,
    },
    title: {
        fontSize: FONT_SIZES.xxl,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    subtitle: {
        fontSize: FONT_SIZES.md,
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: SPACING.xs,
    },
    statusBanner: {
        borderRadius: BORDER_RADIUS.lg,
        padding: SPACING.md,
        marginBottom: SPACING.lg,
    },
    statusContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusTextContainer: {
        marginLeft: SPACING.md,
    },
    statusTitle: {
        fontSize: FONT_SIZES.md,
        fontWeight: 'bold',
        color: '#FFF',
    },
    statusExpiry: {
        fontSize: FONT_SIZES.sm,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 2,
    },
    mainCard: {
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: SPACING.lg,
        ...SHADOWS.medium,
    },
    priceSection: {
        padding: SPACING.xl,
        paddingTop: SPACING.xl + 4,
        paddingBottom: SPACING.xl + 4,
        alignItems: 'center',
    },
    badgeLabel: {
        fontSize: FONT_SIZES.lg,
        fontWeight: 'bold',
        color: '#FFF',
        marginTop: SPACING.sm,
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginTop: SPACING.sm,
    },
    priceCurrency: {
        fontSize: FONT_SIZES.lg,
        fontWeight: 'bold',
        color: 'rgba(255,255,255,0.9)',
        marginRight: 2,
    },
    priceAmount: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#FFF',
    },
    pricePeriod: {
        fontSize: FONT_SIZES.sm,
        color: 'rgba(255,255,255,0.8)',
        marginLeft: 4,
    },
    benefitsContainer: {
        padding: SPACING.lg,
    },
    benefitsTitle: {
        fontSize: FONT_SIZES.lg,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: SPACING.md,
    },
    benefitRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.md,
    },
    benefitIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: theme === 'dark' ? 'rgba(178, 138, 69, 0.15)' : 'rgba(178, 138, 69, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    benefitText: {
        fontSize: FONT_SIZES.md,
        color: colors.textPrimary,
        marginLeft: SPACING.md,
        flex: 1,
    },
    ctaButton: {
        marginHorizontal: SPACING.lg,
        marginBottom: SPACING.lg,
        borderRadius: BORDER_RADIUS.lg,
        overflow: 'hidden',
    },
    ctaButtonVerified: {
        borderWidth: 1,
        borderColor: colors.border,
    },
    ctaGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: SPACING.md + 2,
        gap: SPACING.sm,
    },
    ctaText: {
        color: '#FFF',
        fontSize: FONT_SIZES.md,
        fontWeight: 'bold',
    },
    howItWorks: {
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.xl,
        padding: SPACING.lg,
        marginBottom: SPACING.lg,
        borderWidth: 1,
        borderColor: colors.border,
    },
    sectionTitle: {
        fontSize: FONT_SIZES.lg,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: SPACING.lg,
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: SPACING.lg,
    },
    stepCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: QIIRA_PALETTE.base,
        justifyContent: 'center',
        alignItems: 'center',
    },
    stepNumber: {
        color: '#FFF',
        fontSize: FONT_SIZES.sm,
        fontWeight: 'bold',
    },
    stepContent: {
        marginLeft: SPACING.md,
        flex: 1,
    },
    stepTitle: {
        fontSize: FONT_SIZES.md,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    stepDesc: {
        fontSize: FONT_SIZES.sm,
        color: colors.textSecondary,
        marginTop: 2,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: SPACING.lg,
        gap: SPACING.xs,
    },
    footerText: {
        fontSize: FONT_SIZES.xs,
        color: colors.textTertiary,
        textAlign: 'center',
        flex: 1,
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: SPACING.lg,
    },
    modalContent: {
        width: '100%',
        maxWidth: 420,
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.xl,
        overflow: 'hidden',
    },
    modalHeader: {
        padding: SPACING.xl,
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: FONT_SIZES.xl,
        fontWeight: 'bold',
        color: '#FFF',
        marginTop: SPACING.sm,
    },
    modalBody: {
        padding: SPACING.xl,
        alignItems: 'center',
    },
    modalPriceLabel: {
        fontSize: FONT_SIZES.sm,
        color: colors.textSecondary,
        marginBottom: SPACING.xs,
    },
    modalPrice: {
        fontSize: 36,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    modalPriceSub: {
        fontSize: FONT_SIZES.sm,
        color: colors.textTertiary,
        marginTop: SPACING.xs,
    },
    modalActions: {
        flexDirection: 'row',
        gap: SPACING.md,
        marginTop: SPACING.xl,
        width: '100%',
    },
    modalCancelButton: {
        flex: 1,
        paddingVertical: SPACING.md,
        borderRadius: BORDER_RADIUS.lg,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    modalCancelText: {
        fontSize: FONT_SIZES.md,
        fontWeight: '600',
    },
    modalConfirmButton: {
        flex: 1,
        paddingVertical: SPACING.md,
        borderRadius: BORDER_RADIUS.lg,
        alignItems: 'center',
    },
    modalConfirmText: {
        color: '#FFF',
        fontSize: FONT_SIZES.md,
        fontWeight: 'bold',
    },
});
