import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Dimensions,
    Modal,
    ScrollView,
    Platform,
    Image,
    StatusBar,
    Animated,
    Linking,
    PanResponder,
} from 'react-native';
import MapView, { Marker, Callout } from '../components/MapView';
import * as Location from 'expo-location';
import { vendorAPI, clientAPI } from '../services/api';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { auth } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';
import { PLACEHOLDER_AVATARS } from '../assets';
import Ionicons from '@expo/vector-icons/Ionicons';
import { VerificationBadgeInline, AvatarVerificationBadge } from '../components/VerificationBadge';
import CartButton from '../components/CartButton';
import { useAuthStore } from '../store/authStore';
import { confirmAction } from '../utils/alert';
import CallOptionModal from '../components/CallOptionModal';

// Haversine formula to calculate distance between two coordinates in km
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

interface Vendor {
    id: string;
    businessName: string;
    category: string;
    description: string;
    averageRating?: number;
    totalReviews?: number;
    location?: {
        latitude: number;
        longitude: number;
    };
    address?: string;
}

interface SwipeableVendorCardProps {
    item: Vendor;
    colors: any;
    styles: any;
    navigation: any;
    favoriteIds: Set<string>;
    toggleFavorite: (id: string) => void;
    onCallPress: () => void;
}

const SwipeableVendorCard = ({
    item,
    colors,
    styles,
    navigation,
    favoriteIds,
    toggleFavorite,
    onCallPress,
}: SwipeableVendorCardProps) => {
    const imageUri = (item as any).businessImage || (item as any).business_image;
    const isVendorAdmin = (item as any).role === 'admin' || (item as any).userInfo?.role === 'admin' || (item as any).id === 'v8MwaOet0ISfZAWXIDAPAGcg1td2' || (item as any).uid === 'v8MwaOet0ISfZAWXIDAPAGcg1td2';
    const isVendorVerified = Boolean((item as any).isVerified === true || (item as any).is_verified === true || (item as any).userInfo?.isVerified === true || (item as any).userInfo?.is_verified === true || isVendorAdmin);
    const vendorId = item.id || (item as any).uid || (item as any).userInfo?.uid || '';
    const isFavorited = favoriteIds.has(vendorId);
    const vendorPhone = (item as any).phoneNumber || (item as any).phone_number || (item as any).userInfo?.phoneNumber || '';

    const pan = useRef(new Animated.Value(0)).current;
    const [isOpen, setIsOpen] = useState(false);
    const openOffset = -140;

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5;
            },
            onPanResponderGrant: () => {
                pan.stopAnimation();
            },
            onPanResponderMove: (_, gestureState) => {
                const currentBase = isOpen ? openOffset : 0;
                let newX = currentBase + gestureState.dx;
                if (newX < openOffset - 25) newX = openOffset - 25;
                if (newX > 15) newX = 15;
                pan.setValue(newX);
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dx < -35 || (isOpen && gestureState.dx < 20)) {
                    Animated.spring(pan, {
                        toValue: openOffset,
                        useNativeDriver: true,
                        bounciness: 4,
                    }).start();
                    setIsOpen(true);
                } else {
                    Animated.spring(pan, {
                        toValue: 0,
                        useNativeDriver: true,
                        bounciness: 4,
                    }).start();
                    setIsOpen(false);
                }
            },
            onPanResponderTerminate: () => {
                Animated.spring(pan, {
                    toValue: isOpen ? openOffset : 0,
                    useNativeDriver: true,
                }).start();
            },
        })
    ).current;

    const closeSwipe = () => {
        Animated.spring(pan, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
        }).start();
        setIsOpen(false);
    };

    const handleCall = () => {
        closeSwipe();
        onCallPress();
    };

    const handleChat = () => {
        closeSwipe();
        navigation.navigate('Chat', {
            otherUserId: vendorId,
            otherUserName: item.businessName,
            otherUserImage: imageUri,
            receiverId: vendorId,
            receiverName: item.businessName,
            receiverImage: imageUri,
            vendorId: vendorId,
        });
    };

    return (
        <View style={styles.vendorCardWrapper}>
            {/* Background Action Buttons revealed when swiped */}
            <View style={styles.swipeActionsContainer}>
                <TouchableOpacity
                    style={[styles.swipeAction, { backgroundColor: '#34C759' }]}
                    onPress={handleCall}
                    activeOpacity={0.8}
                >
                    <Ionicons name="call" size={22} color="#fff" />
                    <Text style={styles.swipeActionText}>Call</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.swipeAction, { backgroundColor: colors.primary }]}
                    onPress={handleChat}
                    activeOpacity={0.8}
                >
                    <Ionicons name="chatbubble-ellipses" size={22} color="#fff" />
                    <Text style={styles.swipeActionText}>Message</Text>
                </TouchableOpacity>
            </View>

            {/* Foreground Swipeable Card */}
            <Animated.View
                style={[
                    styles.vendorCardForeground,
                    { transform: [{ translateX: pan }] },
                ]}
                {...panResponder.panHandlers}
            >
                <TouchableOpacity
                    style={styles.vendorCard}
                    onPress={() => {
                        if (isOpen) {
                            closeSwipe();
                        } else {
                            navigation.navigate('VendorDetails', { vendorId });
                        }
                    }}
                    activeOpacity={0.92}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <View style={{ position: 'relative', marginRight: 12 }}>
                            <Image
                                source={imageUri ? { uri: imageUri } : PLACEHOLDER_AVATARS.vendor}
                                style={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 24,
                                    backgroundColor: colors.surfaceLight,
                                }}
                            />
                            <AvatarVerificationBadge
                                isVerified={isVendorVerified}
                                isAdmin={isVendorAdmin}
                                size={16}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <View style={styles.vendorHeader}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, marginRight: SPACING.xs }}>
                                    <Text style={[styles.vendorName, { flexShrink: 1 }]} numberOfLines={1}>{item.businessName}</Text>
                                    <VerificationBadgeInline
                                        isVerified={isVendorVerified}
                                        isAdmin={isVendorAdmin}
                                        size={16}
                                    />
                                </View>
                                {item.averageRating && item.averageRating > 0 ? (
                                    <View style={styles.ratingContainer}>
                                        <Text style={styles.rating}>⭐ {item.averageRating.toFixed(1)}</Text>
                                        <Text style={styles.reviewCount}>({item.totalReviews || 0})</Text>
                                    </View>
                                ) : null}
                            </View>
                            <Text style={styles.category}>{item.category}</Text>
                        </View>

                        {/* Favorite Heart Button */}
                        <TouchableOpacity
                            onPress={(e) => {
                                e.stopPropagation?.();
                                toggleFavorite(vendorId);
                            }}
                            style={styles.favoriteButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Ionicons
                                name={isFavorited ? 'heart' : 'heart-outline'}
                                size={24}
                                color={isFavorited ? '#FF3B5C' : colors.textTertiary}
                            />
                        </TouchableOpacity>
                    </View>

                    {item.description ? (
                        <Text style={styles.description} numberOfLines={2}>
                            {item.description}
                        </Text>
                    ) : null}

                    {/* Bottom Row: Address + Quick Action Icons */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        {item.address ? (
                            <Text style={[styles.address, { flex: 1, marginRight: 8 }]} numberOfLines={1}>
                                📍 {item.address}
                            </Text>
                        ) : <View style={{ flex: 1 }} />}

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TouchableOpacity
                                style={styles.quickActionButton}
                                onPress={(e) => {
                                    e.stopPropagation?.();
                                    handleCall();
                                }}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                                <Ionicons name="call" size={13} color="#34C759" />
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.quickActionButton}
                                onPress={(e) => {
                                    e.stopPropagation?.();
                                    handleChat();
                                }}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                                <Ionicons name="chatbubble" size={13} color={colors.primary} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
};

