import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    TouchableOpacity,
    Image,
    RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { vendorAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { PLACEHOLDER_AVATARS } from '../assets';
import { AvatarVerificationBadge, VerificationBadgeInline } from '../components/VerificationBadge';
import TabSwipeHandler from '../components/TabSwipeHandler';

interface Review {
    id: string;
    rating: number;
    comment: string;
    createdAt: string;
    clientName?: string;
    reviewerName?: string;
    reviewerAvatar?: string;
    clientAvatar?: string;
    clientId?: string;
    isVerified?: boolean;
    isAdmin?: boolean;
}

interface PostComment {
    id: string;
    postId: string;
    postCaption?: string;
    postMediaUrl?: string;
    userId: string;
    userName: string;
    userAvatar?: string;
    text: string;
    createdAt: string;
    isVerified?: boolean;
    isAdmin?: boolean;
}

export default function VendorReviewsScreen({ navigation }: any) {
    const { colors } = useTheme();
    const styles = getStyles(colors);
    const { user } = useAuthStore();

    const [activeTab, setActiveTab] = useState<'reviews' | 'comments'>('reviews');
    const [reviews, setReviews] = useState<Review[]>([]);
    const [comments, setComments] = useState<PostComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async () => {
        if (!user) return;
        try {
            const [revRes, commRes]: any = await Promise.all([
                vendorAPI.getReviews(user.uid).catch(() => ({ data: { reviews: [] } })),
                vendorAPI.getComments(user.uid).catch(() => ({ data: { comments: [] } })),
            ]);
            setReviews(revRes.data?.reviews || []);
            setComments(commRes.data?.comments || []);
        } catch (error) {
            console.error('Error fetching vendor reviews & comments:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchData();
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

    const renderReviewItem = ({ item }: { item: Review }) => {
        const reviewerAvatar = item.reviewerAvatar || item.clientAvatar;
        const name = item.reviewerName || item.clientName || 'Client';

        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={{ position: 'relative' }}>
                        <Image
                            source={reviewerAvatar ? { uri: reviewerAvatar } : PLACEHOLDER_AVATARS.client}
                            style={styles.avatarImage}
                        />
                        <AvatarVerificationBadge
                            isVerified={Boolean(item.isVerified)}
                            isAdmin={Boolean(item.isAdmin)}
                            size={14}
                        />
                    </View>
                    <View style={styles.cardInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={[styles.userName, { flexShrink: 1 }]}>{name}</Text>
                            <VerificationBadgeInline
                                isVerified={Boolean(item.isVerified)}
                                isAdmin={Boolean(item.isAdmin)}
                                size={14}
                            />
                        </View>
                        <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
                    </View>
                    <Text style={styles.ratingStars}>{renderStars(item.rating)}</Text>
                </View>
                <Text style={styles.commentBody}>{item.comment}</Text>
            </View>
        );
    };

    const renderCommentItem = ({ item }: { item: PostComment }) => {
        const userAvatar = item.userAvatar;
        const name = item.userName || 'Client';

        return (
            <View style={styles.card}>
                {/* Associated Post Banner */}
                {item.postCaption || item.postMediaUrl ? (
                    <View style={styles.postContextBanner}>
                        {item.postMediaUrl ? (
                            <Image source={{ uri: item.postMediaUrl }} style={styles.postThumb} />
                        ) : (
                            <Ionicons name="images-outline" size={16} color={colors.primary} />
                        )}
                        <Text style={styles.postContextText} numberOfLines={1}>
                            On: {item.postCaption || 'Product Showcase'}
                        </Text>
                    </View>
                ) : null}

                <View style={styles.cardHeader}>
                    <View style={{ position: 'relative' }}>
                        <Image
                            source={userAvatar ? { uri: userAvatar } : PLACEHOLDER_AVATARS.client}
                            style={styles.avatarImage}
                        />
                        <AvatarVerificationBadge
                            isVerified={Boolean(item.isVerified)}
                            isAdmin={Boolean(item.isAdmin)}
                            size={14}
                        />
                    </View>
                    <View style={styles.cardInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={[styles.userName, { flexShrink: 1 }]}>{name}</Text>
                            <VerificationBadgeInline
                                isVerified={Boolean(item.isVerified)}
                                isAdmin={Boolean(item.isAdmin)}
                                size={14}
                            />
                        </View>
                        <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
                    </View>

                    {/* Chat with commenter */}
                    {navigation && (
                        <TouchableOpacity
                            style={styles.chatActionBtn}
                            onPress={() => navigation.navigate('Chat', {
                                otherUserId: item.userId,
                                otherUserName: name,
                                otherUserImage: userAvatar,
                                receiverId: item.userId,
                                receiverName: name,
                                receiverImage: userAvatar,
                            })}
                        >
                            <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primary} />
                            <Text style={styles.chatActionText}>Reply</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <Text style={styles.commentBody}>{item.text}</Text>
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <TabSwipeHandler currentTab="Reviews" navigation={navigation}>
            <View style={styles.container}>
            {/* Stats Header */}
            <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{reviews.length}</Text>
                    <Text style={styles.statLabel}>Store Reviews</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>
                        {reviews.length > 0
                            ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
                            : '0'}
                    </Text>
                    <Text style={styles.statLabel}>Avg Rating ⭐</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{comments.length}</Text>
                    <Text style={styles.statLabel}>Post Comments</Text>
                </View>
            </View>

            {/* Segmented Switcher Tab */}
            <View style={styles.tabSwitcher}>
                <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'reviews' && styles.tabButtonActive]}
                    onPress={() => setActiveTab('reviews')}
                    activeOpacity={0.8}
                >
                    <Ionicons
                        name="star"
                        size={16}
                        color={activeTab === 'reviews' ? colors.textInverse : colors.textSecondary}
                    />
                    <Text style={[styles.tabButtonText, activeTab === 'reviews' && styles.tabButtonTextActive]}>
                        Reviews ({reviews.length})
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'comments' && styles.tabButtonActive]}
                    onPress={() => setActiveTab('comments')}
                    activeOpacity={0.8}
                >
                    <Ionicons
                        name="chatbubbles"
                        size={16}
                        color={activeTab === 'comments' ? colors.textInverse : colors.textSecondary}
                    />
                    <Text style={[styles.tabButtonText, activeTab === 'comments' && styles.tabButtonTextActive]}>
                        Comments ({comments.length})
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Content List */}
            {activeTab === 'reviews' ? (
                reviews.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="star-outline" size={48} color={colors.textTertiary} />
                        <Text style={styles.emptyText}>No reviews yet</Text>
                        <Text style={styles.emptySubtext}>
                            Ratings and reviews left by clients will appear here.
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        data={reviews}
                        keyExtractor={(item) => item.id}
                        renderItem={renderReviewItem}
                        contentContainerStyle={styles.listContent}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                        }
                    />
                )
            ) : (
                comments.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="chatbubbles-outline" size={48} color={colors.textTertiary} />
                        <Text style={styles.emptyText}>No post comments yet</Text>
                        <Text style={styles.emptySubtext}>
                            Comments from clients and vendors on your showcase posts will appear here.
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        data={comments}
                        keyExtractor={(item) => item.id}
                        renderItem={renderCommentItem}
                        contentContainerStyle={styles.listContent}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                        }
                    />
                )
            )}
        </View>
        </TabSwipeHandler>
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
        backgroundColor: colors.surface,
        paddingVertical: SPACING.md,
        paddingHorizontal: SPACING.lg,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        justifyContent: 'space-around',
    },
    statItem: {
        alignItems: 'center',
    },
    statNumber: {
        fontSize: FONT_SIZES.xl,
        fontWeight: 'bold',
        color: colors.primary,
    },
    statLabel: {
        fontSize: FONT_SIZES.xs,
        color: colors.textSecondary,
        marginTop: 2,
    },
    tabSwitcher: {
        flexDirection: 'row',
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        gap: SPACING.sm,
        backgroundColor: colors.background,
    },
    tabButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    tabButtonActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    tabButtonText: {
        fontSize: FONT_SIZES.xs,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    tabButtonTextActive: {
        color: colors.textInverse,
    },
    listContent: {
        padding: SPACING.md,
        gap: SPACING.sm,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        marginBottom: SPACING.sm,
        borderWidth: 1,
        borderColor: colors.border,
        ...SHADOWS.small,
    },
    postContextBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.background,
        paddingHorizontal: SPACING.sm,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.sm,
        marginBottom: SPACING.sm,
    },
    postThumb: {
        width: 24,
        height: 24,
        borderRadius: 4,
        backgroundColor: colors.surfaceLight,
    },
    postContextText: {
        fontSize: FONT_SIZES.xs,
        color: colors.textSecondary,
        flex: 1,
        fontStyle: 'italic',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.xs,
    },
    avatarImage: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.surfaceLight,
    },
    cardInfo: {
        flex: 1,
        marginLeft: SPACING.sm,
    },
    userName: {
        fontSize: FONT_SIZES.sm,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    dateText: {
        fontSize: FONT_SIZES.xs,
        color: colors.textTertiary,
        marginTop: 2,
    },
    ratingStars: {
        fontSize: FONT_SIZES.sm,
    },
    commentBody: {
        fontSize: FONT_SIZES.sm,
        color: colors.textPrimary,
        lineHeight: 20,
        marginTop: 4,
    },
    chatActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: colors.background,
        paddingHorizontal: SPACING.sm,
        paddingVertical: 5,
        borderRadius: BORDER_RADIUS.round,
        borderWidth: 1,
        borderColor: colors.border,
    },
    chatActionText: {
        fontSize: FONT_SIZES.xs,
        fontWeight: '600',
        color: colors.primary,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACING.xl,
        marginTop: 60,
    },
    emptyText: {
        fontSize: FONT_SIZES.md,
        fontWeight: 'bold',
        color: colors.textSecondary,
        marginTop: SPACING.md,
    },
    emptySubtext: {
        fontSize: FONT_SIZES.xs,
        color: colors.textTertiary,
        textAlign: 'center',
        marginTop: SPACING.xs,
    },
});
