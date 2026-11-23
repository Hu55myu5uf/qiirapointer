import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    Platform,
    StatusBar,
    Animated,
    Linking,
    PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Cached, downscaled images (expo-image) with the same props as React Native Image
import { Image } from '../components/CachedImage';
import { FlashList } from '@shopify/flash-list';
import MapView, { Marker, Callout } from '../components/MapView';
import * as Location from 'expo-location';
import { vendorAPI, clientAPI } from '../services/api';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS, CONTENT_MAX_WIDTH } from '../constants/theme';
import { auth } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';
import { PLACEHOLDER_AVATARS } from '../assets';
import Ionicons from '@expo/vector-icons/Ionicons';
import { VerificationBadgeInline, AvatarVerificationBadge } from '../components/VerificationBadge';
import CartButton from '../components/CartButton';
import BrandHeader, { HeaderIconButton, useCollapsibleHeader } from '../components/BrandHeader';
import { useAuthStore } from '../store/authStore';
import { confirmAction } from '../utils/alert';
import CallOptionModal from '../components/CallOptionModal';
import TabSwipeHandler from '../components/TabSwipeHandler';
import { openChat } from '../navigation/openChat';
import { POPULAR_CATEGORIES, mainCategoryOf } from '../constants/categories';

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
        openChat(navigation, {
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
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => getStyles(colors, insets.top), [colors, insets.top]);
    // The map view keeps a fixed top bar; the list lets it slide away while scrolling
    const { userRole } = useAuthStore();

    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
    const collapsible = useCollapsibleHeader(viewMode === 'list');
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

    // Every vendor from the server (search applied); category / rating / sort are applied on the device
    const [allVendors, setAllVendors] = useState<Vendor[]>([]);

    // Category chips: the app's real main categories. Ones that currently have vendors come
    // first (with a count), so every chip a person taps actually leads somewhere.
    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const v of allVendors) {
            const main = mainCategoryOf(v.category);
            if (main) counts[main] = (counts[main] || 0) + 1;
        }
        return counts;
    }, [allVendors]);

    const categories = useMemo(() => {
        const withVendors = Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a] || a.localeCompare(b));
        const others = POPULAR_CATEGORIES.filter(c => c !== 'All' && !categoryCounts[c]);
        return ['All', ...withVendors, ...others];
    }, [categoryCounts]);

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

    // Search waits until typing pauses (one request instead of one per keystroke)
    const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
        return () => clearTimeout(t);
    }, [searchQuery]);

    useEffect(() => {
        fetchVendors();
    }, [debouncedSearch]);

    const fetchVendors = async () => {
        try {
            setLoading(true);
            // Request the full list (server max 100); filtering and sorting happen on the device
            const params: any = { limit: 100 };
            if (debouncedSearch) {
                params.search = debouncedSearch;
            }
            const response = await vendorAPI.getAll(params);
            // Only businesses that have finished their profile (a category) are listed
            const list: Vendor[] = (response.data.vendors || []).filter((v: Vendor) => Boolean(mainCategoryOf(v.category)));
            setAllVendors(list);
        } catch (error) {
            console.error('Error fetching vendors:', error);
            Alert.alert('Error', 'Failed to load vendors');
        } finally {
            setLoading(false);
        }
    };

    // Apply the category tab, minimum rating and sort order
    useEffect(() => {
        let filteredVendors = [...allVendors];

        if (selectedCategory && selectedCategory !== 'All') {
            filteredVendors = filteredVendors.filter((v: Vendor) => mainCategoryOf(v.category) === selectedCategory);
        }

        if (minRating > 0) {
            filteredVendors = filteredVendors.filter(
                (v: Vendor) => (v.averageRating || 0) >= minRating
            );
        }

        if (sortBy === 'rating') {
            filteredVendors.sort(
                (a: Vendor, b: Vendor) => (b.averageRating || 0) - (a.averageRating || 0)
            );
        } else if (sortBy === 'nearest' && userLocation) {
            const dist = (v: Vendor) => v.location
                ? calculateDistance(userLocation.latitude, userLocation.longitude, v.location.latitude, v.location.longitude)
                : Infinity;
            filteredVendors.sort((a: Vendor, b: Vendor) => dist(a) - dist(b));
        } else if (sortBy === 'newest') {
            filteredVendors.sort(
                (a: any, b: any) =>
                    new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
            );
        }

        setVendors(filteredVendors);
    }, [allVendors, selectedCategory, minRating, sortBy, userLocation]);

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
        <TabSwipeHandler currentTab="Home" navigation={navigation}>
            <View style={styles.container}>
                {/* Top area: Pointer bar + search + categories; slides away while scrolling the list */}
            <Animated.View style={collapsible.style} onLayout={collapsible.onLayout}>
            <BrandHeader
                navigation={navigation}
                actions={
                    <>
                        {userRole === 'admin' ? (
                            <HeaderIconButton
                                icon="log-out-outline"
                                label="Log out"
                                onPress={() => confirmAction('Log Out', 'Are you sure you want to log out?', () => auth.signOut(), 'Log Out')}
                            />
                        ) : (
                            <View style={styles.headerCart}><CartButton size={22} onPress={() => navigation.navigate('Cart')} /></View>
                        )}
                        <HeaderIconButton icon="home-outline" label="Homes and spaces for rent or sale" onPress={() => navigation.navigate('Listings')} />
                        <HeaderIconButton
                            icon={viewMode === 'list' ? 'map-outline' : 'list-outline'}
                            label={viewMode === 'list' ? 'Show map' : 'Show list'}
                            onPress={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
                        />
                    </>
                }
            >
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
                {categories.map((item) => {
                    const isActive = item === 'All' ? !selectedCategory : selectedCategory === item;
                    const count = item === 'All' ? allVendors.length : (categoryCounts[item] || 0);
                    return (
                        <TouchableOpacity
                            key={item}
                            style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                            onPress={() => setSelectedCategory(item === 'All' ? '' : item)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isActive }}
                        >
                            <Text style={[styles.categoryText, isActive && styles.categoryTextActive]}>
                                {item}{count > 0 ? `  ${count}` : ''}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
            </BrandHeader>
            </Animated.View>
            {collapsible.statusBarCover}

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
                    <Text style={styles.emptyText}>
                        {selectedCategory ? `No vendors in ${selectedCategory} yet` : 'No vendors found'}
                    </Text>
                </View>
            ) : (
                <View style={styles.listColumn}>
                    <FlashList
                        data={vendors}
                        keyExtractor={(item) => item.id}
                        renderItem={renderVendorCard}
                        contentContainerStyle={{ ...styles.listContent, paddingTop: collapsible.height + SPACING.sm }}
                        onScroll={collapsible.onScroll}
                        scrollEventThrottle={16}
                    />
                </View>
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
        </TabSwipeHandler>
    );
}

const getStyles = (colors: any, topInset: number = 0) => {
    // Real safe-area inset (notch, punch-hole camera, landscape); fall back to the status bar height
    const statusBarHeight = topInset || (Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0);
    return StyleSheet.create({
        // Centred column on tablets / landscape (FlashList sizes rows from its own width)
        listColumn: {
            flex: 1,
            width: '100%',
            maxWidth: CONTENT_MAX_WIDTH,
            alignSelf: 'center',
        },
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
        headerCart: {
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
        },
        searchContainer: {
            paddingHorizontal: SPACING.md,
            paddingTop: SPACING.xs,
            paddingBottom: SPACING.sm,
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACING.sm,
        },
        searchInput: {
            flex: 1,
            backgroundColor: colors.surfaceLight,
            borderRadius: BORDER_RADIUS.md,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: SPACING.md,
            paddingVertical: Platform.OS === 'ios' ? 10 : 6,
            minHeight: 40,
            fontSize: FONT_SIZES.sm,
            color: colors.textPrimary,
        },
        filterButton: {
            backgroundColor: colors.surfaceLight,
            borderWidth: 1,
            borderColor: colors.border,
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: BORDER_RADIUS.md,
        },
        filterButtonText: {
            fontSize: FONT_SIZES.lg,
        },
        categoriesContainer: {
            paddingHorizontal: SPACING.md,
            marginBottom: SPACING.sm,
            flexGrow: 0,
        },
        categoriesContent: {
            alignItems: 'center' as const,
            paddingRight: SPACING.md,
        },
        categoryChip: {
            paddingHorizontal: SPACING.sm + 4,
            paddingVertical: 5,
            borderRadius: BORDER_RADIUS.round,
            backgroundColor: colors.surfaceLight,
            marginRight: SPACING.xs + 2,
            borderWidth: 1,
            borderColor: colors.border,
            minHeight: 32,
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
            // Bottom sheet: full width on phones, a centred card-width sheet on tablets / landscape
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
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