export default function HomeScreen({ navigation }: any) {
    const { colors } = useTheme();
    const styles = getStyles(colors);
    const { userRole } = useAuthStore();

    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
    const [userLocation, setUserLocation] = useState<any>(null);

    // Filter states
    const [minRating, setMinRating] = useState<number>(0);
    const [sortBy, setSortBy] = useState<'default' | 'rating' | 'nearest' | 'newest'>('default');
    const [showFilterModal, setShowFilterModal] = useState(false);
    const [activeCallVendor, setActiveCallVendor] = useState<any>(null);

    // Favorites state
    const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
    const currentUserId = auth.currentUser?.uid;

    // Fetch favorites on mount
    useEffect(() => {
        if (currentUserId) {
            clientAPI.getFavorites(currentUserId)
                .then(res => {
                    const ids = (res.data.favorites || []).map((f: any) => f.vendorId || f.id);
                    setFavoriteIds(new Set(ids));
                })
                .catch(() => {});
        }
    }, [currentUserId]);

    const toggleFavorite = async (vendorId: string) => {
        if (!currentUserId) {
            Alert.alert('Sign In Required', 'Please sign in to favorite vendors.');
            return;
        }
        const isFav = favoriteIds.has(vendorId);
        // Optimistic update
        setFavoriteIds(prev => {
            const next = new Set(prev);
            if (isFav) next.delete(vendorId);
            else next.add(vendorId);
            return next;
        });
        try {
            if (isFav) {
                await clientAPI.removeFavorite(currentUserId, vendorId);
            } else {
                await clientAPI.addFavorite(currentUserId, vendorId);
            }
        } catch {
            // Revert on error
            setFavoriteIds(prev => {
                const next = new Set(prev);
                if (isFav) next.add(vendorId);
                else next.delete(vendorId);
                return next;
            });
        }
    };

    const categories = [
        'All',
        'Restaurant',
        'Retail',
        'Services',
        'Healthcare',
        'Education',
        'Technology',
    ];

    useEffect(() => {
        (async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                return;
            }

            let location = await Location.getCurrentPositionAsync({});
            setUserLocation({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 0.0922,
                longitudeDelta: 0.0421,
            });
        })();
    }, []);

    useEffect(() => {
        fetchVendors();
    }, [selectedCategory, searchQuery, minRating, sortBy]);

    const fetchVendors = async () => {
        try {
            setLoading(true);
            const params: any = {};
            if (selectedCategory && selectedCategory !== 'All') {
                params.category = selectedCategory;
            }
            if (searchQuery) {
                params.search = searchQuery;
            }

            const response = await vendorAPI.getAll(params);
            let filteredVendors = response.data.vendors || [];

            // Client-side filtering by minimum rating
            if (minRating > 0) {
                filteredVendors = filteredVendors.filter(
                    (v: Vendor) => (v.averageRating || 0) >= minRating
                );
            }

            // Client-side sorting
            if (sortBy === 'rating') {
                filteredVendors.sort(
                    (a: Vendor, b: Vendor) => (b.averageRating || 0) - (a.averageRating || 0)
                );
            } else if (sortBy === 'nearest' && userLocation) {
                filteredVendors.sort((a: Vendor, b: Vendor) => {
                    const distA = a.location
                        ? calculateDistance(
                              userLocation.latitude,
                              userLocation.longitude,
                              a.location.latitude,
                              a.location.longitude
                          )
                        : Infinity;
                    const distB = b.location
                        ? calculateDistance(
                              userLocation.latitude,
                              userLocation.longitude,
                              b.location.latitude,
                              b.location.longitude
                          )
                        : Infinity;
                    return distA - distB;
                });
            } else if (sortBy === 'newest') {
                filteredVendors.sort(
                    (a: any, b: any) =>
                        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
                );
            }

            setVendors(filteredVendors);
        } catch (error) {
            console.error('Error fetching vendors:', error);
            Alert.alert('Error', 'Failed to load vendors');
        } finally {
            setLoading(false);
        }
    };

    const renderVendorCard = ({ item }: { item: Vendor }) => {
        return (
            <SwipeableVendorCard
                key={item.id || (item as any).uid}
                item={item}
                colors={colors}
                styles={styles}
                navigation={navigation}
                favoriteIds={favoriteIds}
                toggleFavorite={toggleFavorite}
                onCallPress={() => setActiveCallVendor(item)}
            />
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerContent}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.headerTitle} numberOfLines={1}>Discover</Text>
                        <Text style={styles.headerSubtitle} numberOfLines={1}>Find the best services near you</Text>
                    </View>
                    <View style={styles.headerActions}>
                        {userRole === 'admin' && (
                            <TouchableOpacity
                                style={styles.viewToggle}
                                onPress={() => confirmAction('Logout', 'Are you sure you want to logout?', () => auth.signOut(), 'Logout')}
                            >
                                <Ionicons name="log-out-outline" size={18} color={colors.textInverse} />
                            </TouchableOpacity>
                        )}
                        {userRole !== 'admin' && <CartButton onPress={() => navigation.navigate('Cart')} />}
                        <TouchableOpacity
                            style={styles.viewToggle}
                            onPress={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
                        >
                            <Ionicons
                                name={viewMode === 'list' ? 'map-outline' : 'list-outline'}
                                size={18}
                                color={colors.textInverse}
                            />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            {/* Search Bar with Filter */}
            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search vendors..."
                    placeholderTextColor={colors.textTertiary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
                <TouchableOpacity
                    style={[
                        styles.filterButton,
                        (minRating > 0 || sortBy !== 'default') && styles.filterActive,
                    ]}
                    onPress={() => setShowFilterModal(true)}
                >
                    <Ionicons
                        name="options-outline"
                        size={20}
                        color={(minRating > 0 || sortBy !== 'default') ? colors.primary : colors.textSecondary}
                    />
                </TouchableOpacity>
            </View>

            {/* Category Filter */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoriesContainer}
                contentContainerStyle={styles.categoriesContent}
            >
                {categories.map((item) => (
                    <TouchableOpacity
                        key={item}
                        style={[
                            styles.categoryChip,
                            selectedCategory === item && styles.categoryChipActive,
                        ]}
                        onPress={() => setSelectedCategory(item === 'All' ? '' : item)}
                    >
                        <Text
                            style={[
                                styles.categoryText,
                                selectedCategory === item && styles.categoryTextActive,
                            ]}
                        >
                            {item}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Content */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : viewMode === 'map' ? (
                <View style={styles.mapContainer}>
                    <MapView
                        style={styles.map}
                        initialRegion={userLocation}
                        showsUserLocation={true}
                        showsMyLocationButton={true}
                    >
                        {vendors.map(
                            (vendor) =>
                                vendor.location && (
                                    <Marker
                                        key={vendor.id}
                                        coordinate={{
                                            latitude: vendor.location.latitude,
                                            longitude: vendor.location.longitude,
                                        }}
                                        title={vendor.businessName}
                                        description={vendor.category}
                                    >
                                        <Callout
                                            onPress={() =>
                                                navigation.navigate('VendorDetails', {
                                                    vendorId: vendor.id,
                                                })
                                            }
                                        >
                                            <View style={styles.callout}>
                                                <Text style={styles.calloutTitle}>
                                                    {vendor.businessName}
                                                </Text>
                                                <Text style={styles.calloutSubtitle}>
                                                    {vendor.category}
                                                </Text>
                                                <Text style={styles.calloutLink}>
                                                    Tap for details
                                                </Text>
                                            </View>
                                        </Callout>
                                    </Marker>
                                )
                        )}
                    </MapView>
                </View>
            ) : vendors.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No vendors found</Text>
                </View>
            ) : (
                <FlatList
                    data={vendors}
                    keyExtractor={(item) => item.id}
                    renderItem={renderVendorCard}
                    contentContainerStyle={styles.listContent}
                />
            )}

            {/* Filter Modal */}
            <Modal
                visible={showFilterModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowFilterModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Filter & Sort</Text>
                            <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                                <Text style={styles.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Rating Filter */}
                        <View style={styles.filterSection}>
                            <Text style={styles.filterLabel}>Minimum Rating</Text>
                            <View style={styles.ratingButtons}>
                                {[0, 3, 3.5, 4, 4.5].map((rating) => (
                                    <TouchableOpacity
                                        key={rating}
                                        style={[
                                            styles.ratingBtn,
                                            minRating === rating && styles.ratingBtnActive,
                                        ]}
                                        onPress={() => setMinRating(rating)}
                                    >
                                        <Text
                                            style={[
                                                styles.ratingBtnText,
                                                minRating === rating && styles.ratingBtnTextActive,
                                            ]}
                                        >
                                            {rating === 0 ? 'All' : `${rating}+`}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Sort By */}
                        <View style={styles.filterSection}>
                            <Text style={styles.filterLabel}>Sort By</Text>
                            <View style={styles.sortButtons}>
                                {[
                                    { key: 'default', label: 'Default' },
                                    { key: 'rating', label: 'Highest Rated' },
                                    { key: 'nearest', label: 'Nearest' },
                                    { key: 'newest', label: 'Newest' },
                                ].map((option) => (
                                    <TouchableOpacity
                                        key={option.key}
                                        style={[
                                            styles.sortBtn,
                                            sortBy === option.key && styles.sortBtnActive,
                                        ]}
                                        onPress={() => setSortBy(option.key as any)}
                                    >
                                        <Text
                                            style={[
                                                styles.sortBtnText,
                                                sortBy === option.key && styles.sortBtnTextActive,
                                            ]}
                                        >
                                            {option.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Apply Button */}
                        <TouchableOpacity
                            style={styles.applyBtn}
                            onPress={() => setShowFilterModal(false)}
                        >
                            <Text style={styles.applyBtnText}>Apply Filters</Text>
                        </TouchableOpacity>

                        {/* Clear Button */}
                        <TouchableOpacity
                            style={styles.clearBtn}
                            onPress={() => {
                                setMinRating(0);
                                setSortBy('default');
                            }}
                        >
                            <Text style={styles.clearBtnText}>Clear All</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Themed Call Options Modal */}
            <CallOptionModal
                visible={Boolean(activeCallVendor)}
                vendor={activeCallVendor}
                onClose={() => setActiveCallVendor(null)}
                navigation={navigation}
            />
        </View>
    );
}

const getStyles = (colors: any) => {
    const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44;
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        header: {
            paddingTop: statusBarHeight + SPACING.sm,
            paddingBottom: SPACING.md,
            paddingHorizontal: SPACING.md,
            backgroundColor: colors.primary,
        },
        headerContent: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        headerActions: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
        },
        headerTitle: {
            fontSize: FONT_SIZES.xl,
            fontWeight: 'bold',
            color: colors.textInverse,
        },
        headerSubtitle: {
            fontSize: FONT_SIZES.xs,
            color: colors.textInverse,
            opacity: 0.85,
            marginTop: 2,
        },
        viewToggle: {
            backgroundColor: 'rgba(255,255,255,0.2)',
            padding: SPACING.sm,
            borderRadius: BORDER_RADIUS.round,
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
        },
        viewToggleText: {
            color: colors.textInverse,
            fontWeight: 'bold',
            fontSize: FONT_SIZES.sm,
        },
        searchContainer: {
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.sm,
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACING.sm,
        },
        searchInput: {
            flex: 1,
            backgroundColor: colors.surface,
            borderRadius: BORDER_RADIUS.md,
            paddingHorizontal: SPACING.md,
            paddingVertical: Platform.OS === 'ios' ? SPACING.md : SPACING.sm,
            fontSize: FONT_SIZES.sm,
            color: colors.textPrimary,
            ...SHADOWS.small,
        },
        filterButton: {
            backgroundColor: colors.surface,
            padding: SPACING.sm + 2,
            borderRadius: BORDER_RADIUS.md,
            ...SHADOWS.small,
        },
        filterButtonText: {
            fontSize: FONT_SIZES.lg,
        },
        categoriesContainer: {
            paddingHorizontal: SPACING.md,
            marginBottom: SPACING.sm,
            maxHeight: 44,
            flexGrow: 0,
        },
        categoriesContent: {
            alignItems: 'center' as const,
            paddingRight: SPACING.md,
        },
        categoryChip: {
            paddingHorizontal: SPACING.md,
            paddingVertical: 6,
            borderRadius: BORDER_RADIUS.round,
            backgroundColor: colors.surface,
            marginRight: SPACING.xs + 2,
            borderWidth: 1,
            borderColor: colors.border,
            height: 32,
            justifyContent: 'center',
        },
        categoryChipActive: {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
        },
        categoryText: {
            fontSize: FONT_SIZES.xs,
            color: colors.textSecondary,
        },
        categoryTextActive: {
            color: colors.textInverse,
            fontWeight: 'bold',
        },
        listContent: {
            padding: SPACING.md,
        },
        vendorCardWrapper: {
            position: 'relative',
            marginBottom: SPACING.sm,
            borderRadius: BORDER_RADIUS.lg,
            overflow: 'hidden',
            backgroundColor: colors.surface,
            ...SHADOWS.small,
        },
        swipeActionsContainer: {
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 140,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            zIndex: 0,
        },
        swipeAction: {
            width: 70,
            height: '100%',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 4,
        },
        swipeActionText: {
            color: '#fff',
            fontSize: 11,
            fontWeight: '700',
        },
        vendorCardForeground: {
            backgroundColor: colors.surface,
            zIndex: 1,
        },
        vendorCard: {
            backgroundColor: colors.surface,
            padding: SPACING.md,
            borderRadius: BORDER_RADIUS.lg,
        },
        favoriteButton: {
            padding: 4,
            marginLeft: 4,
        },
        quickActionButton: {
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: colors.surfaceLight,
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.border,
        },
        vendorHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: SPACING.xs,
        },
        vendorName: {
            fontSize: FONT_SIZES.lg,
            fontWeight: 'bold',
            color: colors.textPrimary,
            flexShrink: 1,
        },
        ratingContainer: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        rating: {
            fontSize: FONT_SIZES.sm,
            color: colors.textPrimary,
            fontWeight: '600',
        },
        reviewCount: {
            fontSize: FONT_SIZES.xs,
            color: colors.textTertiary,
            marginLeft: SPACING.xs,
        },
        category: {
            fontSize: FONT_SIZES.sm,
            color: colors.primary,
            fontWeight: '600',
            marginBottom: SPACING.xs,
        },
        description: {
            fontSize: FONT_SIZES.sm,
            color: colors.textSecondary,
            lineHeight: 20,
            marginBottom: SPACING.xs,
        },
        address: {
            fontSize: FONT_SIZES.xs,
            color: colors.textTertiary,
        },
        loadingContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
        emptyContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
        emptyText: {
            fontSize: FONT_SIZES.md,
            color: colors.textTertiary,
        },
        mapContainer: {
            flex: 1,
            minHeight: 450,
        },
        map: {
            width: '100%',
            height: '100%',
            minHeight: 450,
        },
        callout: {
            width: 150,
            padding: SPACING.xs,
        },
        calloutTitle: {
            fontWeight: 'bold',
            fontSize: FONT_SIZES.sm,
            marginBottom: 2,
        },
        calloutSubtitle: {
            fontSize: FONT_SIZES.xs,
            color: colors.textSecondary,
            marginBottom: 4,
        },
        calloutLink: {
            fontSize: FONT_SIZES.xs,
            color: colors.primary,
            fontWeight: 'bold',
        },
        // Filter Modal Styles
        filterActive: {
            backgroundColor: colors.primary,
        },
        modalOverlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'flex-end',
        },
        modalContent: {
            backgroundColor: colors.surface,
            borderTopLeftRadius: BORDER_RADIUS.xl,
            borderTopRightRadius: BORDER_RADIUS.xl,
            padding: SPACING.lg,
            paddingBottom: SPACING.xl,
        },
        modalHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: SPACING.lg,
        },
        modalTitle: {
            fontSize: FONT_SIZES.xl,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        modalClose: {
            fontSize: FONT_SIZES.xl,
            color: colors.textSecondary,
        },
        filterSection: {
            marginBottom: SPACING.lg,
        },
        filterLabel: {
            fontSize: FONT_SIZES.md,
            fontWeight: '600',
            color: colors.textPrimary,
            marginBottom: SPACING.sm,
        },
        ratingButtons: {
            flexDirection: 'row',
            gap: SPACING.sm,
        },
        ratingBtn: {
            paddingVertical: SPACING.sm,
            paddingHorizontal: SPACING.md,
            borderRadius: BORDER_RADIUS.round,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
        },
        ratingBtnActive: {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
        },
        ratingBtnText: {
            fontSize: FONT_SIZES.sm,
            color: colors.textSecondary,
        },
        ratingBtnTextActive: {
            color: colors.textInverse,
            fontWeight: 'bold',
        },
        sortButtons: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: SPACING.sm,
        },
        sortBtn: {
            paddingVertical: SPACING.sm,
            paddingHorizontal: SPACING.md,
            borderRadius: BORDER_RADIUS.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
        },
        sortBtnActive: {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
        },
        sortBtnText: {
            fontSize: FONT_SIZES.sm,
            color: colors.textSecondary,
        },
        sortBtnTextActive: {
            color: colors.textInverse,
            fontWeight: 'bold',
        },
        applyBtn: {
            backgroundColor: colors.primary,
            paddingVertical: SPACING.md,
            borderRadius: BORDER_RADIUS.md,
            alignItems: 'center',
            marginTop: SPACING.md,
        },
        applyBtnText: {
            color: colors.textInverse,
            fontWeight: 'bold',
            fontSize: FONT_SIZES.md,
        },
        clearBtn: {
            paddingVertical: SPACING.sm,
            alignItems: 'center',
            marginTop: SPACING.sm,
        },
        clearBtnText: {
            color: colors.textSecondary,
            fontSize: FONT_SIZES.sm,
        },
    });
};
