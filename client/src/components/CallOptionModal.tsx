import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Image,
    Linking,
    Alert,
    Dimensions,
    Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../store/authStore';
import { useCallStore } from '../store/callStore';
import { PLACEHOLDER_AVATARS } from '../assets';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { VerificationBadgeInline, AvatarVerificationBadge } from './VerificationBadge';

const { width } = Dimensions.get('window');

interface CallOptionModalProps {
    visible: boolean;
    vendor: any;
    onClose: () => void;
    navigation: any;
}

export default function CallOptionModal({
    visible,
    vendor,
    onClose,
    navigation,
}: CallOptionModalProps) {
    const { colors } = useTheme();
    const styles = getStyles(colors);
    const { user } = useAuthStore();
    const { startCall } = useCallStore();

    if (!vendor) return null;

    const vendorId = vendor.id || vendor.uid || (vendor as any)?.userInfo?.uid || '';
    const businessName = vendor.businessName || vendor.business_name || (vendor as any)?.userInfo?.fullName || 'Vendor';
    const imageUri = vendor.businessImage || vendor.business_image || (vendor as any)?.userInfo?.profileImage;
    const phoneNumber = vendor.phoneNumber || vendor.phone_number || (vendor as any)?.userInfo?.phoneNumber || '';
    const isVendorAdmin = vendor.role === 'admin' || (vendor as any)?.userInfo?.role === 'admin' || vendorId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2';
    const isVendorVerified = Boolean(vendor.isVerified || vendor.is_verified || (vendor as any)?.userInfo?.isVerified || isVendorAdmin);
    const category = vendor.category || 'Services';

    const handleInitiateOnlineCall = async (callType: 'voice' | 'video') => {
        if (!user) {
            Alert.alert('Sign In Required', 'Please sign in to make online calls.');
            return;
        }

        onClose();

        try {
            const call = await startCall({
                callerId: user.uid,
                callerName: user.displayName || user.email?.split('@')[0] || 'User',
                callerAvatar: user.photoURL || '',
                receiverId: vendorId,
                receiverName: businessName,
                receiverAvatar: imageUri || '',
                callType,
            });

            navigation.navigate('CallScreen', {
                callId: call.id,
                callType,
                otherUserId: vendorId,
                otherUserName: businessName,
                otherUserAvatar: imageUri || '',
                isVerified: isVendorVerified,
                isAdmin: isVendorAdmin,
                isIncoming: false,
            });
        } catch (error) {
            console.error('Error starting online call:', error);
            Alert.alert('Call Error', 'Could not initiate online call. Please try again.');
        }
    };

    const handleDirectPhoneCall = () => {
        onClose();
        if (phoneNumber) {
            Linking.openURL(`tel:${phoneNumber}`).catch(() => {
                Alert.alert('Dialer Error', 'Unable to open phone dialer on this device.');
            });
        } else {
            Alert.alert('No Phone Number', 'This vendor has not provided a cellular phone number.');
        }
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={styles.backdrop}
                activeOpacity={1}
                onPress={onClose}
            >
                <TouchableOpacity
                    style={styles.sheetContainer}
                    activeOpacity={1}
                    onPress={(e) => e.stopPropagation?.()}
                >
                    {/* Sheet Handle */}
                    <View style={styles.sheetHandle} />

                    {/* Header with Vendor Info & Close Button */}
                    <View style={styles.header}>
                        <View style={styles.vendorRow}>
                            <View style={{ position: 'relative', marginRight: 12 }}>
                                <Image
                                    source={imageUri ? { uri: imageUri } : PLACEHOLDER_AVATARS.vendor}
                                    style={styles.avatar}
                                />
                                <AvatarVerificationBadge
                                    isVerified={isVendorVerified}
                                    isAdmin={isVendorAdmin}
                                    size={16}
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={styles.businessName} numberOfLines={1}>
                                        {businessName}
                                    </Text>
                                    <VerificationBadgeInline
                                        isVerified={isVendorVerified}
                                        isAdmin={isVendorAdmin}
                                        size={16}
                                    />
                                </View>
                                <Text style={styles.categoryText}>{category}</Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={styles.closeBtn}
                            onPress={onClose}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Ionicons name="close" size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.modalTitle}>Choose Call Method</Text>

                    {/* Option 1: Online Voice Call */}
                    <TouchableOpacity
                        style={styles.optionCard}
                        onPress={() => handleInitiateOnlineCall('voice')}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.iconCircle, { backgroundColor: '#34C75918' }]}>
                            <Ionicons name="call" size={22} color="#34C759" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={styles.optionTitle}>Online Voice Call</Text>
                                <View style={styles.freeBadge}>
                                    <Text style={styles.freeBadgeText}>FREE</Text>
                                </View>
                            </View>
                            <Text style={styles.optionSubtitle}>Free high-quality audio call via QIIRA</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                    </TouchableOpacity>

                    {/* Option 2: Online Video Call */}
                    <TouchableOpacity
                        style={styles.optionCard}
                        onPress={() => handleInitiateOnlineCall('video')}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}18` }]}>
                            <Ionicons name="videocam" size={22} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={styles.optionTitle}>Online Video Call</Text>
                                <View style={styles.freeBadge}>
                                    <Text style={styles.freeBadgeText}>FREE</Text>
                                </View>
                            </View>
                            <Text style={styles.optionSubtitle}>Free HD video & audio call via QIIRA</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                    </TouchableOpacity>

                    {/* Option 3: Direct Phone Call */}
                    <TouchableOpacity
                        style={styles.optionCard}
                        onPress={handleDirectPhoneCall}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.iconCircle, { backgroundColor: '#B28A4518' }]}>
                            <Ionicons name="phone-portrait" size={22} color="#B28A45" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.optionTitle}>Direct Cellular Call</Text>
                            <Text style={styles.optionSubtitle} numberOfLines={1}>
                                {phoneNumber ? `Dial: ${phoneNumber}` : 'Standard carrier phone call'}
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                    </TouchableOpacity>

                    {/* Back / Cancel Button */}
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={onClose}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="arrow-back-outline" size={18} color={colors.textPrimary} style={{ marginRight: 6 }} />
                        <Text style={styles.backButtonText}>Back / Cancel</Text>
                    </TouchableOpacity>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const getStyles = (colors: any) =>
    StyleSheet.create({
        backdrop: {
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            justifyContent: 'flex-end',
            alignItems: 'center',
        },
        sheetContainer: {
            width: '100%',
            maxWidth: 540,
            backgroundColor: colors.surface,
            borderTopLeftRadius: BORDER_RADIUS.xl,
            borderTopRightRadius: BORDER_RADIUS.xl,
            borderTopWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: SPACING.lg,
            paddingTop: SPACING.sm,
            paddingBottom: Platform.OS === 'ios' ? 36 : SPACING.xl,
            ...SHADOWS.large,
        },
        sheetHandle: {
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.border,
            alignSelf: 'center',
            marginBottom: SPACING.md,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: SPACING.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            marginBottom: SPACING.md,
        },
        vendorRow: {
            flexDirection: 'row',
            alignItems: 'center',
            flex: 1,
            marginRight: 8,
        },
        avatar: {
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: colors.surfaceLight,
        },
        businessName: {
            fontSize: FONT_SIZES.md,
            fontWeight: '700',
            color: colors.textPrimary,
            marginRight: 4,
            flexShrink: 1,
        },
        categoryText: {
            fontSize: FONT_SIZES.xs,
            color: colors.textSecondary,
            marginTop: 2,
        },
        closeBtn: {
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: colors.surfaceLight,
            alignItems: 'center',
            justifyContent: 'center',
        },
        modalTitle: {
            fontSize: FONT_SIZES.sm,
            fontWeight: '600',
            color: colors.textSecondary,
            marginBottom: SPACING.md,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        },
        optionCard: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surfaceLight,
            borderRadius: BORDER_RADIUS.lg,
            borderWidth: 1,
            borderColor: colors.border,
            padding: SPACING.md,
            marginBottom: SPACING.sm,
        },
        iconCircle: {
            width: 44,
            height: 44,
            borderRadius: 22,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: SPACING.md,
        },
        optionTitle: {
            fontSize: FONT_SIZES.md,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        optionSubtitle: {
            fontSize: FONT_SIZES.xs,
            color: colors.textSecondary,
            marginTop: 2,
        },
        freeBadge: {
            backgroundColor: '#34C75920',
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 4,
        },
        freeBadgeText: {
            fontSize: 9,
            fontWeight: '800',
            color: '#34C759',
        },
        backButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceLight,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BORDER_RADIUS.md,
            paddingVertical: SPACING.md,
            marginTop: SPACING.sm,
        },
        backButtonText: {
            fontSize: FONT_SIZES.sm,
            fontWeight: '700',
            color: colors.textPrimary,
        },
    });
