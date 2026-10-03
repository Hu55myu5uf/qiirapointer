import React, { useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Dimensions,
    TouchableOpacity,
    Image,
    Platform,
    ViewToken,
    Animated,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { AvatarVerificationBadge, VerificationBadgeInline } from './VerificationBadge';
import { PLACEHOLDER_AVATARS } from '../assets';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Curated high quality showcase reels when feed has no reels yet
const CURATED_SHOWCASES = [
    {
        id: 'curated-reel-1',
        type: 'reel',
        authorType: 'vendor',
        vendorId: 'vendor-couture',
        vendorName: 'Aura Haute Couture',
        vendorCategory: 'Fashion & Retail',
        vendorImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
        isVerified: true,
        mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800',
        caption: 'Handcrafted luxury gowns and bespoke tailoring. Every stitch tells an authentic story ✨ #AuraCouture #BespokeFashion #QIIRA',
        likesCount: 142,
        commentsCount: 19,
        isLiked: false,
        price: 85000,
        currency: 'NGN',
    },
    {
        id: 'curated-reel-2',
        type: 'reel',
        authorType: 'vendor',
        vendorId: 'vendor-culinary',
        vendorName: 'Maison Gourmet Abuja',
        vendorCategory: 'Food & Dining',
        vendorImage: 'https://images.unsplash.com/photo-1583394293214-28ded15ee548?w=200',
        isVerified: true,
        mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800',
        caption: 'Artisan wood-fired delicacies prepared daily with organic local ingredients. Reserve your table or order online! 🍕🍷',
        likesCount: 98,
        commentsCount: 12,
        isLiked: false,
        price: 14000,
        currency: 'NGN',
    },
    {
        id: 'curated-reel-3',
        type: 'reel',
        authorType: 'vendor',
        vendorId: 'vendor-tech',
        vendorName: 'Apex Luxe Audio',
        vendorCategory: 'Electronics',
        vendorImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
        isVerified: true,
        mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800',
        caption: 'Pure acoustic perfection. Wireless noise-canceling headphones with 40hr battery life. Available now with nationwide express delivery 🎧⚡',
        likesCount: 215,
        commentsCount: 28,
        isLiked: false,
        price: 95000,
        currency: 'NGN',
    },
];

interface ShowcaseItemProps {
    item: any;
    isActive: boolean;
    isMuted: boolean;
    containerHeight: number;
    containerWidth: number;
    onToggleMute: () => void;
    onLike: (id: string) => void;
    onComment: (item: any) => void;
    onShare: (item: any) => void;
    onChat: (item: any) => void;
    onVendorPress: (vendorId: string) => void;
    onAddToCart?: (item: any) => void;
    isInCart?: boolean;
}

function ShowcaseItemCard({
    item,
    isActive,
    isMuted,
    containerHeight,
    containerWidth,
    onToggleMute,
    onLike,
    onComment,
    onShare,
    onChat,
    onVendorPress,
    onAddToCart,
    isInCart,
}: ShowcaseItemProps) {
    const videoRef = useRef<any>(null);
    const [isPaused, setIsPaused] = useState(false);
    const [showPauseOverlay, setShowPauseOverlay] = useState(false);
    const [expandedCaption, setExpandedCaption] = useState(false);

    // Identify if media is video or image
    const mediaUri = item.mediaUrl || item.videoUrl || item.thumbnailUrl || (item.mediaUrls && item.mediaUrls[0]) || '';
    const isVideo =
        mediaUri.endsWith('.mp4') ||
        mediaUri.endsWith('.mov') ||
        mediaUri.endsWith('.webm') ||
        mediaUri.includes('gtv-videos') ||
        item.mediaType === 'video' ||
        item.type === 'reel';

    const handleTapScreen = () => {
        setIsPaused((prev) => !prev);
        setShowPauseOverlay(true);
        setTimeout(() => setShowPauseOverlay(false), 900);
    };

    return (
        <View style={{ width: containerWidth, height: containerHeight, backgroundColor: '#000', position: 'relative' }}>
            {/* Background Media */}
            <TouchableOpacity
                activeOpacity={1}
                onPress={handleTapScreen}
                style={StyleSheet.absoluteFill}
            >
                {isVideo ? (
                    <Video
                        ref={videoRef}
                        source={{ uri: mediaUri }}
                        style={StyleSheet.absoluteFill}
                        resizeMode={ResizeMode.COVER}
                        isLooping
                        shouldPlay={isActive && !isPaused}
                        isMuted={isMuted}
                        useNativeControls={false}
                    />
                ) : (
                    <Image
                        source={{ uri: mediaUri || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800' }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                    />
                )}

                {/* Subtle gradient vignette at bottom */}
                <View
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: 260,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                    }}
                />
            </TouchableOpacity>

            {/* Play/Pause indicator overlay */}
            {showPauseOverlay && (
                <View style={styles.centerIconOverlay} pointerEvents="none">
                    <View style={styles.centerIconCircle}>
                        <Ionicons
                            name={isPaused ? 'play' : 'pause'}
                            size={44}
                            color="#FFFFFF"
                        />
                    </View>
                </View>
            )}

            {/* Top Showcase indicator */}
            <View style={styles.topBadgeRow} pointerEvents="none">
                <View style={styles.showcaseLiveBadge}>
                    <Ionicons name="film-outline" size={13} color="#FFFFFF" />
                    <Text style={styles.showcaseLiveBadgeText}>QIIRA SHOWCASE</Text>
                </View>
            </View>

            {/* Right Side Action Column */}
            <View style={styles.rightActionColumn}>
                {/* Author Avatar */}
                <TouchableOpacity
                    style={styles.avatarActionContainer}
                    onPress={() => onVendorPress(item.vendorId || item.authorId)}
                    activeOpacity={0.8}
                >
                    <Image
                        source={
                            item.vendorImage
                                ? { uri: item.vendorImage }
                                : item.authorAvatar
                                ? { uri: item.authorAvatar }
                                : PLACEHOLDER_AVATARS.vendor
                        }
                        style={styles.actionAvatar}
                    />
                    <AvatarVerificationBadge
                        isVerified={Boolean(item.isVerified || item.is_verified || item.isAdmin)}
                        isAdmin={Boolean(item.isAdmin)}
                        size={14}
                    />
                </TouchableOpacity>

                {/* Like Button */}
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => onLike(item.id)}
                    activeOpacity={0.7}
                >
                    <View style={styles.actionIconCircle}>
                        <Ionicons
                            name={item.isLiked ? 'heart' : 'heart-outline'}
                            size={28}
                            color={item.isLiked ? '#EF4444' : '#FFFFFF'}
                        />
                    </View>
                    <Text style={[styles.actionCountText, item.isLiked && { color: '#EF4444' }]}>
                        {item.likesCount || 0}
                    </Text>
                </TouchableOpacity>

                {/* Comment Button */}
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => onComment(item)}
                    activeOpacity={0.7}
                >
                    <View style={styles.actionIconCircle}>
                        <Ionicons name="chatbubble-ellipses" size={26} color="#FFFFFF" />
                    </View>
                    <Text style={styles.actionCountText}>{item.commentsCount || 0}</Text>
                </TouchableOpacity>

                {/* Share Button */}
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => onShare(item)}
                    activeOpacity={0.7}
                >
                    <View style={styles.actionIconCircle}>
                        <Ionicons name="share-social" size={26} color="#FFFFFF" />
                    </View>
                    <Text style={styles.actionCountText}>Share</Text>
                </TouchableOpacity>

                {/* Sound Mute / Unmute */}
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={onToggleMute}
                    activeOpacity={0.7}
                >
                    <View style={styles.actionIconCircle}>
                        <Ionicons
                            name={isMuted ? 'volume-mute' : 'volume-high'}
                            size={24}
                            color="#FFFFFF"
                        />
                    </View>
                    <Text style={styles.actionCountText}>{isMuted ? 'Muted' : 'Sound'}</Text>
                </TouchableOpacity>

                {/* Inquire / Chat Button */}
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => onChat(item)}
                    activeOpacity={0.7}
                >
                    <View style={[styles.actionIconCircle, { backgroundColor: '#B28A45' }]}>
                        <Ionicons name="paper-plane" size={22} color="#FFFFFF" />
                    </View>
                    <Text style={styles.actionCountText}>Chat</Text>
                </TouchableOpacity>

                {/* Add to Cart (Vendors only) */}
                {item.price ? (
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => onAddToCart?.(item)}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.actionIconCircle, isInCart && { backgroundColor: '#10B981' }]}>
                            <Ionicons name={isInCart ? 'cart' : 'cart-outline'} size={24} color="#FFFFFF" />
                        </View>
                        <Text style={styles.actionCountText}>{isInCart ? 'Saved' : 'Cart'}</Text>
                    </TouchableOpacity>
                ) : null}
            </View>

            {/* Bottom Info Overlay */}
            <View style={styles.bottomInfoContainer}>
                {/* Vendor / Author Name & Category */}
                <TouchableOpacity
                    style={styles.authorRow}
                    onPress={() => onVendorPress(item.vendorId || item.authorId)}
                    activeOpacity={0.8}
                >
                    <Text style={styles.authorName} numberOfLines={1}>
                        @{item.vendorName || item.authorName || 'qiiravendor'}
                    </Text>
                    <VerificationBadgeInline
                        isVerified={Boolean(item.isVerified || item.is_verified || item.isAdmin)}
                        isAdmin={Boolean(item.isAdmin)}
                        size={15}
                    />
                    {item.vendorCategory ? (
                        <View style={styles.categoryPill}>
                            <Text style={styles.categoryPillText}>{item.vendorCategory}</Text>
                        </View>
                    ) : null}
                </TouchableOpacity>

                {/* Price tag if present */}
                {item.price ? (
                    <View style={styles.priceRow}>
                        <Text style={styles.priceTag}>
                            {item.currency || 'NGN'} {Number(item.price).toLocaleString()}
                        </Text>
                    </View>
                ) : null}

                {/* Caption text */}
                <TouchableOpacity
                    onPress={() => setExpandedCaption((prev) => !prev)}
                    activeOpacity={0.9}
                >
                    <Text
                        style={styles.captionText}
                        numberOfLines={expandedCaption ? undefined : 2}
                    >
                        {item.caption || 'Authentic showcase on QIIRAPOINTER'}
                    </Text>
                </TouchableOpacity>

                {/* Audio track tag */}
                <View style={styles.audioRow}>
                    <Ionicons name="musical-notes" size={14} color="#B28A45" />
                    <Text style={styles.audioText} numberOfLines={1}>
                        Original Sound • {item.vendorName || 'QIIRA Showcase'}
                    </Text>
                </View>
            </View>
        </View>
    );
}

