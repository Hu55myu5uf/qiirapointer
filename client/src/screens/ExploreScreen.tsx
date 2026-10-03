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
    KeyboardAvoidingView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { PLACEHOLDER_AVATARS } from '../assets';
import { postAPI } from '../services/api';
import { sharePost, shareVendorProfile } from '../services/shareService';
import VerificationBadge, { AvatarVerificationBadge, VerificationBadgeInline } from '../components/VerificationBadge';
import CartButton from '../components/CartButton';
import SharePostModal from '../components/SharePostModal';
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
    const [selectedPostToShare, setSelectedPostToShare] = useState<any>(null);

    // Client Community Post State
    const [clientPostModalVisible, setClientPostModalVisible] = useState<boolean>(false);
    const [clientPostText, setClientPostText] = useState<string>('');
    const [clientPostFlair, setClientPostFlair] = useState<'update' | 'question' | 'shoutout'>('update');
    const [clientPostImage, setClientPostImage] = useState<string>('');
    const [clientTaggedVendor, setClientTaggedVendor] = useState<string>('');
    const [postingClient, setPostingClient] = useState<boolean>(false);

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

    const handlePickClientImage = () => {
        Alert.alert(
            'Add Photo to Post',
            'Choose an option:',
            [
                {
                    text: 'Snap with Camera',
                    onPress: async () => {
                        try {
                            const { status } = await ImagePicker.requestCameraPermissionsAsync();
                            if (status !== 'granted') {
                                Alert.alert('Permission Required', 'Camera permission is required.');
                                return;
                            }
                            const res = await ImagePicker.launchCameraAsync({
                                mediaTypes: ['images'],
                                allowsEditing: true,
                                quality: 0.8,
                                base64: true,
                            });
                            if (!res.canceled && res.assets && res.assets[0]) {
                                const asset = res.assets[0];
                                const uri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
                                setClientPostImage(uri);
                            }
                        } catch (e) {
                            console.error('Camera error:', e);
                        }
                    },
                },
                {
                    text: 'Choose from Gallery',
                    onPress: async () => {
                        try {
                            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                            if (status !== 'granted') {
                                Alert.alert('Permission Required', 'Gallery permission is required.');
                                return;
                            }
                            const res = await ImagePicker.launchImageLibraryAsync({
                                mediaTypes: ['images'],
                                allowsEditing: true,
                                quality: 0.8,
                                base64: true,
                            });
                            if (!res.canceled && res.assets && res.assets[0]) {
                                const asset = res.assets[0];
                                const uri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
                                setClientPostImage(uri);
                            }
                        } catch (e) {
                            console.error('Gallery error:', e);
                        }
                    },
                },
                { text: 'Cancel', style: 'cancel' },
            ]
        );
    };

    const handlePublishClientPost = async () => {
        if (!clientPostText.trim() && !clientPostImage) {
            Alert.alert('Empty Post', 'Please write a message or add a photo to share with the community.');
            return;
        }

        if (!currentUserId) {
            Alert.alert('Sign In Required', 'Please sign in to publish a community post.');
            return;
        }

        setPostingClient(true);
        try {
            const authUser = auth.currentUser;
            const storeUser = useAuthStore.getState().user;
            const authorName = authUser?.displayName || (storeUser as any)?.displayName || authUser?.email?.split('@')[0] || 'Community Member';
            const authorAvatar = authUser?.photoURL || (storeUser as any)?.photoURL || (storeUser as any)?.profileImage || '';

            const res = await postAPI.create({
                userId: currentUserId,
                authorId: currentUserId,
                authorType: 'client',
                authorName,
                authorAvatar,
                caption: clientPostText.trim(),
                clientPostType: clientPostFlair,
                taggedVendorName: clientTaggedVendor.trim() || undefined,
                mediaUrl: clientPostImage || undefined,
            });

            if (res.data?.post) {
                setPosts((prev) => [res.data.post, ...prev]);
            }
            setClientPostText('');
            setClientPostImage('');
            setClientTaggedVendor('');
            setClientPostFlair('update');
            setClientPostModalVisible(false);
            Alert.alert('Published 🎉', 'Your post is now live in the QIIRA community feed!');
        } catch (error: any) {
            console.error('Client post error:', error);
            const msg = error.response?.data?.error || error.message || 'Failed to publish post';
            Alert.alert('Error', msg);
        } finally {
            setPostingClient(false);
        }
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
            const authUser = auth.currentUser;
            const storeUser = useAuthStore.getState().user;
            const userName = authUser?.displayName || (storeUser as any)?.displayName || authUser?.email?.split('@')[0] || 'User';
            const userAvatar = authUser?.photoURL || (storeUser as any)?.photoURL || (storeUser as any)?.profileImage || (storeUser as any)?.avatar || '';
            const response = await postAPI.addComment(activePost.id, {
                userId: currentUserId,
                userName,
                userAvatar,
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
        setSelectedPostToShare(post);
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

    const renderHeaderComposer = () => {
        const authUser = auth.currentUser;
        const storeUser = useAuthStore.getState().user;
        const currentAvatar = authUser?.photoURL || (storeUser as any)?.photoURL || (storeUser as any)?.profileImage || '';
        return (
            <View style={styles.communityComposerCard}>
                <View style={styles.composerTopRow}>
                    <Image
                        source={currentAvatar ? { uri: currentAvatar } : PLACEHOLDER_AVATARS.client}
                        style={styles.composerAvatar}
                    />
                    <TouchableOpacity
                        style={styles.composerInputButton}
                        onPress={() => setClientPostModalVisible(true)}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.composerPlaceholderText} numberOfLines={1}>
                            Share an experience or ask the community...
                        </Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.composerBottomRow}>
                    <TouchableOpacity
                        style={styles.composerActionChip}
                        onPress={() => {
                            setClientPostFlair('question');
                            setClientPostModalVisible(true);
                        }}
                    >
                        <Ionicons name="help-circle-outline" size={16} color="#3B82F6" />
                        <Text style={styles.composerActionText}>Ask Question</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.composerActionChip}
                        onPress={() => {
                            setClientPostFlair('shoutout');
                            setClientPostModalVisible(true);
                        }}
                    >
                        <Ionicons name="star-outline" size={16} color="#F59E0B" />
                        <Text style={styles.composerActionText}>Vendor Review</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.composerActionChip}
                        onPress={() => {
                            setClientPostFlair('update');
                            setClientPostModalVisible(true);
                        }}
                    >
                        <Ionicons name="image-outline" size={16} color="#10B981" />
                        <Text style={styles.composerActionText}>Photo / Update</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    const renderPostItem = ({ item }: { item: any }) => {
        const isReel = item.type === 'reel';
        const isClientPost = item.authorType === 'client';
        const canDelete = auth.currentUser?.uid === (item.authorId || item.vendorId) || userRole === 'admin';
        const hasMedia = Boolean(item.mediaUrl || (item.mediaUrls && item.mediaUrls.length > 0));

        return (
            <View style={[styles.postCard, isClientPost && styles.clientPostCard]}>
                {/* Header */}
                <View style={styles.postHeader}>
                    {isClientPost ? (
                        /* Client Profile Header */
                        <View style={styles.vendorInfoRow}>
                            <View style={{ position: 'relative' }}>
                                <Image
                                    source={item.vendorImage ? { uri: item.vendorImage } : PLACEHOLDER_AVATARS.client}
                                    style={styles.vendorAvatar}
                                />
                                <AvatarVerificationBadge
                                    isVerified={Boolean(item.isVerified || item.is_verified || item.isAdmin)}
                                    isAdmin={Boolean(item.isAdmin)}
                                    size={14}
                                />
                            </View>
                            <View style={styles.vendorTextContainer}>
                                <View style={styles.vendorNameRow}>
                                    <Text style={styles.vendorName} numberOfLines={1}>
                                        {item.vendorName || 'Community Member'}
                                    </Text>
                                    <VerificationBadgeInline
                                        isVerified={Boolean(item.isVerified || item.is_verified || item.isAdmin)}
                                        isAdmin={Boolean(item.isAdmin)}
                                        size={16}
                                    />
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                    <View style={styles.communityFlairBadge}>
                                        <Text style={styles.communityFlairText}>
                                            {item.clientPostType === 'question' ? '❓ Question' : item.clientPostType === 'shoutout' ? '⭐ Recommendation' : '💭 Community Post'}
                                        </Text>
                                    </View>
                                    {item.taggedVendorName ? (
                                        <View style={styles.taggedVendorBadge}>
                                            <Text style={styles.taggedVendorText} numberOfLines={1}>
                                                🛍️ @{item.taggedVendorName}
                                            </Text>
                                        </View>
                                    ) : null}
                                </View>
                            </View>
                        </View>
                    ) : (
                        /* Vendor Profile Header */
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
                    )}

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
                        {!isClientPost && (
                            <TouchableOpacity
                                style={styles.viewVendorButton}
                                onPress={() => navigation.navigate('VendorDetails', { vendorId: item.vendorId })}
                            >
                                <Text style={styles.viewVendorButtonText}>View Store</Text>
                            </TouchableOpacity>
                        )}

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

                {/* Media Image(s) / Reel (if present) */}
                {hasMedia ? (
                    <PostMediaCarousel item={item} colors={colors} styles={styles} />
                ) : null}

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

                        {/* Add to Cart Button (Vendors only) */}
                        {!isClientPost && (
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
                        )}
                    </View>

                    {/* Chat Button */}
                    <TouchableOpacity
                        style={styles.chatVendorButton}
                        onPress={() =>
                            navigation.navigate('Chat', {
                                otherUserId: item.authorId || item.vendorId,
                                otherUserName: item.vendorName,
                                otherUserImage: item.vendorImage,
                                receiverId: item.authorId || item.vendorId,
                                receiverName: item.vendorName,
                                receiverImage: item.vendorImage,
                            })
                        }
                    >
                        <Ionicons name={isClientPost ? "chatbubble-ellipses-outline" : "chatbubbles-outline"} size={16} color={colors.primary} />
                        <Text style={styles.chatVendorText}>{isClientPost ? "Reply" : "Inquire"}</Text>
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
                        {userRole === 'vendor' ? (
                            <TouchableOpacity
                                style={styles.createPostHeaderButton}
                                onPress={() => navigation.navigate('CreatePost')}
                            >
                                <Ionicons name="add" size={20} color={colors.textInverse} />
                                <Text style={styles.createPostHeaderText}>New Post</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.createPostHeaderButton}
                                onPress={() => setClientPostModalVisible(true)}
                            >
                                <Ionicons name="create-outline" size={18} color={colors.textInverse} />
                                <Text style={styles.createPostHeaderText}>Share / Ask</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Search Bar */}
                <View style={styles.searchContainer}>
                    <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search products, services, showcase..."
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

                {/* Feed vs Showcase Switcher */}
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
                            Showcase 🎬
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

            {/* Posts / Showcase List */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={filteredPosts}
                    keyExtractor={(item) => item.id}
                    renderItem={renderPostItem}
                    ListHeaderComponent={activeTab === 'feed' ? renderHeaderComposer : null}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="images-outline" size={56} color={colors.textTertiary} />
                            <Text style={styles.emptyTitle}>No posts found</Text>
                            <Text style={styles.emptySubtitle}>
                                {activeTab === 'feed'
                                    ? 'Be the first to share a post, question, or showcase products in this category!'
                                    : 'No showcase reels available in this category yet.'}
                            </Text>
                            {userRole === 'vendor' ? (
                                <TouchableOpacity
                                    style={styles.emptyCreateButton}
                                    onPress={() => navigation.navigate('CreatePost')}
                                >
                                    <Text style={styles.emptyCreateButtonText}>Create Post</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={styles.emptyCreateButton}
                                    onPress={() => setClientPostModalVisible(true)}
                                >
                                    <Text style={styles.emptyCreateButtonText}>Share with Community</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    }
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
                                                source={item.userAvatar ? { uri: item.userAvatar } : PLACEHOLDER_AVATARS.client}
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

            {/* Client Community Post Modal */}
            <Modal
                visible={clientPostModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setClientPostModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.modalOverlay}
                >
                    <View style={styles.clientPostModalContent}>
                        {/* Header */}
                        <View style={styles.clientModalHeader}>
                            <View>
                                <Text style={styles.clientModalTitle}>Create Community Post</Text>
                                <Text style={styles.clientModalSubtitle}>
                                    Share questions, recommendations, or discoveries
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setClientPostModalVisible(false)}
                                style={styles.modalCloseButton}
                            >
                                <Ionicons name="close" size={24} color={colors.textPrimary} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                            {/* Flair / Category Selector */}
                            <Text style={styles.modalSectionLabel}>Post Type</Text>
                            <View style={styles.flairSelectorRow}>
                                <TouchableOpacity
                                    style={[
                                        styles.flairTab,
                                        clientPostFlair === 'update' && styles.flairTabActive,
                                    ]}
                                    onPress={() => setClientPostFlair('update')}
                                >
                                    <Ionicons
                                        name="chatbubble-outline"
                                        size={14}
                                        color={clientPostFlair === 'update' ? '#fff' : colors.textSecondary}
                                    />
                                    <Text
                                        style={[
                                            styles.flairTabText,
                                            clientPostFlair === 'update' && styles.flairTabTextActive,
                                        ]}
                                    >
                                        Update / Story
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.flairTab,
                                        clientPostFlair === 'question' && styles.flairTabActive,
                                    ]}
                                    onPress={() => setClientPostFlair('question')}
                                >
                                    <Ionicons
                                        name="help-circle-outline"
                                        size={14}
                                        color={clientPostFlair === 'question' ? '#fff' : colors.textSecondary}
                                    />
                                    <Text
                                        style={[
                                            styles.flairTabText,
                                            clientPostFlair === 'question' && styles.flairTabTextActive,
                                        ]}
                                    >
                                        Ask Question
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.flairTab,
                                        clientPostFlair === 'shoutout' && styles.flairTabActive,
                                    ]}
                                    onPress={() => setClientPostFlair('shoutout')}
                                >
                                    <Ionicons
                                        name="star-outline"
                                        size={14}
                                        color={clientPostFlair === 'shoutout' ? '#fff' : colors.textSecondary}
                                    />
                                    <Text
                                        style={[
                                            styles.flairTabText,
                                            clientPostFlair === 'shoutout' && styles.flairTabTextActive,
                                        ]}
                                    >
                                        Recommendation
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {/* Caption Text Input */}
                            <TextInput
                                style={styles.clientTextInput}
                                placeholder={
                                    clientPostFlair === 'question'
                                        ? "Ask the QIIRA community (e.g., 'Where can I find the best bespoke shoes in Abuja?')..."
                                        : clientPostFlair === 'shoutout'
                                        ? "Write a review or recommendation for a vendor or product you loved..."
                                        : "What's on your mind? Share your thoughts, styles, or tips..."
                                }
                                placeholderTextColor={colors.textTertiary}
                                value={clientPostText}
                                onChangeText={setClientPostText}
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                            />

                            {/* Optional Tagged Vendor Input */}
                            <View style={styles.clientTagVendorContainer}>
                                <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
                                <TextInput
                                    style={styles.clientTagVendorInput}
                                    placeholder="Tag a vendor name (optional, e.g. Royal Fabrics)"
                                    placeholderTextColor={colors.textTertiary}
                                    value={clientTaggedVendor}
                                    onChangeText={setClientTaggedVendor}
                                />
                            </View>

                            {/* Photo Preview if chosen */}
                            {clientPostImage ? (
                                <View style={styles.clientImagePreviewContainer}>
                                    <Image source={{ uri: clientPostImage }} style={styles.clientImagePreview} />
                                    <TouchableOpacity
                                        style={styles.clientImageRemoveBtn}
                                        onPress={() => setClientPostImage('')}
                                    >
                                        <Ionicons name="close" size={16} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                            ) : null}

                            {/* Photo Picker Button */}
                            <TouchableOpacity
                                style={styles.clientAddMediaBtn}
                                onPress={handlePickClientImage}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="camera-outline" size={20} color={colors.primary} />
                                <Text style={styles.clientAddMediaBtnText}>
                                    {clientPostImage ? 'Change Photo (Camera / Gallery)' : 'Add Photo (Snap or Gallery)'}
                                </Text>
                            </TouchableOpacity>
                        </ScrollView>

                        {/* Submit Button */}
                        <TouchableOpacity
                            style={[
                                styles.clientPublishBtn,
                                (!clientPostText.trim() && !clientPostImage) && { opacity: 0.5 },
                            ]}
                            onPress={handlePublishClientPost}
                            disabled={(!clientPostText.trim() && !clientPostImage) || postingClient}
                        >
                            {postingClient ? (
                                <ActivityIndicator size="small" color={colors.textInverse} />
                            ) : (
                                <>
                                    <Ionicons name="paper-plane" size={18} color={colors.textInverse} />
                                    <Text style={styles.clientPublishBtnText}>Publish to Community</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <SharePostModal
                visible={!!selectedPostToShare}
                onClose={() => setSelectedPostToShare(null)}
                post={selectedPostToShare}
            />
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

        // Community Composer Card
        communityComposerCard: {
            backgroundColor: colors.surface,
            marginHorizontal: SPACING.md,
            marginBottom: SPACING.md,
            borderRadius: BORDER_RADIUS.lg,
            borderWidth: 1,
            borderColor: colors.border,
            padding: SPACING.md,
            ...SHADOWS.small,
        },
        composerTopRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACING.sm,
            marginBottom: SPACING.sm,
        },
        composerAvatar: {
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: colors.surfaceLight,
        },
        composerInputButton: {
            flex: 1,
            backgroundColor: colors.surfaceLight,
            paddingHorizontal: SPACING.md,
            paddingVertical: 10,
            borderRadius: BORDER_RADIUS.round,
            borderWidth: 1,
            borderColor: colors.border,
        },
        composerPlaceholderText: {
            fontSize: FONT_SIZES.sm,
            color: colors.textTertiary,
        },
        composerBottomRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-around',
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: SPACING.xs,
        },
        composerActionChip: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingVertical: 6,
            paddingHorizontal: 8,
            borderRadius: BORDER_RADIUS.sm,
        },
        composerActionText: {
            fontSize: FONT_SIZES.xs,
            fontWeight: '600',
            color: colors.textSecondary,
        },

        // Client Post Card & Badges
        clientPostCard: {
            borderLeftWidth: 3,
            borderLeftColor: colors.primary,
        },
        communityFlairBadge: {
            backgroundColor: 'rgba(178, 138, 69, 0.15)',
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: BORDER_RADIUS.round,
            alignSelf: 'flex-start',
        },
        communityFlairText: {
            fontSize: 10,
            fontWeight: '700',
            color: colors.primary,
        },
        taggedVendorBadge: {
            backgroundColor: 'rgba(59, 130, 246, 0.12)',
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: BORDER_RADIUS.round,
            maxWidth: 160,
        },
        taggedVendorText: {
            fontSize: 10,
            fontWeight: '600',
            color: '#3B82F6',
        },

        // Client Modal Styles
        clientPostModalContent: {
            backgroundColor: colors.surface,
            borderTopLeftRadius: BORDER_RADIUS.xl,
            borderTopRightRadius: BORDER_RADIUS.xl,
            padding: SPACING.lg,
            maxHeight: '90%',
        },
        clientModalHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: SPACING.md,
            paddingBottom: SPACING.sm,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        clientModalTitle: {
            fontSize: FONT_SIZES.lg,
            fontWeight: '800',
            color: colors.textPrimary,
        },
        clientModalSubtitle: {
            fontSize: FONT_SIZES.xs,
            color: colors.textSecondary,
            marginTop: 2,
        },
        modalCloseButton: {
            padding: SPACING.xs,
        },
        modalSectionLabel: {
            fontSize: FONT_SIZES.xs,
            fontWeight: '700',
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: SPACING.xs,
        },
        flairSelectorRow: {
            flexDirection: 'row',
            gap: SPACING.xs,
            marginBottom: SPACING.md,
        },
        flairTab: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            paddingVertical: 8,
            paddingHorizontal: 6,
            borderRadius: BORDER_RADIUS.md,
            backgroundColor: colors.surfaceLight,
            borderWidth: 1,
            borderColor: colors.border,
        },
        flairTabActive: {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
        },
        flairTabText: {
            fontSize: 11,
            fontWeight: '600',
            color: colors.textSecondary,
        },
        flairTabTextActive: {
            color: colors.textInverse,
            fontWeight: '700',
        },
        clientTextInput: {
            backgroundColor: colors.surfaceLight,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BORDER_RADIUS.md,
            padding: SPACING.md,
            fontSize: FONT_SIZES.sm,
            color: colors.textPrimary,
            minHeight: 110,
            marginBottom: SPACING.md,
        },
        clientTagVendorContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surfaceLight,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BORDER_RADIUS.md,
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.sm,
            gap: SPACING.xs,
            marginBottom: SPACING.md,
        },
        clientTagVendorInput: {
            flex: 1,
            fontSize: FONT_SIZES.sm,
            color: colors.textPrimary,
        },
        clientImagePreviewContainer: {
            position: 'relative',
            borderRadius: BORDER_RADIUS.md,
            overflow: 'hidden',
            marginBottom: SPACING.md,
            height: 180,
            backgroundColor: colors.surfaceLight,
        },
        clientImagePreview: {
            width: '100%',
            height: '100%',
            resizeMode: 'cover',
        },
        clientImageRemoveBtn: {
            position: 'absolute',
            top: 8,
            right: 8,
            backgroundColor: 'rgba(0,0,0,0.65)',
            width: 28,
            height: 28,
            borderRadius: 14,
            justifyContent: 'center',
            alignItems: 'center',
        },
        clientAddMediaBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: colors.surfaceLight,
            borderWidth: 1,
            borderColor: colors.border,
            borderStyle: 'dashed',
            borderRadius: BORDER_RADIUS.md,
            paddingVertical: SPACING.md,
            marginBottom: SPACING.md,
        },
        clientAddMediaBtnText: {
            fontSize: FONT_SIZES.sm,
            fontWeight: '600',
            color: colors.primary,
        },
        clientPublishBtn: {
            backgroundColor: colors.primary,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 14,
            borderRadius: BORDER_RADIUS.round,
            marginTop: SPACING.xs,
        },
        clientPublishBtnText: {
            color: colors.textInverse,
            fontWeight: '800',
            fontSize: FONT_SIZES.md,
        },
    });
};
