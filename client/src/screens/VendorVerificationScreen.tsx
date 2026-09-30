import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    ScrollView,
    Dimensions,
    Modal,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { vendorAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { QIIRA_PALETTE } from '../constants/theme';

const { width } = Dimensions.get('window');

const BADGE_GRADIENT = [QIIRA_PALETTE.shade20, QIIRA_PALETTE.base, QIIRA_PALETTE.tint20];

const BADGE_BENEFITS = [
    { icon: 'checkmark-circle', text: 'Verified badge on your profile' },
    { icon: 'shield-checkmark', text: 'Increased trust & credibility' },
    { icon: 'people', text: 'Stand out to customers & vendors' },
    { icon: 'search', text: 'Priority in search results' },
    { icon: 'trending-up', text: 'Boost your visibility' },
    { icon: 'ribbon', text: 'Show you are authentic' },
];

export default function GetVerifiedScreen() {
    const { theme, colors } = useTheme();
    const styles = getStyles(colors, theme);

    const { user, userRole } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [purchasing, setPurchasing] = useState(false);
    const [isVerified, setIsVerified] = useState(false);
    const [isPending, setIsPending] = useState(false);
    const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const [badgeInfo, setBadgeInfo] = useState<any>(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    useEffect(() => {
        fetchBadgeData();
    }, []);

    const fetchBadgeData = async () => {
        try {
            // Fetch badge pricing info
            const infoRes = await vendorAPI.getBadgeInfo();
            setBadgeInfo(infoRes.data.badge);

            // Fetch current user's badge status
            if (user) {
                const statusRes = await vendorAPI.getBadgeStatus(user.uid);
                setIsVerified(statusRes.data.isVerified || false);
                setIsPending(statusRes.data.isPending || false);
                setExpiresAt(statusRes.data.expiresAt);
            }
        } catch (error) {
            console.error('Error fetching badge data:', error);
            // Fallback badge info
            setBadgeInfo({
                price: 3000,
                currency: '₦',
                period: '/month',
                badgeColor: '#B28A45',
                features: [
                    'Verified badge on your profile',
                    'Increased trust & credibility',
                    'Stand out to customers',
                    'Priority in search results',
                ],
            });
        } finally {
            setLoading(false);
        }
    };

    const handlePurchase = () => {
        if (isVerified) {
            Alert.alert('Already Verified', 'You already have a verified badge! 🎉');
            return;
        }
        if (isPending) {
            Alert.alert('Pending Review', 'Your verification request is currently under review by the administrator.');
            return;
        }
        setShowConfirmModal(true);
    };

    const confirmPurchase = async () => {
        if (!user) return;
        setShowConfirmModal(false);
        setPurchasing(true);

        try {
            // Simulate payment processing
            await new Promise(resolve => setTimeout(resolve, 1500));

            const paymentRef = `QIIRA_${Date.now()}`;
            await vendorAPI.purchaseBadge(
                user.uid,
                paymentRef
            );

            setIsPending(true);
            setIsVerified(false);

            Alert.alert(
                '⏳ Payment Submitted for Review',
                'Your payment reference has been submitted to the QIIRA administration. Your verified golden badge will be activated as soon as it is verified!'
            );
        } catch (error) {
            console.error('Badge purchase error:', error);
            Alert.alert('Error', 'Failed to process payment. Please try again.');
        } finally {
            setPurchasing(false);
        }
    };

    const getExpiryText = () => {
        if (!expiresAt) return null;
        const expiry = new Date(expiresAt);
        const now = new Date();
        const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 0) return 'Expired';
        if (daysLeft === 1) return '1 day remaining';
        return `${daysLeft} days remaining`;
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        );
    }

    const price = badgeInfo?.price || 3000;
    const currency = badgeInfo?.currency || '₦';

    return (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <LinearGradient
                    colors={BADGE_GRADIENT as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.headerBadgeCircle}
                >
                    <Ionicons name="checkmark-circle" size={48} color="#FFF" />
                </LinearGradient>
                <Text style={styles.title}>Get Verified</Text>
                <Text style={styles.subtitle}>
                    {userRole === 'vendor'
                        ? 'Build trust with your customers'
                        : 'Stand out in the community'}
                </Text>
            </View>

            {/* Current Status Banner */}
            {isVerified ? (
                <LinearGradient
                    colors={[QIIRA_PALETTE.shade20, QIIRA_PALETTE.base] as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.statusBanner}
                >
                    <View style={styles.statusContent}>
                        <Ionicons name="checkmark-circle" size={24} color="#FFF" />
                        <View style={styles.statusTextContainer}>
                            <Text style={styles.statusTitle}>You're Verified! ✓</Text>
                            {expiresAt && (
                                <Text style={styles.statusExpiry}>
                                    {getExpiryText()}
                                </Text>
                            )}
                        </View>
                    </View>
                </LinearGradient>
            ) : isPending ? (
                <View style={[styles.statusBanner, { backgroundColor: '#B28A4520', borderColor: '#B28A45', borderWidth: 1 }]}>
                    <View style={styles.statusContent}>
                        <Ionicons name="time" size={24} color="#B28A45" />
                        <View style={styles.statusTextContainer}>
                            <Text style={[styles.statusTitle, { color: '#B28A45' }]}>⏳ Application Under Review</Text>
                            <Text style={[styles.statusExpiry, { color: colors.textSecondary }]}>
                                Your payment reference has been submitted. An admin will verify and activate your Golden Badge.
                            </Text>
                        </View>
                    </View>
                </View>
            ) : null}

            {/* Main Card */}
            <View style={styles.mainCard}>
                {/* Price Section */}
                <LinearGradient
                    colors={BADGE_GRADIENT as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.priceSection}
                >
                    <Ionicons name="checkmark-circle" size={36} color="#FFF" />
                    <Text style={styles.badgeLabel}>Verified Badge</Text>
                    <View style={styles.priceRow}>
                        <Text style={styles.priceCurrency}>{currency}</Text>
                        <Text style={styles.priceAmount}>{price.toLocaleString()}</Text>
                        <Text style={styles.pricePeriod}>{badgeInfo?.period || '/month'}</Text>
                    </View>
                </LinearGradient>

                {/* Benefits List */}
                <View style={styles.benefitsContainer}>
                    <Text style={styles.benefitsTitle}>What you get</Text>
                    {BADGE_BENEFITS.map((benefit, index) => (
                        <View key={index} style={styles.benefitRow}>
                            <View style={styles.benefitIconCircle}>
                                <Ionicons
                                    name={benefit.icon as any}
                                    size={18}
                                    color={QIIRA_PALETTE.base}
                                />
                            </View>
                            <Text style={styles.benefitText}>{benefit.text}</Text>
                        </View>
                    ))}
                </View>

                {/* CTA Button */}
                <TouchableOpacity
                    style={[
                        styles.ctaButton,
                        (isVerified || isPending) && styles.ctaButtonVerified,
                    ]}
                    onPress={handlePurchase}
                    disabled={purchasing || isVerified || isPending}
                >
                    {purchasing ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <LinearGradient
                            colors={(isVerified || isPending) ? [colors.surfaceLight, colors.surfaceLight] as any : BADGE_GRADIENT as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.ctaGradient}
                        >
                            <Ionicons
                                name={isVerified ? 'checkmark-circle' : isPending ? 'time' : 'card'}
                                size={20}
                                color={(isVerified || isPending) ? QIIRA_PALETTE.base : '#FFF'}
                            />
                            <Text style={[
                                styles.ctaText,
                                (isVerified || isPending) && { color: QIIRA_PALETTE.base },
                            ]}>
                                {isVerified ? 'Already Verified ✓' : isPending ? '⏳ Verification Pending Admin Review' : 'Get Verified Now'}
                            </Text>
                        </LinearGradient>
                    )}
                </TouchableOpacity>
            </View>

            {/* How It Works */}
            <View style={styles.howItWorks}>
                <Text style={styles.sectionTitle}>How it works</Text>
                {[
                    { step: '1', title: 'Pay the verification fee', desc: `One-time payment of ${currency}${price.toLocaleString()}/month` },
                    { step: '2', title: 'Admin reviews your payment', desc: 'Our team verifies your payment' },
                    { step: '3', title: 'Badge activated!', desc: 'Your verified badge appears on your profile' },
                ].map((item, index) => (
                    <View key={index} style={styles.stepRow}>
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

            {/* Footer Note */}
            <View style={styles.footer}>
                <Ionicons name="information-circle-outline" size={16} color={colors.textTertiary} />
                <Text style={styles.footerText}>
                    Badge subscription renews monthly. Cancel anytime from your profile settings.
                </Text>
            </View>

            {/* Confirmation Modal */}
            <Modal
                visible={showConfirmModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowConfirmModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <LinearGradient
                            colors={BADGE_GRADIENT as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.modalHeader}
                        >
                            <Ionicons name="checkmark-circle" size={48} color="#FFF" />
                            <Text style={styles.modalTitle}>Get Verified</Text>
                        </LinearGradient>

                        <View style={styles.modalBody}>
                            <Text style={styles.modalPriceLabel}>Total Due Today</Text>
                            <Text style={styles.modalPrice}>
                                {currency}{price.toLocaleString()}
                            </Text>
                            <Text style={styles.modalPriceSub}>
                                Billed monthly • Cancel anytime
                            </Text>

                            <View style={styles.modalActions}>
                                <TouchableOpacity
                                    style={styles.modalCancelButton}
                                    onPress={() => setShowConfirmModal(false)}
                                >
                                    <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>
                                        Cancel
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.modalConfirmButton, { backgroundColor: QIIRA_PALETTE.base }]}
                                    onPress={confirmPurchase}
                                >
                                    <Text style={styles.modalConfirmText}>
                                        Pay & Verify
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}

const getStyles = (colors: any, theme: string) => StyleSheet.create({
    scrollView: {
        flex: 1,
        backgroundColor: colors.background,
    },
    container: {
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
        width: width - SPACING.xl * 2,
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