interface ShowcaseFeedProps {
    posts: any[];
    isFocused: boolean;
    onLike: (id: string) => void;
    onComment: (item: any) => void;
    onShare: (item: any) => void;
    onChat: (item: any) => void;
    onVendorPress: (vendorId: string) => void;
    onAddToCart?: (item: any) => void;
    isInCart?: (id: string) => boolean;
    onRefresh?: () => void;
    refreshing?: boolean;
}

export default function ShowcaseFeed({
    posts,
    isFocused,
    onLike,
    onComment,
    onShare,
    onChat,
    onVendorPress,
    onAddToCart,
    isInCart,
    onRefresh,
    refreshing,
}: ShowcaseFeedProps) {
    const { colors } = useTheme();
    const [activeIndex, setActiveIndex] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [containerHeight, setContainerHeight] = useState(SCREEN_HEIGHT - 170);
    const containerWidth = Math.min(SCREEN_WIDTH, 680);

    // Filter reels or showcase items; fallback to curated showcase list if empty
    const showcasePosts = React.useMemo(() => {
        const filtered = posts.filter(
            (p) =>
                p.type === 'reel' ||
                p.type === 'showcase' ||
                (p.mediaUrl && (p.mediaUrl.endsWith('.mp4') || p.mediaUrl.endsWith('.mov') || p.mediaUrl.includes('gtv-videos')))
        );
        return filtered.length > 0 ? filtered : CURATED_SHOWCASES;
    }, [posts]);

    const onViewableItemsChanged = useRef(
        ({ viewableItems }: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
            if (viewableItems && viewableItems.length > 0 && typeof viewableItems[0].index === 'number') {
                setActiveIndex(viewableItems[0].index);
            }
        }
    ).current;

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 60,
    }).current;

    const handleLayout = (event: any) => {
        const h = event.nativeEvent.layout.height;
        if (h > 200) {
            setContainerHeight(h);
        }
    };

    return (
        <View style={styles.container} onLayout={handleLayout}>
            <FlatList
                data={showcasePosts}
                keyExtractor={(item) => item.id}
                renderItem={({ item, index }) => (
                    <ShowcaseItemCard
                        item={item}
                        isActive={index === activeIndex && isFocused}
                        isMuted={isMuted}
                        containerHeight={containerHeight}
                        containerWidth={containerWidth}
                        onToggleMute={() => setIsMuted((prev) => !prev)}
                        onLike={onLike}
                        onComment={onComment}
                        onShare={onShare}
                        onChat={onChat}
                        onVendorPress={onVendorPress}
                        onAddToCart={onAddToCart}
                        isInCart={isInCart ? isInCart(item.id) : false}
                    />
                )}
                pagingEnabled
                showsVerticalScrollIndicator={false}
                snapToInterval={containerHeight}
                snapToAlignment="start"
                decelerationRate="fast"
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                onRefresh={onRefresh}
                refreshing={refreshing}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
        alignItems: 'center',
    },
    centerIconOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    centerIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(0,0,0,0.65)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    topBadgeRow: {
        position: 'absolute',
        top: SPACING.md,
        left: SPACING.md,
        zIndex: 10,
    },
    showcaseLiveBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(0,0,0,0.65)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.round,
    },
    showcaseLiveBadgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    rightActionColumn: {
        position: 'absolute',
        right: SPACING.md,
        bottom: 80,
        alignItems: 'center',
        gap: 14,
        zIndex: 10,
    },
    avatarActionContainer: {
        position: 'relative',
        marginBottom: 4,
    },
    actionAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 2,
        borderColor: '#B28A45',
        backgroundColor: '#1E1E1E',
    },
    actionButton: {
        alignItems: 'center',
        gap: 3,
    },
    actionIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionCountText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '700',
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    bottomInfoContainer: {
        position: 'absolute',
        left: SPACING.md,
        right: 80,
        bottom: 24,
        zIndex: 10,
    },
    authorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    authorName: {
        color: '#FFFFFF',
        fontSize: FONT_SIZES.md,
        fontWeight: '800',
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    categoryPill: {
        backgroundColor: 'rgba(178, 138, 69, 0.4)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: BORDER_RADIUS.round,
        borderWidth: 1,
        borderColor: '#B28A45',
    },
    categoryPillText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '700',
    },
    priceRow: {
        marginBottom: 4,
    },
    priceTag: {
        color: '#10B981',
        fontSize: FONT_SIZES.sm,
        fontWeight: '900',
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    captionText: {
        color: 'rgba(255,255,255,0.92)',
        fontSize: FONT_SIZES.sm,
        lineHeight: 20,
        marginBottom: 8,
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    audioRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    audioText: {
        color: '#B28A45',
        fontSize: 11,
        fontWeight: '600',
    },
});
