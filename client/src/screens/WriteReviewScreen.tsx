import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { vendorAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { VerificationBadgeInline } from '../components/VerificationBadge';

export default function WriteReviewScreen({ route, navigation }: any) {
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const { vendorId, businessName } = route.params;
    const { user } = useAuthStore();
    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!user) {
            Alert.alert('Error', 'You must be logged in to leave a review');
            return;
        }

        setSubmitting(true);
        try {
            await vendorAPI.addReview(vendorId, {
                userId: user.uid,
                clientId: user.uid,
                rating,
                comment,
                userName: user.displayName || 'Anonymous User',
                userImage: user.photoURL || undefined,
            });

            Alert.alert('Success', 'Thank you for your review!', [
                { text: 'OK', onPress: () => navigation.goBack() }
            ]);
        } catch (error: any) {
            console.error('Error submitting review:', error);
            Alert.alert('Error', error.response?.data?.message || 'Failed to submit review');
        } finally {
            setSubmitting(false);
        }
    };

    const renderStars = () => {
        return (
            <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity key={star} onPress={() => setRating(star)}>
                        <Text style={[styles.star, star <= rating && styles.activeStar]}>
                            {star <= rating ? '⭐' : '☆'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        );
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.content}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={styles.title}>Review {businessName}</Text>
                    <VerificationBadgeInline isVerified={Boolean(route.params?.isVerified ?? true)} size={18} />
                </View>
                <Text style={styles.subtitle}>How was your experience?</Text>

                {renderStars()}

                <Text style={styles.label}>Comment (Optional)</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Share your experience..."
                    placeholderTextColor={colors.textTertiary}
                    value={comment}
                    onChangeText={setComment}
                    multiline
                    numberOfLines={5}
                />

                <TouchableOpacity
                    style={[styles.button, submitting && styles.buttonDisabled]}
                    onPress={handleSubmit}
                    disabled={submitting}
                >
                    {submitting ? (
                        <ActivityIndicator color={colors.textInverse} />
                    ) : (
                        <Text style={styles.buttonText}>Submit Review</Text>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        padding: SPACING.lg,
    },
    title: {
        fontSize: FONT_SIZES.xxl,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: SPACING.xs,
    },
    subtitle: {
        fontSize: FONT_SIZES.md,
        color: colors.textSecondary,
        marginBottom: SPACING.xl,
    },
    starsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: SPACING.xl,
        gap: 10,
    },
    star: {
        fontSize: 38,
        color: colors.textTertiary,
    },
    activeStar: {
        color: colors.primary,
    },
    label: {
        fontSize: FONT_SIZES.sm,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: SPACING.xs,
    },
    input: {
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        fontSize: FONT_SIZES.md,
        color: colors.textPrimary,
        borderWidth: 1,
        borderColor: colors.border,
        height: 120,
        textAlignVertical: 'top',
    },
    button: {
        backgroundColor: colors.primary,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        alignItems: 'center',
        marginTop: SPACING.xl,
    },
    buttonDisabled: {
        backgroundColor: colors.textTertiary,
    },
    buttonText: {
        color: colors.textInverse,
        fontSize: FONT_SIZES.lg,
        fontWeight: 'bold',
    },
});
