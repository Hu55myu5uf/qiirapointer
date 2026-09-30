import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Image,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    RefreshControl,
    Modal,
    ScrollView,
    Platform,
    Alert,
    Dimensions,
    StatusBar,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { postAPI } from '../services/api';
import { sharePost, shareVendorProfile } from '../services/shareService';
import VerificationBadge, { AvatarVerificationBadge, VerificationBadgeInline } from '../components/VerificationBadge';
import CartButton from '../components/CartButton';
import { auth } from '../config/firebase';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Multi-media carousel component for posts with multiple images
function PostMediaCarousel({ item, colors, styles }: { item: any; colors: any; styles: any }) {
    const [activeIndex, setActiveIndex] = React.useState(0);
    const mediaList: string[] = (item.mediaUrls && item.mediaUrls.length > 0)
        ? item.mediaUrls
        : [item.mediaUrl || item.thumbnailUrl || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800'];
    const isReel = item.type === 'reel';
    const isMulti = mediaList.length > 1;
    const containerWidth = Math.min(SCREEN_WIDTH, 680);

    const handleScroll = (event: any) => {
        const x = event.nativeEvent.contentOffset.x;
        const idx = Math.round(x / containerWidth);
        setActiveIndex(idx);
    };

    return (
        <View style={styles.mediaContainer}>
            {isMulti ? (
                <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={handleScroll}
                    style={{ width: containerWidth }}
                >
                    {mediaList.map((url: string, idx: number) => (
                        <Image
                            key={idx}
                            source={{ uri: url }}
                            style={[styles.postMedia, { width: containerWidth }]}
                            resizeMode="cover"
                        />
                    ))}
                </ScrollView>
            ) : (
                <Image
                    source={{ uri: mediaList[0] }}
                    style={styles.postMedia}
                    resizeMode="cover"
                />
            )}

            {/* Reel badge */}
            {isReel && (
                <View style={styles.reelBadge}>
                    <Ionicons name="play" size={14} color="#fff" />
                    <Text style={styles.reelBadgeText}>REEL</Text>
                </View>
            )}

            {/* Multi-media counter badge */}
            {isMulti && (
                <View style={{
                    position: 'absolute', top: SPACING.sm, right: SPACING.sm,
                    backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 4,
                    borderRadius: BORDER_RADIUS.round, flexDirection: 'row', alignItems: 'center', gap: 4,
                }}>
                    <Ionicons name="images" size={12} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                        {activeIndex + 1}/{mediaList.length}
                    </Text>
                </View>
            )}

            {/* Pagination dots */}
            {isMulti && (
                <View style={{
                    position: 'absolute', bottom: 10, alignSelf: 'center',
                    flexDirection: 'row', gap: 5,
                }}>
                    {mediaList.map((_: string, idx: number) => (
                        <View key={idx} style={{
                            width: activeIndex === idx ? 18 : 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: activeIndex === idx ? colors.primary : 'rgba(255,255,255,0.6)',
                        }} />
                    ))}
                </View>
            )}

            {/* Price badge */}
            {item.price !== undefined && item.price !== null && item.price !== '' && Number(item.price) > 0 ? (
                <View style={styles.priceBadge}>
                    <Text style={styles.priceBadgeText}>
                        {item.currency === 'USD' ? '$' : '₦'}
                        {Number(item.price).toLocaleString()}
                    </Text>
                </View>
            ) : null}
        </View>
    );
}

const CATEGORIES = [
    'All',
    'Food & Dining',
    'Fashion & Retail',
    'Beauty & Spa',
    'Electronics',
    'Services',
    'Events',
];

export default function ExploreScreen({ navigation }: any) {
    const { colors } = useTheme();
    const { userRole } = useAuthStore();
    const { addItem, isInCart } = useCartStore();
    const styles = getStyles(colors);

    const [activeTab, setActiveTab] = useState<'feed' | 'reels'>('feed');
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState<boolean>(false);

    // Comments Modal State
    const [commentModalVisible, setCommentModalVisible] = useState<boolean>(false);
    const [activePost, setActivePost] = useState<any>(null);
    const [comments, setComments] = useState<any[]>([]);
    const [newCommentText, setNewCommentText] = useState<string>('');
    const [loadingComments, setLoadingComments] = useState<boolean>(false);
    const [submittingComment, setSubmittingComment] = useState<boolean>(false);

    const currentUserId = auth.currentUser?.uid;

    const fetchPosts = useCallback(async () => {
        try {
            setLoading(true);
            const params: any = {
                type: activeTab === 'reels' ? 'reel' : 'all',
                category: selectedCategory !== 'All' ? selectedCategory : undefined,
                userId: currentUserId,
            };

            const response = await postAPI.getFeed(params);
            setPosts(response.data.posts || []);
        } catch (error) {
            console.error('Fetch feed error:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [activeTab, selectedCategory, currentUserId]);

    useFocusEffect(
        useCallback(() => {
            fetchPosts();
        }, [fetchPosts])
    );

    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchPosts();
    };

    const handleLike = async (postId: string) => {
        if (!currentUserId) {
            Alert.alert('Sign In Required', 'Please sign in to like posts.');
            return;
        }

        // Optimistic UI update
        setPosts((prevPosts) =>
            prevPosts.map((post) => {
                if (post.id === postId) {
                    const newLiked = !post.isLiked;
                    return {
                        ...post,
                        isLiked: newLiked,
                        likesCount: newLiked ? post.likesCount + 1 : Math.max(0, post.likesCount - 1),
                    };
                }
                return post;
            })
        );

        try {
            await postAPI.likePost(postId, currentUserId);
        } catch (error) {
            console.error('Like error:', error);
            // Revert on error
            fetchPosts();
        }
    };

    const handleOpenComments = async (post: any) => {
        setActivePost(post);
        setCommentModalVisible(true);
        setLoadingComments(true);
        try {
            const response = await postAPI.getComments(post.id);
            setComments(response.data.comments || []);
        } catch (error) {
            console.error('Fetch comments error:', error);
        } finally {
            setLoadingComments(false);
        }
    };

    const handleAddComment = async () => {
        if (!newCommentText.trim() || !activePost) return;

        if (!currentUserId) {
            Alert.alert('Sign In Required', 'Please sign in to comment.');
            return;
        }

        setSubmittingComment(true);
        try {
            const userName = auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'User';
            const response = await postAPI.addComment(activePost.id, {
                userId: currentUserId,
                userName,
                userAvatar: auth.currentUser?.photoURL || '',
                text: newCommentText.trim(),
            });

            setComments((prev) => [response.data.comment, ...prev]);
            setNewCommentText('');

            // Increment count on active post & list
            setPosts((prev) =>
                prev.map((p) =>
                    p.id === activePost.id ? { ...p, commentsCount: (p.commentsCount || 0) + 1 } : p
                )
            );
        } catch (error) {
            console.error('Add comment error:', error);
            Alert.alert('Error', 'Failed to post comment');
        } finally {
            setSubmittingComment(false);
        }
    };

    const handleShare = async (post: any) => {
        await sharePost({
            postId: post.id,
            vendorName: post.vendorName,
            caption: post.caption,
            price: post.price,
            currency: post.currency,
            mediaUrl: post.mediaUrl,
        });
    };

    const handleDeletePost = async (postId: string) => {
        const userId = auth.currentUser?.uid;
        if (!userId) {
            Alert.alert('Authentication required', 'Please sign in to delete a post.');
            return;
        }

        const performDelete = async () => {
            try {
                await postAPI.deletePost(postId, { userId, role: userRole || 'client' });
                setPosts((prev) => prev.filter((p) => p.id !== postId));
                Alert.alert('Deleted', 'Post deleted successfully');
            } catch (error: any) {
                console.error('Delete post error:', error);
                const msg = error.response?.data?.error || error.message || 'Failed to delete post';
                Alert.alert('Error', msg);
            }
        };

        Alert.alert(
            'Delete Post',
            'Are you sure you want to permanently delete this post? This action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: performDelete },
            ]
        );
    };

    const filteredPosts = posts.filter((p) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            (p.caption || '').toLowerCase().includes(q) ||
            (p.vendorName || '').toLowerCase().includes(q) ||
            (p.category || '').toLowerCase().includes(q) ||
            (p.tags || []).some((t: string) => t.toLowerCase().includes(q))
        );
    });

    const renderPostItem = ({ item }: { item: any }) => {
        const isReel = item.type === 'reel';
        const canDelete = auth.currentUser?.uid === item.vendorId || userRole === 'admin';

        return (
            <View style={styles.postCard}>
                {/* Vendor Header */}
                <View style={styles.postHeader}>
                    <TouchableOpacity
                        style={styles.vendorInfoRow}
                        onPress={() => navigation.navigate('VendorDetails', { vendorId: item.vendorId })}
                        activeOpacity={0.8}
                    >
                        <View style={{ position: 'relative' }}>
                            <Image
                                source={{
                                    uri: item.vendorImage || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
                                }}
                                style={styles.vendorAvatar}
                            />
                            <AvatarVerificationBadge
                                isVerified={Boolean(item.isVerified || item.is_verified || item.isAdmin || item.role === 'admin' || item.vendorId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2')}
                                isAdmin={Boolean(item.isAdmin || item.role === 'admin' || item.vendorId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2')}
                                size={14}
                            />
                        </View>
                        <View style={styles.vendorTextContainer}>
                            <View style={styles.vendorNameRow}>
                                <Text style={styles.vendorName} numberOfLines={1}>
                                    {item.vendorName}
                                </Text>
                                <VerificationBadgeInline
                                    isVerified={Boolean(item.isVerified || item.is_verified || item.isAdmin || item.role === 'admin' || item.vendorId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2')}
                                    isAdmin={Boolean(item.isAdmin || item.role === 'admin' || item.vendorId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2')}
                                    size={16}
                                />
                            </View>
                            <Text style={styles.vendorCategory}>
                                {item.vendorCategory || item.category}
                            </Text>
                        </View>
                    </TouchableOpacity>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
                        <TouchableOpacity
                            style={styles.viewVendorButton}
                            onPress={() => navigation.navigate('VendorDetails', { vendorId: item.vendorId })}
                        >
                            <Text style={styles.viewVendorButtonText}>View Store</Text>
                        </TouchableOpacity>

                        {canDelete && (
                            <TouchableOpacity
                                style={{
                                    padding: 6,
                                    borderRadius: BORDER_RADIUS.sm,
                                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                    borderWidth: 1,
                                    borderColor: 'rgba(239, 68, 68, 0.3)',
                                }}
                                onPress={() => handleDeletePost(item.id)}
                            >
                                <Ionicons name="trash-outline" size={16} color={colors.error} />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Media Image(s) / Reel */}
                <PostMediaCarousel item={item} colors={colors} styles={styles} />

                {/* Action Bar */}
                <View style={styles.actionsBar}>
                    <View style={styles.leftActions}>
                        {/* Like Button */}
                        <TouchableOpacity
                            style={styles.actionIconButton}
                            onPress={() => handleLike(item.id)}
                            activeOpacity={0.7}
                        >
                            <Ionicons
                                name={item.isLiked ? 'heart' : 'heart-outline'}
                                size={24}
                                color={item.isLiked ? colors.error : colors.textPrimary}
                            />
                            <Text style={[styles.actionCount, item.isLiked && { color: colors.error }]}>
                                {item.likesCount || 0}
                            </Text>
                        </TouchableOpacity>

                        {/* Comment Button */}
                        <TouchableOpacity
                            style={styles.actionIconButton}
                            onPress={() => handleOpenComments(item)}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="chatbubble-outline" size={22} color={colors.textPrimary} />
                            <Text style={styles.actionCount}>{item.commentsCount || 0}</Text>
                        </TouchableOpacity>

                        {/* Share Button */}
                        <TouchableOpacity
                            style={styles.actionIconButton}
                            onPress={() => handleShare(item)}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="share-social-outline" size={22} color={colors.textPrimary} />
                        </TouchableOpacity>

                        {/* Add to Cart Button */}
                        <TouchableOpacity
                            style={styles.actionIconButton}
                            onPress={() => {
                                addItem({
                                    id: item.id,
                                    title: item.caption ? item.caption.substring(0, 45) : item.vendorName,
                                    caption: item.caption,
                                    mediaUrl: item.mediaUrl,
                                    price: item.price || 0,
                                    currency: item.currency || 'NGN',
                                    vendorId: item.vendorId,
                                    vendorName: item.vendorName,
                                }, currentUserId);
                                Alert.alert('Saved to Cart 🛒', `Saved "${item.vendorName}" product to your Cart!`);
                            }}
                            activeOpacity={0.7}
                        >
                            <Ionicons
                                name={isInCart(item.id) ? 'cart' : 'cart-outline'}
                                size={22}
                                color={isInCart(item.id) ? colors.primary : colors.textPrimary}
                            />
                        </TouchableOpacity>
                    </View>

                    {/* Chat with Vendor Button */}
                    <TouchableOpacity
                        style={styles.chatVendorButton}
                        onPress={() =>
                            navigation.navigate('Chat', {
                                otherUserId: item.vendorId,
                                otherUserName: item.vendorName,
                                otherUserImage: item.vendorImage,
                                receiverId: item.vendorId,
                                receiverName: item.vendorName,
                                receiverImage: item.vendorImage,
                                vendorId: item.vendorId,
                            })
                        }
                    >
                        <Ionicons name="chatbubbles-outline" size={16} color={colors.primary} />
                        <Text style={styles.chatVendorText}>Inquire</Text>
                    </TouchableOpacity>
                </View>

                {/* Caption & Tags */}
                <View style={styles.captionContainer}>
                    <Text style={styles.captionText}>
                        <Text style={styles.captionVendorName}>{item.vendorName} </Text>
                        {item.caption}
                    </Text>

                    {item.tags && item.tags.length > 0 && (
                        <View style={styles.tagsContainer}>
                            {item.tags.map((tag: string, i: number) => (
                                <Text key={i} style={styles.tagText}>
                                    #{tag}{' '}
                                </Text>
                            ))}
                        </View>
                    )}

                    <Text style={styles.timestampText}>
                        {new Date(item.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                        })}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerTitleRow}>
                    <Text style={styles.headerTitle}>Explore</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                        <CartButton />
                        {userRole === 'vendor' && (
                            <TouchableOpacity
                                style={styles.createPostHeaderButton}
                                onPress={() => navigation.navigate('CreatePost')}
                            >
                                <Ionicons name="add" size={20} color={colors.textInverse} />
                                <Text style={styles.createPostHeaderText}>New Post</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Search Bar */}
                <View style={styles.searchContainer}>
                    <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search products, services, reels..."
                        placeholderTextColor={colors.textTertiary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery ? (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                        </TouchableOpacity>
                    ) : null}
                </View>

                {/* Feed vs Reels Switcher */}
                <View style={styles.feedTypeSwitcher}>
                    <TouchableOpacity
                        style={[styles.switcherTab, activeTab === 'feed' && styles.switcherTabActive]}
                        onPress={() => setActiveTab('feed')}
                    >
                        <Ionicons
                            name="grid-outline"
                            size={16}
                            color={activeTab === 'feed' ? colors.textInverse : colors.textSecondary}
                        />
                        <Text
                            style={[
                                styles.switcherTabText,
                                activeTab === 'feed' && styles.switcherTabTextActive,
                            ]}
                        >
                            Explore Feed
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.switcherTab, activeTab === 'reels' && styles.switcherTabActive]}
                        onPress={() => setActiveTab('reels')}
                    >
                        <Ionicons
                            name="play-circle-outline"
                            size={16}
                            color={activeTab === 'reels' ? colors.textInverse : colors.textSecondary}
                        />
                        <Text
                            style={[
                                styles.switcherTabText,
                                activeTab === 'reels' && styles.switcherTabTextActive,
                            ]}
                        >
                            Short Reels 🎬
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Category Filter Chips */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categoriesContainer}
                >
                    {CATEGORIES.map((cat) => (
                        <TouchableOpacity
                            key={cat}
                            style={[
                                styles.categoryChip,
                                selectedCategory === cat && styles.categoryChipActive,
                            ]}
                            onPress={() => setSelectedCategory(cat)}
                        >
                            <Text
                                style={[
                                    styles.categoryChipText,
                                    selectedCategory === cat && styles.categoryChipTextActive,
                                ]}
                            >
                                {cat}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Posts / Reels List */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : filteredPosts.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="images-outline" size={56} color={colors.textTertiary} />
                    <Text style={styles.emptyTitle}>No posts found</Text>
                    <Text style={styles.emptySubtitle}>
                        Be the first vendor to share products and reels in this category!
                    </Text>
                    {userRole === 'vendor' && (
                        <TouchableOpacity
                            style={styles.emptyCreateButton}
                            onPress={() => navigation.navigate('CreatePost')}
                        >
                            <Text style={styles.emptyCreateButtonText}>Create Post</Text>
                        </TouchableOpacity>
                    )}
                </View>
            ) : (
                <FlatList
                    data={filteredPosts}
                    keyExtractor={(item) => item.id}
                    renderItem={renderPostItem}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                    }
                />
            )}

            {/* Comments Modal */}
            <Modal
                visible={commentModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setCommentModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        {/* Modal Header */}
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Comments</Text>
                            <TouchableOpacity onPress={() => setCommentModalVisible(false)}>
                                <Ionicons name="close" size={24} color={colors.textPrimary} />
                            </TouchableOpacity>
                        </View>

                        {/* Comments List */}
                        {loadingComments ? (
                            <View style={styles.commentsLoading}>
                                <ActivityIndicator size="small" color={colors.primary} />
                            </View>
                        ) : comments.length === 0 ? (
                            <View style={styles.noCommentsContainer}>
                                <Text style={styles.noCommentsText}>No comments yet. Be the first to comment!</Text>
                            </View>
                        ) : (
                            <FlatList
                                data={comments}
                                keyExtractor={(item) => item.id}
                                style={styles.commentsList}
                                renderItem={({ item }) => (
                                    <View style={styles.commentItem}>
                                        <View style={{ position: 'relative' }}>
                                            <Image
                                                source={{
                                                    uri: item.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
                                                }}
                                                style={styles.commentAvatar}
                                            />
                                            <AvatarVerificationBadge
                                                isVerified={Boolean(item.isVerified ?? item.is_verified)}
                                                isAdmin={item.role === 'admin' || item.isAdmin}
                                                size={12}
                                            />
                                        </View>
                                        <View style={styles.commentTextContainer}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                <Text style={[styles.commentUserName, { flexShrink: 1 }]}>{item.userName}</Text>
                                                <VerificationBadgeInline
                                                    isVerified={Boolean(item.isVerified ?? item.is_verified)}
                                                    isAdmin={item.role === 'admin' || item.isAdmin}
                                                    size={12}
                                                />
                                            </View>
                                            <Text style={styles.commentBody}>{item.text}</Text>
                                        </View>
                                    </View>
                                )}
                            />
                        )}

                        {/* Comment Input */}
                        <View style={styles.commentInputRow}>
                            <TextInput
                                style={styles.commentTextInput}
                                placeholder="Add a comment..."
                                placeholderTextColor={colors.textTertiary}
                                value={newCommentText}
                                onChangeText={setNewCommentText}
                            />
                            <TouchableOpacity
                                style={[
                                    styles.sendCommentButton,
                                    !newCommentText.trim() && { opacity: 0.5 },
                                ]}
                                onPress={handleAddComment}
                                disabled={!newCommentText.trim() || submittingComment}
                            >
                                {submittingComment ? (
                                    <ActivityIndicator size="small" color={colors.primary} />
                                ) : (
                                    <Ionicons name="send" size={20} color={colors.primary} />
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
            backgroundColor: colors.surface,
            paddingTop: statusBarHeight + SPACING.xs,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        headerTitleRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: SPACING.lg,
            marginBottom: SPACING.sm,
        },
        headerTitle: {
            fontSize: FONT_SIZES.xxl,
            fontWeight: '900',
            color: colors.textPrimary,
        },
        headerRightActions: {},
        createPostHeaderButton: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.primary,
            paddingHorizontal: SPACING.md,
            paddingVertical: 6,
            borderRadius: BORDER_RADIUS.round,
            gap: 4,
        },
        createPostHeaderText: {
            color: colors.textInverse,
            fontWeight: '700',
            fontSize: FONT_SIZES.xs,
        },
        searchContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surfaceLight,
            marginHorizontal: SPACING.lg,
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.sm,
            borderRadius: BORDER_RADIUS.md,
            marginBottom: SPACING.sm,
            borderWidth: 1,
            borderColor: colors.border,
            gap: SPACING.xs,
        },
        searchInput: {
            flex: 1,
            fontSize: FONT_SIZES.sm,
            color: colors.textPrimary,
        },
        feedTypeSwitcher: {
            flexDirection: 'row',
            marginHorizontal: SPACING.lg,
            backgroundColor: colors.surfaceLight,
            borderRadius: BORDER_RADIUS.md,
            padding: 4,
            marginBottom: SPACING.sm,
        },
        switcherTab: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 8,
            borderRadius: BORDER_RADIUS.sm,
            gap: 6,
        },
        switcherTabActive: {
            backgroundColor: colors.primary,
        },
        switcherTabText: {
            fontSize: FONT_SIZES.xs,
            fontWeight: '700',
            color: colors.textSecondary,
        },
        switcherTabTextActive: {
            color: colors.textInverse,
        },
        categoriesContainer: {
            paddingHorizontal: SPACING.lg,
            paddingBottom: SPACING.sm,
            gap: SPACING.xs,
        },
        categoryChip: {
            paddingHorizontal: SPACING.md,
            paddingVertical: 6,
            borderRadius: BORDER_RADIUS.round,
            backgroundColor: colors.surfaceLight,
            borderWidth: 1,
            borderColor: colors.border,
            marginRight: SPACING.xs,
        },
        categoryChipActive: {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
        },
        categoryChipText: {
            fontSize: FONT_SIZES.xs,
            fontWeight: '600',
            color: colors.textSecondary,
        },
        categoryChipTextActive: {
            color: colors.textInverse,
        },
        listContent: {
            paddingVertical: SPACING.md,
        },
        postCard: {
            backgroundColor: colors.surface,
            marginBottom: SPACING.md,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: colors.border,
            width: '100%',
            maxWidth: 680,
            alignSelf: 'center',
        },
        postHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.sm,
        },
        vendorInfoRow: {
            flexDirection: 'row',
            alignItems: 'center',
            flex: 1,
            marginRight: SPACING.sm,
        },
        vendorAvatar: {
            width: 40,
            height: 40,
            borderRadius: 20,
            marginRight: SPACING.sm,
            backgroundColor: colors.surfaceLight,
        },
        vendorTextContainer: {
            flex: 1,
        },
        vendorNameRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
        },
        vendorName: {
            fontSize: FONT_SIZES.sm,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        vendorCategory: {
            fontSize: FONT_SIZES.xs,
            color: colors.textSecondary,
        },
        viewVendorButton: {
            paddingHorizontal: SPACING.sm,
            paddingVertical: 4,
            borderRadius: BORDER_RADIUS.sm,
            borderWidth: 1,
            borderColor: colors.primary,
        },
        viewVendorButtonText: {
            fontSize: FONT_SIZES.xs,
            fontWeight: '600',
            color: colors.primary,
        },
        mediaContainer: {
            width: '100%',
            height: 360,
            backgroundColor: colors.surfaceLight,
            position: 'relative',
            overflow: 'hidden',
        },
        postMedia: {
            width: '100%',
            height: '100%',
            resizeMode: 'cover',
        },
        reelBadge: {
            position: 'absolute',
            top: SPACING.sm,
            left: SPACING.sm,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.7)',
            paddingHorizontal: SPACING.sm,
            paddingVertical: 4,
            borderRadius: BORDER_RADIUS.round,
            gap: 4,
        },
        reelBadgeText: {
            color: '#fff',
            fontSize: 10,
            fontWeight: 'bold',
            letterSpacing: 0.5,
        },
        priceBadge: {
            position: 'absolute',
            bottom: SPACING.sm,
            right: SPACING.sm,
            backgroundColor: colors.primary,
            paddingHorizontal: SPACING.md,
            paddingVertical: 6,
            borderRadius: BORDER_RADIUS.round,
            ...SHADOWS.medium,
        },
        priceBadgeText: {
            color: colors.textInverse,
            fontWeight: '900',
            fontSize: FONT_SIZES.sm,
        },
        actionsBar: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.sm,
        },
        leftActions: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACING.md,
        },
        actionIconButton: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
        },
        actionCount: {
            fontSize: FONT_SIZES.xs,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        chatVendorButton: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: SPACING.sm,
            paddingVertical: 4,
            borderRadius: BORDER_RADIUS.round,
            backgroundColor: colors.surfaceLight,
            gap: 4,
        },
        chatVendorText: {
            fontSize: FONT_SIZES.xs,
            fontWeight: '700',
            color: colors.primary,
        },
        captionContainer: {
            paddingHorizontal: SPACING.md,
            paddingBottom: SPACING.md,
        },
        captionText: {
            fontSize: FONT_SIZES.sm,
            color: colors.textPrimary,
            lineHeight: 20,
        },
        captionVendorName: {
            fontWeight: '700',
        },
        tagsContainer: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            marginTop: 4,
        },
        tagText: {
            fontSize: FONT_SIZES.xs,
            color: colors.primary,
            fontWeight: '600',
        },
        timestampText: {
            fontSize: 10,
            color: colors.textTertiary,
            marginTop: 6,
        },
        loadingContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: 60,
        },
        emptyContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: SPACING.xl * 2,
        },
        emptyTitle: {
            fontSize: FONT_SIZES.lg,
            fontWeight: 'bold',
            color: colors.textPrimary,
            marginTop: SPACING.md,
        },
        emptySubtitle: {
            fontSize: FONT_SIZES.sm,
            color: colors.textSecondary,
            textAlign: 'center',
            marginTop: SPACING.xs,
            lineHeight: 20,
        },
        emptyCreateButton: {
            backgroundColor: colors.primary,
            paddingHorizontal: SPACING.lg,
            paddingVertical: SPACING.sm,
            borderRadius: BORDER_RADIUS.round,
            marginTop: SPACING.lg,
        },
        emptyCreateButtonText: {
            color: colors.textInverse,
            fontWeight: 'bold',
            fontSize: FONT_SIZES.sm,
        },
        modalOverlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'flex-end',
        },
        modalContent: {
            backgroundColor: colors.surface,
            borderTopLeftRadius: BORDER_RADIUS.lg,
            borderTopRightRadius: BORDER_RADIUS.lg,
            maxHeight: '80%',
            minHeight: '50%',
        },
        modalHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: SPACING.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        modalTitle: {
            fontSize: FONT_SIZES.md,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        commentsList: {
            padding: SPACING.md,
        },
        commentsLoading: {
            padding: SPACING.xl,
            alignItems: 'center',
        },
        noCommentsContainer: {
            padding: SPACING.xl,
            alignItems: 'center',
        },
        noCommentsText: {
            color: colors.textSecondary,
            fontSize: FONT_SIZES.sm,
        },
        commentItem: {
            flexDirection: 'row',
            marginBottom: SPACING.md,
        },
        commentAvatar: {
            width: 32,
            height: 32,
            borderRadius: 16,
            marginRight: SPACING.sm,
        },
        commentTextContainer: {
            flex: 1,
            backgroundColor: colors.surfaceLight,
            padding: SPACING.sm,
            borderRadius: BORDER_RADIUS.md,
        },
        commentUserName: {
            fontSize: FONT_SIZES.xs,
            fontWeight: 'bold',
            color: colors.textPrimary,
            marginBottom: 2,
        },
        commentBody: {
            fontSize: FONT_SIZES.sm,
            color: colors.textPrimary,
        },
        commentInputRow: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: SPACING.md,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            gap: SPACING.sm,
        },
        commentTextInput: {
            flex: 1,
            backgroundColor: colors.surfaceLight,
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.sm,
            borderRadius: BORDER_RADIUS.round,
            color: colors.textPrimary,
            fontSize: FONT_SIZES.sm,
        },
        sendCommentButton: {
            padding: SPACING.xs,
        },
    });
};
