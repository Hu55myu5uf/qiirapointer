import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
} from 'react-native';
import { vendorAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { AvatarVerificationBadge, VerificationBadgeInline } from '../components/VerificationBadge';

interface Review {
    id: string;
    rating: number;
    comment: string;
    createdAt: string;
    clientName?: string;
    isVerified?: boolean;
    isAdmin?: boolean;
}

export default function VendorReviewsScreen() {
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const { user } = useAuthStore();
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchReviews();
    }, []);

    const fetchReviews = async () => {
        if (!user) return;
        try {
            const response = await vendorAPI.getReviews(user.uid);
            setReviews(response.data.reviews || []);
        } catch (error) {
            console.error('Error fetching reviews:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    };

    const renderStars = (rating: number) => {
        return '⭐'.repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? '½' : '');
    };

    const renderReview = ({ item }: { item: Review }) => (
        <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
                <View style={{ position: 'relative' }}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {item.clientName?.charAt(0)?.toUpperCase() || 'C'}
                        </Text>
                    </View>
                    <AvatarVerificationBadge
                        isVerified={Boolean(item.isVerified)}
                        isAdmin={Boolean(item.isAdmin)}
                        size={12}
                    />
                </View>
                <View style={styles.reviewInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={[styles.clientName, { flexShrink: 1 }]}>{item.clientName || 'Anonymous'}</Text>
                        <VerificationBadgeInline
                            isVerified={Boolean(item.isVerified)}
                            isAdmin={Boolean(item.isAdmin)}
                            size={12}
                        />
                    </View>
                    <Text style={styles.reviewDate}>{formatDate(item.createdAt)}</Text>
                </View>
                <Text style={styles.rating}>{renderStars(item.rating)}</Text>
            </View>
            <Text style={styles.comment}>{item.comment}</Text>
        </View>
    );

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Stats Header */}
            <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{reviews.length}</Text>
                    <Text style={styles.statLabel}>Total Reviews</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>
                        {reviews.length > 0
                            ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
                            : '0'}
                    </Text>
                    <Text style={styles.statLabel}>Average Rating</Text>
                </View>
            </View>

            {/* Reviews List */}
            {reviews.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>📝</Text>
                    <Text style={styles.emptyText}>No reviews yet</Text>
                    <Text style={styles.emptySubtext}>
                        Reviews from clients will appear here
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={reviews}
                    keyExtractor={(item) => item.id}
                    renderItem={renderReview}
                    contentContainerStyle={styles.listContent}
                />
            )}
        </View>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statsContainer: {
        flexDirection: 'row',
        padding: SPACING.lg,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statNumber: {
        fontSize: FONT_SIZES.xxl,
        fontWeight: 'bold',
        color: colors.primary,
    },
    statLabel: {
        fontSize: FONT_SIZES.sm,
        color: colors.textSecondary,
    },
    listContent: {
        padding: SPACING.lg,
    },
    reviewCard: {
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.lg,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: colors.border,
        ...SHADOWS.small,
    },
    reviewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.sm,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.md,
    },
    avatarText: {
        color: '#FFFFFF',
        fontSize: FONT_SIZES.md,
        fontWeight: 'bold',
    },
    reviewInfo: {
        flex: 1,
    },
    clientName: {
        fontSize: FONT_SIZES.md,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    reviewDate: {
        fontSize: FONT_SIZES.xs,
        color: colors.textSecondary,
        marginTop: 2,
    },
    rating: {
        fontSize: FONT_SIZES.sm,
    },
    comment: {
        fontSize: FONT_SIZES.sm,
        color: colors.textPrimary,
        lineHeight: 20,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: SPACING.xxl,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: SPACING.md,
    },
    emptyText: {
        fontSize: FONT_SIZES.lg,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: SPACING.xs,
    },
    emptySubtext: {
        fontSize: FONT_SIZES.sm,
        color: colors.textSecondary,
        textAlign: 'center',
    },
});
