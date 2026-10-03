import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    TextInput,
    Alert,
    ActivityIndicator,
    Image,
    ScrollView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { vendorAPI } from '../services/api';

interface VendorAdvertModalProps {
    visible: boolean;
    onClose: () => void;
    vendorId: string;
    post: {
        id: string;
        caption?: string;
        mediaUrl?: string;
        thumbnailUrl?: string;
        price?: number | string;
    };
    onSuccess?: () => void;
}

const ADVERT_PLANS = [
    { id: 'starter_3d', name: 'Starter Boost (3 Days)', price: '₦2,500', days: 3, badge: 'Popular' },
    { id: 'growth_7d', name: 'Growth Campaign (7 Days)', price: '₦5,000', days: 7, badge: 'Recommended' },
    { id: 'pro_14d', name: 'Pro Spotlight (14 Days)', price: '₦9,500', days: 14, badge: 'Best Value' },
    { id: 'ultimate_30d', name: 'Monthly Domination (30 Days)', price: '₦18,000', days: 30, badge: 'Top Reach' },
];

export default function VendorAdvertModal({
    visible,
    onClose,
    vendorId,
    post,
    onSuccess,
}: VendorAdvertModalProps) {
    const { colors } = useTheme();
    const [selectedPlan, setSelectedPlan] = useState(ADVERT_PLANS[1]);
    const [targetNotes, setTargetNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            await vendorAPI.requestAdvert(vendorId, {
                postId: post.id,
                postCaption: post.caption,
                mediaUrl: post.mediaUrl || post.thumbnailUrl,
                plan: selectedPlan.name,
                durationDays: selectedPlan.days,
                notes: targetNotes,
            });

            Alert.alert(
                'Advert Request Submitted! 🚀',
                `Your request for ${selectedPlan.name} has been submitted to QIIRA Administration for activation. Once approved, your post will receive a "Sponsored ✨" badge and top ranking in Explore feeds!`,
                [
                    {
                        text: 'Great',
                        onPress: () => {
                            onSuccess?.();
                            onClose();
                        },
                    },
                ]
            );
        } catch (error: any) {
            console.error('Submit advert error:', error);
            Alert.alert('Error', error.message || 'Failed to submit advert request. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={[styles.content, { backgroundColor: colors.surface }]}>
                    <View style={styles.header}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="rocket" size={24} color="#B28A45" />
                            <Text style={[styles.title, { color: colors.textPrimary }]}>Promote / Advert Post</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} disabled={submitting}>
                            <Ionicons name="close" size={24} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Post Preview */}
                        <View style={[styles.postPreview, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
                            <Image
                                source={{ uri: post.mediaUrl || post.thumbnailUrl || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200' }}
                                style={styles.postImage}
                            />
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.postCaption, { color: colors.textPrimary }]} numberOfLines={2}>
                                    {post.caption || 'Product listing'}
                                </Text>
                                {post.price ? (
                                    <Text style={[styles.postPrice, { color: colors.primary }]}>
                                        ₦{Number(post.price).toLocaleString()}
                                    </Text>
                                ) : null}
                            </View>
                        </View>

                        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Select Promotion Package</Text>
                        <View style={styles.plansContainer}>
                            {ADVERT_PLANS.map((plan) => (
                                <TouchableOpacity
                                    key={plan.id}
                                    style={[
                                        styles.planCard,
                                        { borderColor: colors.border },
                                        selectedPlan.id === plan.id && { borderColor: '#B28A45', backgroundColor: 'rgba(178, 138, 69, 0.12)' },
                                    ]}
                                    onPress={() => setSelectedPlan(plan)}
                                >
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Text style={[styles.planName, { color: colors.textPrimary }]}>{plan.name}</Text>
                                            {plan.badge ? (
                                                <View style={styles.planBadge}>
                                                    <Text style={styles.planBadgeText}>{plan.badge}</Text>
                                                </View>
                                            ) : null}
                                        </View>
                                        <Text style={[styles.planPrice, { color: '#B28A45' }]}>{plan.price}</Text>
                                    </View>
                                    <Ionicons
                                        name={selectedPlan.id === plan.id ? 'radio-button-on' : 'radio-button-off'}
                                        size={20}
                                        color={selectedPlan.id === plan.id ? '#B28A45' : colors.textTertiary}
                                    />
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: SPACING.md }]}>Target Audience / Special Instructions (Optional)</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.border }]}
                            placeholder="e.g. Target buyers in Abuja, promote during weekend sale..."
                            placeholderTextColor={colors.textTertiary}
                            multiline
                            numberOfLines={2}
                            value={targetNotes}
                            onChangeText={setTargetNotes}
                        />

                        <TouchableOpacity
                            style={[styles.submitButton, submitting && { opacity: 0.7 }]}
                            onPress={handleSubmit}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <>
                                    <Ionicons name="sparkles" size={18} color="#FFFFFF" />
                                    <Text style={styles.submitButtonText}>Request Promotion for {selectedPlan.price}</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'flex-end',
    },
    content: {
        borderTopLeftRadius: BORDER_RADIUS.xl,
        borderTopRightRadius: BORDER_RADIUS.xl,
        padding: SPACING.lg,
        maxHeight: '85%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.md,
    },
    title: {
        fontSize: FONT_SIZES.lg,
        fontWeight: 'bold',
    },
    postPreview: {
        flexDirection: 'row',
        gap: 12,
        padding: 10,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        marginBottom: SPACING.md,
        alignItems: 'center',
    },
    postImage: {
        width: 60,
        height: 60,
        borderRadius: BORDER_RADIUS.sm,
    },
    postCaption: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 4,
    },
    postPrice: {
        fontSize: 14,
        fontWeight: 'bold',
    },
    sectionLabel: {
        fontSize: FONT_SIZES.xs,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        marginBottom: SPACING.xs,
        letterSpacing: 0.5,
    },
    plansContainer: {
        gap: 8,
    },
    planCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1.5,
        borderRadius: BORDER_RADIUS.md,
        padding: 12,
    },
    planName: {
        fontSize: 13,
        fontWeight: 'bold',
    },
    planPrice: {
        fontSize: 13,
        fontWeight: 'bold',
        marginTop: 2,
    },
    planBadge: {
        backgroundColor: '#B28A4525',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    planBadgeText: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#B28A45',
    },
    input: {
        borderWidth: 1,
        borderRadius: BORDER_RADIUS.md,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: FONT_SIZES.sm,
        minHeight: 60,
        textAlignVertical: 'top',
        marginBottom: SPACING.md,
    },
    submitButton: {
        backgroundColor: '#B28A45',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: BORDER_RADIUS.md,
        gap: 8,
        marginTop: SPACING.xs,
        marginBottom: SPACING.md,
    },
    submitButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: FONT_SIZES.md,
    },
});
