import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    ActivityIndicator,
    Alert,
    Linking,
    Dimensions,
    Platform,
    Modal,
    TextInput,
    FlatList,
} from 'react-native';
import { vendorAPI, clientAPI, postAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { isCurrentlyOpen, getHoursDisplayString, DAY_LABELS } from '../utils/businessHours';
import { useTheme } from '../context/ThemeContext';
import { PLACEHOLDER_AVATARS } from '../assets';
import { VerificationBadgeInline, AvatarVerificationBadge } from '../components/VerificationBadge';
import { shareVendorProfile, sharePost } from '../services/shareService';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCartStore } from '../store/cartStore';
import { useCallStore } from '../store/callStore';
import CartButton from '../components/CartButton';
import CallOptionModal from '../components/CallOptionModal';
import SharePostModal from '../components/SharePostModal';
import PlaceOrderModal from '../components/PlaceOrderModal';

const { width } = Dimensions.get('window');

// X-Style Theme Customizations
const X_THEME = {
    bannerHeight: 150,
    avatarSize: 80,
};

export default function VendorDetailsScreen({ route, navigation }: any) {
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const { vendorId } = route.params;
    const { user, userRole } = useAuthStore();
    const { addItem: addToCart } = useCartStore();
    const { startCall } = useCallStore();
    const [selectedPostToShare, setSelectedPostToShare] = useState<any>(null);
    const [vendor, setVendor] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isFavorite, setIsFavorite] = useState(false);
    const [callModalVisible, setCallModalVisible] = useState(false);
    const [activeTab, setActiveTab] = useState<'posts' | 'catalog' | 'about' | 'services' | 'reviews' | 'docs'>(route.params?.initialTab || 'posts');
    const [reviews, setReviews] = useState<any[]>([]);
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [posts, setPosts] = useState<any[]>([]);
    const [postsLoading, setPostsLoading] = useState(false);
    const [menuDocuments, setMenuDocuments] = useState<any[]>([]);
    const [menuDocsLoading, setMenuDocsLoading] = useState(false);

    // Catalog & Ordering State
    const [catalogItems, setCatalogItems] = useState<any[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [orderModalVisible, setOrderModalVisible] = useState(false);
    const [selectedProductForOrder, setSelectedProductForOrder] = useState<any>(null);

    // Comments Modal State
    const [commentModalVisible, setCommentModalVisible] = useState<boolean>(false);
    const [activePostForComments, setActivePostForComments] = useState<any>(null);
    const [comments, setComments] = useState<any[]>([]);
    const [newCommentText, setNewCommentText] = useState<string>('');
    const [loadingComments, setLoadingComments] = useState<boolean>(false);
    const [submittingComment, setSubmittingComment] = useState<boolean>(false);

    const handleOpenComments = async (post: any) => {
        setActivePostForComments(post);
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
        if (!newCommentText.trim() || !activePostForComments) return;
        if (!user) {
            Alert.alert('Sign In Required', 'Please sign in to comment.');
            return;
        }
        setSubmittingComment(true);
        try {
            const userName = user.displayName || user.email?.split('@')[0] || 'User';
            const response = await postAPI.addComment(activePostForComments.id, {
                userId: user.uid,
                userName,
                userAvatar: user.photoURL || '',
                text: newCommentText.trim(),
            });

            setComments((prev) => [response.data.comment, ...prev]);
            setNewCommentText('');

            setPosts((prev) =>
                prev.map((p) =>
                    p.id === activePostForComments.id ? { ...p, commentsCount: (p.commentsCount || 0) + 1 } : p
                )
            );
        } catch (error) {
            console.error('Add comment error:', error);
            Alert.alert('Error', 'Failed to post comment');
        } finally {
            setSubmittingComment(false);
        }
    };

    const handleDeletePost = async (postId: string) => {
        if (!user) return;

        const performDelete = async () => {
            try {
                await postAPI.deletePost(postId, { userId: user.uid, role: userRole || 'client' });
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

    useEffect(() => {
        fetchVendorDetails();
        checkIfFavorite();
        fetchVendorPosts();
        fetchVendorDocuments();
    }, [vendorId]);

    const fetchVendorDocuments = async () => {
        setMenuDocsLoading(true);
        try {
            const response = await vendorAPI.getDocuments(vendorId);
            setMenuDocuments(response.data.documents || []);
        } catch (error) {
            console.error('Error fetching vendor documents:', error);
        } finally {
            setMenuDocsLoading(false);
        }
    };

    const fetchVendorDetails = async () => {
        try {
            const response = await vendorAPI.getById(vendorId);
            setVendor(response.data.vendor);
        } catch (error) {
            console.error('Error fetching vendor details:', error);
            Alert.alert('Error', 'Failed to load vendor details');
            navigation.goBack();
        } finally {
            setLoading(false);
        }
    };

    const fetchReviews = async () => {
        setReviewsLoading(true);
        try {
            const response = await vendorAPI.getReviews(vendorId);
            setReviews(response.data.reviews || []);
        } catch (error) {
            console.error('Error fetching reviews:', error);
        } finally {
            setReviewsLoading(false);
        }
    };

    const fetchVendorPosts = async () => {
        setPostsLoading(true);
        try {
            const response = await postAPI.getVendorPosts(vendorId, user?.uid);
            setPosts(response.data.posts || []);
        } catch (error) {
            console.error('Error fetching vendor posts:', error);
        } finally {
            setPostsLoading(false);
        }
    };

    const fetchCatalogItems = async () => {
        setCatalogLoading(true);
        try {
            const response = await vendorAPI.getCatalog(vendorId);
            setCatalogItems(response.data?.catalog || []);
        } catch (error) {
            console.error('Error fetching vendor catalog:', error);
        } finally {
            setCatalogLoading(false);
        }
    };

    // Fetch reviews / posts / catalog when tab is switched
    useEffect(() => {
        if (activeTab === 'reviews' && reviews.length === 0) {
            fetchReviews();
        } else if (activeTab === 'posts' && posts.length === 0) {
            fetchVendorPosts();
        } else if (activeTab === 'catalog' && catalogItems.length === 0) {
            fetchCatalogItems();
        }
    }, [activeTab]);

    const checkIfFavorite = async () => {
        if (!user) return;
        try {
            const response = await clientAPI.getFavorites(user.uid);
            const favorites = response.data.favorites;
            const isFav = favorites?.some((fav: any) => fav.id === vendorId || fav.uid === vendorId);
            setIsFavorite(Boolean(isFav));
        } catch (error) {
            console.error('Error checking favorites:', error);
        }
    };

    const handleToggleFavorite = async () => {
        if (!user) return;
        try {
            if (!isFavorite) {
                await clientAPI.addFavorite(user.uid, vendorId);
                setIsFavorite(true);
            } else {
                await clientAPI.removeFavorite(user.uid, vendorId);
                setIsFavorite(false);
            }
        } catch (error) {
            console.error('Error toggling favorite:', error);
        }
    };

    const handleInitiateOnlineCall = async (callType: 'voice' | 'video') => {
        if (!user) {
            Alert.alert('Sign In Required', 'Please log in to start an online call.');
            return;
        }
        try {
            const targetId = vendor.uid || vendor.id;
            const call = await startCall({
                callerId: user.uid,
                callerName: user.displayName || user.email?.split('@')[0] || 'Client',
                callerAvatar: user.photoURL || '',
                receiverId: targetId,
                receiverName: vendor.businessName,
                receiverAvatar: vendor.businessImage || vendor.business_image || '',
                callType,
            });
            navigation.navigate('CallScreen', {
                callId: call.id,
                callType,
                otherUserId: targetId,
                otherUserName: vendor.businessName,
                otherUserAvatar: vendor.businessImage || vendor.business_image || '',
                isIncoming: false,
            });
        } catch (error) {
            console.error('Error starting call:', error);
            Alert.alert('Call Error', 'Could not initiate online call. Please try again.');
        }
    };

    const handleContact = () => {
        setCallModalVisible(true);
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (!vendor) return null;

    // Use vendor business image or a high quality placeholder avatar
    const renderAvatar = () => {
        const imageUri = vendor.businessImage || vendor.business_image;
        return (
            <Image
                source={imageUri ? { uri: imageUri } : PLACEHOLDER_AVATARS.vendor}
                style={styles.avatarImage}
            />
        );
    };

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Banner */}
                <View style={styles.bannerContainer}>
                    {vendor.bannerImage ? (
                        <Image source={{ uri: vendor.bannerImage }} style={styles.banner} />
                    ) : (
                        <LinearGradient
                            colors={[colors.primary, colors.primaryLight]}
                            style={styles.banner}
                        />
                    )}

                    {/* Back Button Overlay */}
                    <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                        <Text style={styles.backButtonText}>←</Text>
                    </TouchableOpacity>
                </View>

                {/* Profile Header Section */}
                <View style={styles.profileHeader}>
                    {/* Avatar (Overlapping) */}
                    <View style={styles.avatarContainer}>
                        {renderAvatar()}
                        <AvatarVerificationBadge
                            isVerified={Boolean(vendor.isVerified || vendor.is_verified || vendor.userInfo?.isVerified || vendor.role === 'admin' || vendor.userInfo?.role === 'admin' || vendor.uid === 'v8MwaOet0ISfZAWXIDAPAGcg1td2' || vendor.id === 'v8MwaOet0ISfZAWXIDAPAGcg1td2')}
                            isAdmin={Boolean(vendor.userInfo?.role === 'admin' || vendor.role === 'admin' || vendor.uid === 'v8MwaOet0ISfZAWXIDAPAGcg1td2' || vendor.id === 'v8MwaOet0ISfZAWXIDAPAGcg1td2')}
                            size={24}
                        />
                    </View>

                    {/* Quick Utility Icon Bar (Right side: Cart, Favorite, Share) */}
                    <View style={styles.topIconBar}>
                        <CartButton onPress={() => navigation.navigate('Cart')} />

                        <TouchableOpacity
                            style={styles.utilityIconButton}
                            onPress={handleToggleFavorite}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.actionIcon, isFavorite && styles.actionIconActive]}>
                                {isFavorite ? '❤️' : '🤍'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.utilityIconButton}
                            onPress={() => shareVendorProfile({
                                vendorId: vendor.uid || vendor.id,
                                businessName: vendor.businessName,
                                category: vendor.category,
                                address: vendor.address,
                            })}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="share-social-outline" size={17} color={colors.textPrimary} />
                        </TouchableOpacity>
                    </View>

                    {/* Business Info */}
                    <View style={styles.infoContainer}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                            <Text style={styles.businessName}>{vendor.businessName}</Text>
                            <VerificationBadgeInline
                                isVerified={Boolean(vendor.isVerified || vendor.is_verified || vendor.userInfo?.isVerified || vendor.role === 'admin' || vendor.userInfo?.role === 'admin' || vendor.uid === 'v8MwaOet0ISfZAWXIDAPAGcg1td2' || vendor.id === 'v8MwaOet0ISfZAWXIDAPAGcg1td2')}
                                isAdmin={Boolean(vendor.userInfo?.role === 'admin' || vendor.role === 'admin' || vendor.uid === 'v8MwaOet0ISfZAWXIDAPAGcg1td2' || vendor.id === 'v8MwaOet0ISfZAWXIDAPAGcg1td2')}
                                size={20}
                            />
                        </View>
                        <Text style={styles.category}>@{vendor.category ? vendor.category.replace(/\s+/g, '').toLowerCase() : 'vendor'}</Text>

                        {/* Stats Row */}
                        <View style={styles.statsRow}>
                            <TouchableOpacity
                                style={styles.statItem}
                                onPress={() => navigation.navigate('WriteReview', {
                                    vendorId: vendor.id || vendor.uid,
                                    businessName: vendor.businessName,
                                    isVerified: Boolean(vendor.isVerified ?? vendor.is_verified)
                                })}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.statValue}>⭐ {vendor.averageRating > 0 ? Number(vendor.averageRating).toFixed(1) : 'Rate'}</Text>
                                <Text style={styles.statLabel}>{vendor.averageRating > 0 ? 'Rating' : 'Add Review'}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.statItem}
                                onPress={() => setActiveTab('reviews')}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.statValue}>{vendor.totalReviews || 0}</Text>
                                <Text style={styles.statLabel}>Reviews</Text>
                            </TouchableOpacity>

                            {vendor.address ? (
                                <View style={[styles.statItem, { flex: 1 }]}>
                                    <Text style={styles.statLabel} numberOfLines={1}>📍 {vendor.address}</Text>
                                </View>
                            ) : null}
                        </View>

                        {/* Direct Action Row: Chat, Call & Review */}
                        <View style={styles.primaryActionRow}>
                            <TouchableOpacity
                                style={styles.chatActionButton}
                                onPress={() => {
                                    const targetUserId = vendor?.uid || vendor?.id || (vendor as any)?.userInfo?.uid || vendorId;
                                    navigation.navigate('Chat', {
                                        otherUserId: targetUserId,
                                        otherUserName: vendor?.businessName || '',
                                        otherUserImage: vendor?.businessImage || vendor?.business_image || '',
                                        receiverId: targetUserId,
                                        receiverName: vendor?.businessName || '',
                                        receiverImage: vendor?.businessImage || vendor?.business_image || '',
                                        vendorId: targetUserId,
                                    });
                                }}
                                activeOpacity={0.8}
                            >
                                <Ionicons name="chatbubble-ellipses-outline" size={17} color={colors.textPrimary} />
                                <Text style={styles.chatActionText}>Chat</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.callActionButton}
                                onPress={handleContact}
                                activeOpacity={0.8}
                            >
                                <Ionicons name="call-outline" size={17} color={colors.textInverse} />
                                <Text style={styles.callActionText}>Call</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.reviewActionButton}
                                onPress={() => navigation.navigate('WriteReview', {
                                    vendorId: vendor.id || vendor.uid,
                                    businessName: vendor.businessName,
                                    isVerified: Boolean(vendor.isVerified ?? vendor.is_verified)
                                })}
                                activeOpacity={0.8}
                            >
                                <Ionicons name="star" size={16} color="#F59E0B" />
                                <Text style={styles.reviewActionText}>Review</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Tabs */}
                    <View style={styles.tabBar}>
                        {(['posts', 'catalog', 'services', 'about', 'docs', 'reviews'] as const).map((tab) => (
                            <TouchableOpacity
                                key={tab}
                                style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
                                onPress={() => {
                                    setActiveTab(tab);
                                    if (tab === 'posts') fetchVendorPosts();
                                    if (tab === 'catalog') fetchCatalogItems();
                                    if (tab === 'docs') fetchVendorDocuments();
                                }}
                            >
                                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                                    {tab === 'posts' ? 'Posts' : tab === 'catalog' ? '📖 Catalog' : tab === 'docs' ? '📄 Docs' : tab === 'about' ? 'About us' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Tab Content */}
                    <View style={styles.contentArea}>
                        {activeTab === 'about' && (
                            <View>
                                <Text style={styles.bodyText}>{vendor.aboutUs || vendor.about_us || vendor.description || vendor.bio || 'No about us information available.'}</Text>

                                {/* Business Hours Section */}
                                <View style={styles.hoursSection}>
                                    <View style={styles.hoursSectionHeader}>
                                        <Text style={styles.hoursSectionTitle}>🕐 Business Hours</Text>
                                        {vendor.businessHours ? (
                                            <View style={[
                                                styles.openStatusBadge,
                                                isCurrentlyOpen(vendor.businessHours).isOpen
                                                    ? styles.openBadge
                                                    : styles.closedBadge
                                            ]}>
                                                <Text style={styles.openStatusText}>
                                                    {isCurrentlyOpen(vendor.businessHours).isOpen ? '● Open' : '● Closed'}
                                                </Text>
                                            </View>
                                        ) : null}
                                    </View>

                                    {vendor.businessHours ? (
                                        <View style={styles.hoursList}>
                                            {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).map((day) => (
                                                <View key={day} style={styles.hoursRow}>
                                                    <Text style={styles.dayLabel}>{DAY_LABELS[day]}</Text>
                                                    <Text style={[
                                                        styles.hoursValue,
                                                        vendor.businessHours[day]?.closed && styles.closedText
                                                    ]}>
                                                        {vendor.businessHours[day]
                                                            ? getHoursDisplayString(vendor.businessHours[day])
                                                            : 'Not set'}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    ) : (
                                        <Text style={styles.noHoursText}>Business hours not available</Text>
                                    )}
                                    <View style={styles.quickReviewCard}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.quickReviewTitle}>Have you worked with this vendor?</Text>
                                            <Text style={styles.quickReviewSub}>Leave a quick rating & review</Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.quickReviewBtn}
                                            onPress={() => navigation.navigate('WriteReview', {
                                                vendorId: vendor.id || vendor.uid,
                                                businessName: vendor.businessName,
                                                isVerified: Boolean(vendor.isVerified ?? vendor.is_verified)
                                            })}
                                            activeOpacity={0.8}
                                        >
                                            <Ionicons name="star" size={14} color="#F59E0B" />
                                            <Text style={styles.quickReviewBtnText}>Rate Vendor</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        )}

                        {activeTab === 'services' && (
                            <View>
                                <Text style={styles.bodyText}>{vendor.services || 'No services listed.'}</Text>
                                <View style={[styles.quickReviewCard, { marginTop: SPACING.lg }]}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.quickReviewTitle}>Satisfied with their service?</Text>
                                        <Text style={styles.quickReviewSub}>Share your review with other clients</Text>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.quickReviewBtn}
                                        onPress={() => navigation.navigate('WriteReview', {
                                            vendorId: vendor.id || vendor.uid,
                                            businessName: vendor.businessName,
                                            isVerified: Boolean(vendor.isVerified ?? vendor.is_verified)
                                        })}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons name="star" size={14} color="#F59E0B" />
                                        <Text style={styles.quickReviewBtnText}>Write Review</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {activeTab === 'catalog' && (
                            <View>
                                {catalogLoading ? (
                                    <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: SPACING.lg }} />
                                ) : catalogItems.length === 0 ? (
                                    <View style={{ alignItems: 'center', paddingVertical: SPACING.xl, backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.lg, borderWidth: 1, borderColor: colors.border }}>
                                        <Ionicons name="book-outline" size={44} color={colors.textTertiary} />
                                        <Text style={{ color: colors.textPrimary, fontWeight: 'bold', marginTop: SPACING.sm, fontSize: FONT_SIZES.md }}>
                                            No Catalog Items Listed
                                        </Text>
                                        <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 4, fontSize: FONT_SIZES.sm }}>
                                            This vendor has not published items in their catalog yet.
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={{ gap: SPACING.sm }}>
                                        {catalogItems.map((item) => (
                                            <View key={item.id} style={{ backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: colors.border, padding: 12 }}>
                                                <View style={{ flexDirection: 'row', gap: 12 }}>
                                                    {item.imageUrl ? (
                                                        <Image source={{ uri: item.imageUrl }} style={{ width: 74, height: 74, borderRadius: BORDER_RADIUS.sm, backgroundColor: colors.surfaceLight }} />
                                                    ) : (
                                                        <View style={{ width: 74, height: 74, borderRadius: BORDER_RADIUS.sm, backgroundColor: `${colors.primary}15`, alignItems: 'center', justifyContent: 'center' }}>
                                                            <Ionicons name="pricetag-outline" size={28} color={colors.primary} />
                                                        </View>
                                                    )}
                                                    <View style={{ flex: 1 }}>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                            <Text style={{ color: colors.textPrimary, fontWeight: 'bold', fontSize: FONT_SIZES.md, flex: 1, marginRight: 6 }}>
                                                                {item.name}
                                                            </Text>
                                                            <Text style={{ color: colors.primary, fontWeight: '800', fontSize: FONT_SIZES.md }}>
                                                                ₦{Number(item.price || 0).toLocaleString()}
                                                            </Text>
                                                        </View>
                                                        {item.section ? (
                                                            <View style={{ alignSelf: 'flex-start', backgroundColor: `${colors.primary}15`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 3 }}>
                                                                <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '700' }}>
                                                                    {item.section}
                                                                </Text>
                                                            </View>
                                                        ) : null}
                                                        {item.description ? (
                                                            <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZES.xs, marginTop: 4 }} numberOfLines={2}>
                                                                {item.description}
                                                            </Text>
                                                        ) : null}
                                                    </View>
                                                </View>

                                                {/* Action Row */}
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.inStock !== false ? '#10B981' : '#EF4444' }} />
                                                        <Text style={{ fontSize: 11, color: item.inStock !== false ? '#10B981' : '#EF4444', fontWeight: '600' }}>
                                                            {item.inStock !== false ? 'In Stock' : 'Out of Stock'}
                                                        </Text>
                                                    </View>

                                                    <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                                                        <TouchableOpacity
                                                            style={{
                                                                flexDirection: 'row',
                                                                alignItems: 'center',
                                                                gap: 4,
                                                                backgroundColor: colors.surfaceLight,
                                                                paddingHorizontal: 10,
                                                                paddingVertical: 6,
                                                                borderRadius: BORDER_RADIUS.sm,
                                                                borderWidth: 1,
                                                                borderColor: colors.border,
                                                            }}
                                                            onPress={() => {
                                                                addToCart({
                                                                    id: item.id,
                                                                    postId: item.id,
                                                                    title: item.name,
                                                                    price: item.price,
                                                                    mediaUrl: item.imageUrl,
                                                                    vendorId: vendor.uid || vendor.id || vendorId,
                                                                    vendorName: vendor.businessName,
                                                                }, user?.uid);
                                                                Alert.alert('Saved to Cart 🛒', `${item.name} added to your cart!`);
                                                            }}
                                                        >
                                                            <Ionicons name="cart-outline" size={14} color={colors.textPrimary} />
                                                            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textPrimary }}>Save</Text>
                                                        </TouchableOpacity>

                                                        <TouchableOpacity
                                                            style={{
                                                                flexDirection: 'row',
                                                                alignItems: 'center',
                                                                gap: 4,
                                                                backgroundColor: '#10B981',
                                                                paddingHorizontal: 12,
                                                                paddingVertical: 6,
                                                                borderRadius: BORDER_RADIUS.sm,
                                                            }}
                                                            onPress={() => {
                                                                setSelectedProductForOrder({
                                                                    id: item.id,
                                                                    title: item.name,
                                                                    price: item.price,
                                                                    image: item.imageUrl,
                                                                    category: item.section || vendor.category,
                                                                });
                                                                setOrderModalVisible(true);
                                                            }}
                                                        >
                                                            <Ionicons name="flash" size={13} color="#FFFFFF" />
                                                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Order Now ⚡</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        )}

                        {activeTab === 'posts' && (
                            <View>
                                {postsLoading ? (
                                    <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: SPACING.lg }} />
                                ) : posts.length === 0 ? (
                                    <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
                                        <Ionicons name="images-outline" size={40} color={colors.textTertiary} />
                                        <Text style={{ color: colors.textSecondary, marginTop: SPACING.sm, fontSize: FONT_SIZES.sm }}>
                                            No products or showcase published yet.
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={{ gap: SPACING.md }}>
                                        {posts.map((post) => (
                                            <View key={post.id} style={{ backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
                                                <View style={{ position: 'relative' }}>
                                                    <Image
                                                        source={{ uri: post.mediaUrl || post.thumbnailUrl || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400' }}
                                                        style={{ width: '100%', height: 220, resizeMode: 'cover', backgroundColor: colors.surfaceLight }}
                                                    />
                                                    {(post.type === 'reel' || post.type === 'showcase') && (
                                                        <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                            <Ionicons name="play" size={12} color="#fff" />
                                                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>SHOWCASE</Text>
                                                        </View>
                                                    )}
                                                    {post.price !== undefined && post.price !== null && post.price !== '' && Number(post.price) > 0 ? (
                                                        <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                                                            <Text style={{ color: colors.textInverse, fontWeight: 'bold', fontSize: 12 }}>
                                                                ₦{Number(post.price).toLocaleString()}
                                                            </Text>
                                                        </View>
                                                    ) : null}
                                                </View>
                                                <View style={{ padding: SPACING.md }}>
                                                    <Text style={{ fontSize: FONT_SIZES.sm, color: colors.textPrimary, lineHeight: 20 }}>
                                                        {post.caption}
                                                    </Text>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: SPACING.xs }}>
                                                        <View style={{ flexDirection: 'row', gap: SPACING.md }}>
                                                            <Text style={{ fontSize: 12, color: colors.textSecondary }}>❤️ {post.likesCount || 0} likes</Text>
                                                            <TouchableOpacity onPress={() => handleOpenComments(post)} activeOpacity={0.7}>
                                                                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>💬 {post.commentsCount || 0} comments</Text>
                                                            </TouchableOpacity>
                                                        </View>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                                                            {post.price ? (
                                                                <>
                                                                    <TouchableOpacity
                                                                        style={{
                                                                            flexDirection: 'row',
                                                                            alignItems: 'center',
                                                                            gap: 4,
                                                                            backgroundColor: '#10B981',
                                                                            paddingHorizontal: 8,
                                                                            paddingVertical: 4,
                                                                            borderRadius: BORDER_RADIUS.sm,
                                                                        }}
                                                                        onPress={() => {
                                                                            setSelectedProductForOrder({
                                                                                id: post.id,
                                                                                title: post.caption?.slice(0, 50) || 'Product Item',
                                                                                price: post.price,
                                                                                image: post.mediaUrl || post.thumbnailUrl,
                                                                                category: vendor.category || 'Product',
                                                                            });
                                                                            setOrderModalVisible(true);
                                                                        }}
                                                                    >
                                                                        <Ionicons name="flash" size={12} color="#FFFFFF" />
                                                                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#FFFFFF' }}>Order ⚡</Text>
                                                                    </TouchableOpacity>

                                                                    <TouchableOpacity
                                                                        style={{
                                                                            flexDirection: 'row',
                                                                            alignItems: 'center',
                                                                            gap: 4,
                                                                            backgroundColor: colors.primary,
                                                                            paddingHorizontal: 8,
                                                                            paddingVertical: 4,
                                                                            borderRadius: BORDER_RADIUS.sm,
                                                                        }}
                                                                        onPress={() => {
                                                                            addToCart({
                                                                                id: post.id,
                                                                                postId: post.id,
                                                                                title: post.caption?.slice(0, 40) || 'Product Item',
                                                                                price: post.price,
                                                                                mediaUrl: post.mediaUrl,
                                                                                vendorId: vendor.uid || vendor.id,
                                                                                vendorName: vendor.businessName,
                                                                            }, user?.uid);
                                                                            Alert.alert('Saved to Cart 🛒', 'Item added to your saved cart!');
                                                                        }}
                                                                    >
                                                                        <Ionicons name="cart-outline" size={14} color={colors.textInverse} />
                                                                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.textInverse }}>Add</Text>
                                                                    </TouchableOpacity>
                                                                </>
                                                            ) : null}
                                                            <TouchableOpacity onPress={() => setSelectedPostToShare(post)}>
                                                                <Ionicons name="share-social-outline" size={18} color={colors.primary} />
                                                            </TouchableOpacity>
                                                            {((user && (user.uid === vendor?.uid || user.uid === vendor?.id || user.uid === post.vendorId)) || userRole === 'admin') && (
                                                                <TouchableOpacity
                                                                    style={{ padding: 4, marginLeft: 2 }}
                                                                    onPress={() => handleDeletePost(post.id)}
                                                                >
                                                                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                                                                </TouchableOpacity>
                                                            )}
                                                        </View>
                                                    </View>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        )}

                        {activeTab === 'reviews' && (
                            <View>
                                <View style={styles.reviewCta}>
                                    <Text style={styles.reviewCtaText}>Have you utilized this vendor?</Text>
                                    <TouchableOpacity
                                        style={styles.writeReviewBtn}
                                        onPress={() => navigation.navigate('WriteReview', {
                                            vendorId: vendor.id || vendor.uid,
                                            businessName: vendor.businessName,
                                            isVerified: Boolean(vendor.isVerified ?? vendor.is_verified)
                                        })}
                                    >
                                        <Text style={styles.writeReviewBtnText}>Write a Review</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Reviews List */}
                                {reviewsLoading ? (
                                    <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: SPACING.md }} />
                                ) : reviews.length > 0 ? (
                                    <View style={styles.reviewsList}>
                                        {reviews.map((review) => (
                                            <View key={review.id} style={styles.reviewCard}>
                                                <View style={styles.reviewHeader}>
                                                    <View style={{ position: 'relative' }}>
                                                        {review.reviewerAvatar || review.clientAvatar || review.userAvatar ? (
                                                            <Image
                                                                source={{ uri: review.reviewerAvatar || review.clientAvatar || review.userAvatar }}
                                                                style={styles.reviewerAvatar}
                                                            />
                                                        ) : (
                                                            <View style={styles.reviewerAvatar}>
                                                                <Text style={styles.reviewerInitial}>
                                                                    {review.reviewerName?.charAt(0).toUpperCase() || 'A'}
                                                                </Text>
                                                            </View>
                                                        )}
                                                        <AvatarVerificationBadge
                                                            isVerified={Boolean(review.isVerified)}
                                                            isAdmin={Boolean(review.isAdmin)}
                                                            size={12}
                                                        />
                                                    </View>
                                                    <View style={styles.reviewerInfo}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                            <Text style={[styles.reviewerName, { flexShrink: 1 }]}>{review.reviewerName}</Text>
                                                            <VerificationBadgeInline
                                                                isVerified={Boolean(review.isVerified)}
                                                                isAdmin={Boolean(review.isAdmin)}
                                                                size={12}
                                                            />
                                                        </View>
                                                        <Text style={styles.reviewDate}>
                                                            {new Date(review.createdAt).toLocaleDateString()}
                                                        </Text>
                                                    </View>
                                                    <View style={styles.reviewRating}>
                                                        <Text style={styles.ratingStars}>
                                                            {'⭐'.repeat(review.rating)}
                                                        </Text>
                                                    </View>
                                                </View>
                                                {review.comment ? (
                                                    <Text style={styles.reviewComment}>{review.comment}</Text>
                                                ) : null}
                                            </View>
                                        ))}
                                    </View>
                                ) : (
                                    <Text style={styles.bodyText}>Be the first to review!</Text>
                                )}
                            </View>
                        )}

                        {activeTab === 'docs' && (
                            <View>
                                {menuDocsLoading ? (
                                    <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: SPACING.lg }} />
                                ) : menuDocuments.length === 0 ? (
                                    <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
                                        <Ionicons name="document-text-outline" size={40} color={colors.textTertiary} />
                                        <Text style={{ color: colors.textSecondary, marginTop: SPACING.sm, fontSize: FONT_SIZES.sm, textAlign: 'center' }}>
                                            No menus or documents available yet.
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={{ gap: SPACING.sm }}>
                                        <Text style={{ fontSize: FONT_SIZES.sm, color: colors.textSecondary, marginBottom: SPACING.xs }}>
                                            📄 {menuDocuments.length} document{menuDocuments.length !== 1 ? 's' : ''} available
                                        </Text>
                                        {menuDocuments.map((doc: any) => (
                                            <TouchableOpacity
                                                key={doc.id}
                                                style={{
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    backgroundColor: colors.surface,
                                                    borderWidth: 1,
                                                    borderColor: colors.border,
                                                    borderRadius: BORDER_RADIUS.md,
                                                    padding: SPACING.md,
                                                }}
                                                onPress={() => {
                                                    if (doc.url) {
                                                        Linking.openURL(doc.url).catch(() => {
                                                            Alert.alert('Error', 'Unable to open this document.');
                                                        });
                                                    }
                                                }}
                                                activeOpacity={0.7}
                                            >
                                                <View style={{
                                                    width: 44,
                                                    height: 44,
                                                    borderRadius: 10,
                                                    backgroundColor: '#FF634715',
                                                    justifyContent: 'center',
                                                    alignItems: 'center',
                                                    marginRight: SPACING.md,
                                                }}>
                                                    <Ionicons name="document-text" size={24} color="#FF6347" />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontSize: FONT_SIZES.md, fontWeight: '700', color: colors.textPrimary }}>{doc.title}</Text>
                                                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                                                        PDF · Added {new Date(doc.uploadedAt).toLocaleDateString()}
                                                    </Text>
                                                </View>
                                                <View style={{
                                                    backgroundColor: `${colors.primary}15`,
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 5,
                                                    borderRadius: BORDER_RADIUS.round,
                                                }}>
                                                    <Ionicons name="open-outline" size={16} color={colors.primary} />
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                </View>
            </ScrollView>
            <CallOptionModal
                visible={callModalVisible}
                vendor={vendor}
                onClose={() => setCallModalVisible(false)}
                navigation={navigation}
            />
            <SharePostModal
                visible={!!selectedPostToShare}
                onClose={() => setSelectedPostToShare(null)}
                post={selectedPostToShare ? {
                    id: selectedPostToShare.id,
                    vendorName: vendor?.businessName || 'Vendor',
                    caption: selectedPostToShare.caption,
                    price: selectedPostToShare.price,
                    currency: selectedPostToShare.currency,
                    mediaUrl: selectedPostToShare.mediaUrl,
                    vendorId: vendor?.uid || vendor?.id,
                } : null}
            />

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

            {/* Direct Order Placement Modal */}
            {selectedProductForOrder && (
                <PlaceOrderModal
                    visible={orderModalVisible}
                    onClose={() => {
                        setOrderModalVisible(false);
                        setSelectedProductForOrder(null);
                    }}
                    vendorId={vendor?.uid || vendor?.id || vendorId}
                    vendorName={vendor?.businessName || 'Vendor'}
                    vendorImage={vendor?.businessImage || vendor?.business_image}
                    product={selectedProductForOrder}
                    navigation={navigation}
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
    scrollContent: {
        paddingBottom: 50,
    },
    // Banner
    bannerContainer: {
        height: X_THEME.bannerHeight,
        width: '100%',
    },
    banner: {
        width: '100%',
        height: '100%',
    },
    backButton: {
        position: 'absolute',
        top: 40,
        left: 20,
        backgroundColor: 'rgba(0,0,0,0.3)',
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backButtonText: {
        color: 'white',
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: -2,
    },
    // Header
    profileHeader: {
        paddingHorizontal: SPACING.md,
    },
    avatarContainer: {
        marginTop: -(X_THEME.avatarSize / 2),
        marginBottom: SPACING.sm,
        borderWidth: 4,
        borderColor: colors.background,
        borderRadius: X_THEME.avatarSize / 2,
        width: X_THEME.avatarSize,
        height: X_THEME.avatarSize,
        position: 'relative',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
        borderRadius: (X_THEME.avatarSize / 2) - 4,
        resizeMode: 'cover',
    },
    avatarPlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 32,
        fontWeight: 'bold',
        color: colors.primary,
    },
    // Action Bars
    topIconBar: {
        position: 'absolute',
        top: SPACING.xs,
        right: SPACING.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    utilityIconButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        ...SHADOWS.small,
    },
    actionIcon: {
        fontSize: 16,
    },
    actionIconActive: {},
    primaryActionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
        marginTop: SPACING.md,
        marginBottom: SPACING.xs,
    },
    chatActionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: BORDER_RADIUS.round,
        borderWidth: 1.5,
        borderColor: colors.border,
        backgroundColor: colors.surface,
    },
    chatActionText: {
        fontSize: FONT_SIZES.sm,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    callActionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: colors.primary,
        ...SHADOWS.small,
    },
    callActionText: {
        fontSize: FONT_SIZES.sm,
        fontWeight: 'bold',
        color: colors.textInverse,
    },
    reviewActionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: '#F59E0B' + '15',
        borderWidth: 1.5,
        borderColor: '#F59E0B' + '50',
    },
    reviewActionText: {
        fontSize: FONT_SIZES.sm,
        fontWeight: 'bold',
        color: '#D97706',
    },
    quickReviewCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        marginTop: SPACING.md,
        borderWidth: 1,
        borderColor: '#F59E0B' + '40',
        gap: SPACING.sm,
    },
    quickReviewTitle: {
        fontSize: FONT_SIZES.sm,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    quickReviewSub: {
        fontSize: FONT_SIZES.xs,
        color: colors.textSecondary,
        marginTop: 2,
    },
    quickReviewBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#F59E0B',
        paddingHorizontal: SPACING.md,
        paddingVertical: 8,
        borderRadius: BORDER_RADIUS.round,
    },
    quickReviewBtnText: {
        fontSize: FONT_SIZES.xs,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    // Info
    infoContainer: {
        marginBottom: SPACING.md,
    },
    businessName: {
        fontSize: FONT_SIZES.xl,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    category: {
        fontSize: FONT_SIZES.sm,
        color: colors.textSecondary,
        marginBottom: SPACING.sm,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: SPACING.md,
        marginTop: SPACING.xs,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    statValue: {
        fontSize: FONT_SIZES.sm,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    statLabel: {
        fontSize: FONT_SIZES.sm,
        color: colors.textSecondary,
    },
    // Tabs
    tabBar: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        marginBottom: SPACING.md,
    },
    tabItem: {
        flex: 1,
        paddingVertical: SPACING.sm,
        alignItems: 'center',
    },
    tabItemActive: {
        borderBottomWidth: 2,
        borderBottomColor: colors.primary,
    },
    tabText: {
        fontSize: FONT_SIZES.md,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    tabTextActive: {
        color: colors.primary,
        fontWeight: 'bold',
    },
    contentArea: {
        paddingVertical: SPACING.xs,
    },
    bodyText: {
        fontSize: FONT_SIZES.md,
        color: colors.textPrimary,
        lineHeight: 22,
    },
    // Business Hours
    hoursSection: {
        marginTop: SPACING.lg,
        padding: SPACING.md,
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    hoursSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.sm,
    },
    hoursSectionTitle: {
        fontSize: FONT_SIZES.md,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    openStatusBadge: {
        paddingHorizontal: SPACING.sm,
        paddingVertical: 2,
        borderRadius: BORDER_RADIUS.sm,
    },
    openBadge: {
        backgroundColor: 'rgba(46, 204, 113, 0.15)',
    },
    closedBadge: {
        backgroundColor: 'rgba(231, 76, 60, 0.15)',
    },
    openStatusText: {
        fontSize: FONT_SIZES.xs,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    hoursList: {
        gap: 6,
    },
    hoursRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 2,
    },
    dayLabel: {
        fontSize: FONT_SIZES.sm,
        fontWeight: '500',
        color: colors.textSecondary,
        width: 100,
    },
    hoursValue: {
        fontSize: FONT_SIZES.sm,
        color: colors.textPrimary,
        flex: 1,
        textAlign: 'right',
    },
    closedText: {
        color: colors.textTertiary,
        fontStyle: 'italic',
    },
    noHoursText: {
        fontSize: FONT_SIZES.sm,
        color: colors.textTertiary,
        fontStyle: 'italic',
    },
    // Reviews
    reviewCta: {
        backgroundColor: colors.surface,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        marginBottom: SPACING.md,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    reviewCtaText: {
        fontSize: FONT_SIZES.md,
        color: colors.textPrimary,
        marginBottom: SPACING.sm,
    },
    writeReviewBtn: {
        backgroundColor: colors.primary,
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.sm,
        borderRadius: BORDER_RADIUS.round,
    },
    writeReviewBtnText: {
        color: colors.textInverse,
        fontWeight: 'bold',
        fontSize: FONT_SIZES.sm,
    },
    reviewsList: {
        gap: SPACING.sm,
    },
    reviewCard: {
        backgroundColor: colors.surface,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    reviewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.xs,
    },
    reviewerAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.primaryLight,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: SPACING.sm,
    },
    reviewerInitial: {
        color: colors.textInverse,
        fontWeight: 'bold',
        fontSize: FONT_SIZES.md,
    },
    reviewerInfo: {
        flex: 1,
    },
    reviewerName: {
        fontSize: FONT_SIZES.sm,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    reviewDate: {
        fontSize: FONT_SIZES.xs,
        color: colors.textTertiary,
    },
    reviewRating: {
        marginLeft: SPACING.sm,
    },
    ratingStars: {
        fontSize: FONT_SIZES.sm,
    },
    reviewComment: {
        fontSize: FONT_SIZES.sm,
        color: colors.textSecondary,
        marginTop: SPACING.xs,
        lineHeight: 20,
    },
    // Comments Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: BORDER_RADIUS.xl,
        borderTopRightRadius: BORDER_RADIUS.xl,
        paddingHorizontal: SPACING.md,
        paddingTop: SPACING.md,
        paddingBottom: Platform.OS === 'ios' ? 34 : SPACING.md,
        maxHeight: '80%',
        minHeight: '45%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: SPACING.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    modalTitle: {
        fontSize: FONT_SIZES.md,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    commentsLoading: {
        paddingVertical: SPACING.xl,
        alignItems: 'center',
    },
    noCommentsContainer: {
        paddingVertical: SPACING.xl,
        alignItems: 'center',
    },
    noCommentsText: {
        color: colors.textTertiary,
        fontSize: FONT_SIZES.sm,
    },
    commentsList: {
        marginTop: SPACING.sm,
        marginBottom: SPACING.sm,
    },
    commentItem: {
        flexDirection: 'row',
        paddingVertical: SPACING.xs,
        gap: SPACING.sm,
    },
    commentAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.surfaceLight,
    },
    commentTextContainer: {
        flex: 1,
        backgroundColor: colors.background,
        paddingHorizontal: SPACING.sm,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.md,
    },
    commentUserName: {
        fontSize: FONT_SIZES.xs,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    commentBody: {
        fontSize: FONT_SIZES.sm,
        color: colors.textPrimary,
        marginTop: 2,
    },
    commentInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: SPACING.sm,
    },
    commentTextInput: {
        flex: 1,
        backgroundColor: colors.background,
        borderRadius: BORDER_RADIUS.round,
        paddingHorizontal: SPACING.md,
        paddingVertical: 8,
        color: colors.textPrimary,
        fontSize: FONT_SIZES.sm,
    },
    sendCommentButton: {
        padding: 8,
    },
});
