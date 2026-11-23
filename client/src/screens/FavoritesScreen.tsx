import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    RefreshControl,
    Platform,
    StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Cached, downscaled images (expo-image) with the same props as React Native Image
import { Image } from '../components/CachedImage';
import { clientAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS, CONTENT_MAX_WIDTH } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { PLACEHOLDER_AVATARS } from '../assets';
import { VerificationBadgeInline, AvatarVerificationBadge } from '../components/VerificationBadge';
import TabSwipeHandler from '../components/TabSwipeHandler';
import BrandHeader from '../components/BrandHeader';

export default function FavoritesScreen({ navigation }: any) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => getStyles(colors, insets.top), [colors, insets.top]);

    const { user } = useAuthStore();
    const [favorites, setFavorites] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            fetchFavorites();
        });
        return unsubscribe;
    }, [navigation, user]);

    const fetchFavorites = async () => {
        if (!user) return;
        try {
            const response = await clientAPI.getFavorites(user.uid);
            setFavorites(response.data.favorites || []);
        } catch (error) {
            console.error('Error fetching favorites:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRemove = async (vendorId: string) => {
        if (!user) return;
        try {
            await clientAPI.removeFavorite(user.uid, vendorId);
            setFavorites((prev) => prev.filter((f) => f.id !== vendorId && f.uid !== vendorId));
        } catch (error) {
            Alert.alert('Error', 'Failed to remove favorite');
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchFavorites();
    };

    const renderItem = ({ item }: { item: any }) => {
        const imageUri = item.businessImage || item.business_image;
        const isVerified = Boolean(item.isVerified ?? item.is_verified);
        const isAdmin = item.role === 'admin' || item.userInfo?.role === 'admin';

        return (
            <TouchableOpacity
                style={styles.card}
                onPress={() =>
                    navigation.navigate('Home', {
                        screen: 'VendorDetails',
                        params: { vendorId: item.id || item.uid },
                    })
                }
            >
                <View style={styles.cardHeader}>
                    <View style={{ position: 'relative', marginRight: SPACING.md }}>
                        <Image
                            source={imageUri ? { uri: imageUri } : PLACEHOLDER_AVATARS.vendor}
                            style={{
                                width: 50,
                                height: 50,
                                borderRadius: 25,
                                backgroundColor: colors.surfaceLight,
                            }}
                        />
                        <AvatarVerificationBadge isVerified={isVerified} isAdmin={isAdmin} size={16} />
                    </View>
                    <View style={styles.textContainer}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={styles.businessName} numberOfLines={1}>{item.businessName}</Text>
                            <VerificationBadgeInline isVerified={isVerified} isAdmin={isAdmin} size={16} />
                        </View>
                        <Text style={styles.category}>{item.category}</Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => handleRemove(item.id || item.uid)}
                        style={styles.removeButton}
                    >
                        <Text style={styles.removeIcon}>💔</Text>
                    </TouchableOpacity>
                </View>

                {item.averageRating && item.averageRating > 0 ? (
                    <Text style={styles.rating}>
                        ⭐ {Number(item.averageRating).toFixed(1)}{' '}
                        <Text style={styles.reviewCount}>({item.totalReviews || 0})</Text>
                    </Text>
                ) : null}

                {item.address ? (
                    <Text style={styles.address} numberOfLines={1}>
                        📍 {item.address}
                    </Text>
                ) : null}
            </TouchableOpacity>
        );
    };

    if (loading && !refreshing) {
        return (
            <View style={styles.center}>
                <ActivityIndicator color={colors.primary} size="large" />
            </View>
        );
    }

    return (
        <TabSwipeHandler currentTab="Favorites" navigation={navigation}>
            <View style={styles.container}>
            <BrandHeader navigation={navigation}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary, paddingHorizontal: 16, paddingBottom: 10 }} accessibilityRole="header">My Favorites</Text>
            </BrandHeader>

            {favorites.length === 0 ? (
                <View style={styles.center}>
                    <Text style={styles.emptyText}>No favorites yet</Text>
                    <Text style={styles.subEmptyText}>Mark vendors as favorites to see them here</Text>
                </View>
            ) : (
                <FlatList
                    data={favorites}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id || item.uid}
                    contentContainerStyle={styles.list}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            colors={[colors.primary]}
                            tintColor={colors.primary}
                        />
                    }
                />
            )}
        </View>
        </TabSwipeHandler>
    );
}

const getStyles = (colors: any, topInset: number = 0) => {
    // Real safe-area inset (notch, punch-hole camera, landscape); fall back to the status bar height
    const statusBarHeight = topInset || (Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0);
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        header: {
            padding: SPACING.lg,
            paddingTop: statusBarHeight + SPACING.sm,
            backgroundColor: colors.primary,
            ...SHADOWS.small,
        },
        headerTitle: {
            fontSize: FONT_SIZES.xxl,
            fontWeight: 'bold',
            color: colors.textInverse,
        },
        center: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: SPACING.xl,
        },
        list: {
            width: '100%',
            maxWidth: CONTENT_MAX_WIDTH,
            alignSelf: 'center',
            padding: SPACING.md,
        },
        card: {
            backgroundColor: colors.surface,
            padding: SPACING.md,
            borderRadius: BORDER_RADIUS.md,
            marginBottom: SPACING.md,
            ...SHADOWS.small,
        },
        cardHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
        },
        textContainer: {
            flex: 1,
        },
        businessName: {
            fontSize: FONT_SIZES.lg,
            fontWeight: 'bold',
            color: colors.textPrimary,
            marginBottom: SPACING.xs,
        },
        category: {
            color: colors.primary,
            fontWeight: '600',
            fontSize: FONT_SIZES.sm,
            marginBottom: SPACING.xs,
        },
        removeButton: {
            padding: SPACING.xs,
        },
        removeIcon: {
            fontSize: 18,
        },
        rating: {
            marginTop: SPACING.xs,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        reviewCount: {
            fontWeight: 'normal',
            color: colors.textTertiary,
            fontSize: FONT_SIZES.sm,
        },
        address: {
            marginTop: SPACING.xs,
            color: colors.textSecondary,
            fontSize: FONT_SIZES.sm,
        },
        emptyText: {
            color: colors.textSecondary,
            fontSize: FONT_SIZES.xl,
            fontWeight: 'bold',
            marginBottom: SPACING.sm,
        },
        subEmptyText: {
            color: colors.textTertiary,
            fontSize: FONT_SIZES.md,
            textAlign: 'center',
        },
    });
};
