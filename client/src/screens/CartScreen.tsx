import React, { useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Image,
    TouchableOpacity,
    Alert,
    Platform,
    ScrollView,
    StatusBar,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { useCartStore, CartItem } from '../store/cartStore';
import { auth } from '../config/firebase';
import { VerificationBadgeInline } from '../components/VerificationBadge';

export default function CartScreen({ navigation }: any) {
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const { items, totalItems, subtotal, currency, updateQuantity, removeItem, clearCart, fetchCart, loadLocalCart } = useCartStore();
    const userId = auth.currentUser?.uid;

    useEffect(() => {
        if (userId) {
            fetchCart(userId);
        } else {
            loadLocalCart();
        }
    }, [userId]);

    const handleClearCart = () => {
        Alert.alert(
            'Clear Cart',
            'Are you sure you want to remove all saved items from your cart?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear All',
                    style: 'destructive',
                    onPress: () => clearCart(userId),
                },
            ]
        );
    };

    const handleCheckout = () => {
        if (items.length === 0) return;

        // Group items by vendor
        const vendorsInCart = Array.from(new Set(items.map((i) => i.vendorName)));

        Alert.alert(
            'Order & Inquire',
            `Your cart has ${totalItems} item(s) worth ₦${subtotal.toLocaleString()} across ${vendorsInCart.length} vendor(s).\n\nWould you like to start a chat with the vendor(s) to finalize delivery and payment?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Chat with Vendor',
                    onPress: () => {
                        const firstItem = items[0];
                        navigation.navigate('Chat', {
                            receiverId: firstItem.vendorId,
                            receiverName: firstItem.vendorName,
                            initialMessage: `Hello! I would like to order: ${items.map((it) => `${it.title} (x${it.quantity})`).join(', ')}. Total: ₦${subtotal.toLocaleString()}`,
                        });
                    },
                },
                {
                    text: 'Place Direct Order',
                    onPress: () => {
                        Alert.alert('Order Placed! 🎉', 'Your order request has been sent to the vendor(s). They will contact you shortly.');
                    },
                },
            ]
        );
    };

    const renderCartItem = ({ item }: { item: CartItem }) => {
        return (
            <View style={styles.cartCard}>
                <Image
                    source={{
                        uri: item.mediaUrl || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400',
                    }}
                    style={styles.itemImage}
                />

                <View style={styles.itemDetails}>
                    <View style={styles.itemHeaderRow}>
                        <Text style={styles.itemTitle} numberOfLines={2}>
                            {item.title}
                        </Text>
                        <TouchableOpacity
                            onPress={() => removeItem(item.id, userId)}
                            style={styles.deleteButton}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Ionicons name="trash-outline" size={18} color={colors.error} />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        onPress={() => navigation.navigate('VendorDetails', { vendorId: item.vendorId })}
                        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm }}
                    >
                        <Text style={[styles.itemVendor, { marginBottom: 0 }]} numberOfLines={1}>🏢 {item.vendorName}</Text>
                        <VerificationBadgeInline isVerified={Boolean((item as any).isVerified ?? true)} size={14} />
                    </TouchableOpacity>

                    <View style={styles.itemBottomRow}>
                        <Text style={styles.itemPrice}>
                            {item.currency === 'NGN' ? '₦' : '$'}
                            {(item.price || 0).toLocaleString()}
                        </Text>

                        {/* Quantity Controls */}
                        <View style={styles.quantityStepper}>
                            <TouchableOpacity
                                style={styles.stepperButton}
                                onPress={() => updateQuantity(item.id, item.quantity - 1, userId)}
                            >
                                <Ionicons name="remove" size={16} color={colors.textPrimary} />
                            </TouchableOpacity>

                            <Text style={styles.quantityText}>{item.quantity}</Text>

                            <TouchableOpacity
                                style={styles.stepperButton}
                                onPress={() => updateQuantity(item.id, item.quantity + 1, userId)}
                            >
                                <Ionicons name="add" size={16} color={colors.textPrimary} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>Saved Items & Cart</Text>
                    <Text style={styles.headerSubtitle}>{totalItems} item(s)</Text>
                </View>
                {items.length > 0 ? (
                    <TouchableOpacity onPress={handleClearCart} style={styles.clearHeaderButton}>
                        <Text style={styles.clearHeaderText}>Clear</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 40 }} />
                )}
            </View>

            {items.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="cart-outline" size={72} color={colors.textTertiary} />
                    <Text style={styles.emptyTitle}>Your cart is empty</Text>
                    <Text style={styles.emptySubtitle}>
                        Explore products and reels from vendors and save the items you love!
                    </Text>
                    <TouchableOpacity
                        style={styles.exploreButton}
                        onPress={() => navigation.navigate('Explore')}
                    >
                        <Ionicons name="sparkles" size={18} color={colors.textInverse} />
                        <Text style={styles.exploreButtonText}>Explore Products & Deals</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    <FlatList
                        data={items}
                        keyExtractor={(item) => item.id}
                        renderItem={renderCartItem}
                        contentContainerStyle={styles.listContent}
                    />

                    {/* Order Summary Checkout Box */}
                    <View style={styles.summaryContainer}>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Subtotal ({totalItems} items)</Text>
                            <Text style={styles.summaryValue}>
                                {currency === 'NGN' ? '₦' : '$'}
                                {subtotal.toLocaleString()}
                            </Text>
                        </View>

                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Estimated Delivery</Text>
                            <Text style={[styles.summaryValue, { color: colors.success }]}>
                                Calculated by vendor
                            </Text>
                        </View>

                        <View style={styles.divider} />

                        <View style={styles.summaryRow}>
                            <Text style={styles.totalLabel}>Total Estimate</Text>
                            <Text style={styles.totalValue}>
                                {currency === 'NGN' ? '₦' : '$'}
                                {subtotal.toLocaleString()}
                            </Text>
                        </View>

                        <TouchableOpacity style={styles.checkoutButton} onPress={handleCheckout}>
                            <Ionicons name="bag-check" size={20} color={colors.textInverse} />
                            <Text style={styles.checkoutButtonText}>Proceed to Order / Inquire</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
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
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: SPACING.lg,
            paddingTop: statusBarHeight + SPACING.xs,
            paddingBottom: SPACING.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.surface,
        },
        backButton: {
            padding: SPACING.xs,
        },
        headerTitleContainer: {
            alignItems: 'center',
        },
        headerTitle: {
            fontSize: FONT_SIZES.lg,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        headerSubtitle: {
            fontSize: FONT_SIZES.xs,
            color: colors.textSecondary,
        },
        clearHeaderButton: {
            padding: SPACING.xs,
        },
        clearHeaderText: {
            fontSize: FONT_SIZES.sm,
            color: colors.error,
            fontWeight: '600',
        },
        listContent: {
            padding: SPACING.md,
        },
        cartCard: {
            flexDirection: 'row',
            backgroundColor: colors.surface,
            borderRadius: BORDER_RADIUS.md,
            padding: SPACING.md,
            marginBottom: SPACING.md,
            borderWidth: 1,
            borderColor: colors.border,
            ...SHADOWS.small,
        },
        itemImage: {
            width: 85,
            height: 85,
            borderRadius: BORDER_RADIUS.sm,
            backgroundColor: colors.surfaceLight,
            resizeMode: 'cover',
        },
        itemDetails: {
            flex: 1,
            marginLeft: SPACING.md,
            justifyContent: 'space-between',
        },
        itemHeaderRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
        },
        itemTitle: {
            flex: 1,
            fontSize: FONT_SIZES.sm,
            fontWeight: '700',
            color: colors.textPrimary,
            marginRight: SPACING.xs,
        },
        deleteButton: {
            padding: 2,
        },
        itemVendor: {
            fontSize: FONT_SIZES.xs,
            color: colors.primary,
            fontWeight: '600',
            marginVertical: 2,
        },
        itemBottomRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 4,
        },
        itemPrice: {
            fontSize: FONT_SIZES.md,
            fontWeight: '900',
            color: colors.primary,
        },
        quantityStepper: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surfaceLight,
            borderRadius: BORDER_RADIUS.sm,
            borderWidth: 1,
            borderColor: colors.border,
        },
        stepperButton: {
            paddingHorizontal: 8,
            paddingVertical: 4,
        },
        quantityText: {
            fontSize: FONT_SIZES.sm,
            fontWeight: '700',
            color: colors.textPrimary,
            paddingHorizontal: 8,
        },
        emptyContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: SPACING.xl * 2,
        },
        emptyTitle: {
            fontSize: FONT_SIZES.xl,
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
        exploreButton: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.primary,
            paddingHorizontal: SPACING.xl,
            paddingVertical: SPACING.md,
            borderRadius: BORDER_RADIUS.round,
            marginTop: SPACING.xl,
            gap: SPACING.xs,
        },
        exploreButtonText: {
            color: colors.textInverse,
            fontWeight: 'bold',
            fontSize: FONT_SIZES.md,
        },
        summaryContainer: {
            backgroundColor: colors.surface,
            padding: SPACING.lg,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            ...SHADOWS.medium,
        },
        summaryRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: SPACING.xs,
        },
        summaryLabel: {
            fontSize: FONT_SIZES.sm,
            color: colors.textSecondary,
        },
        summaryValue: {
            fontSize: FONT_SIZES.sm,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        divider: {
            height: 1,
            backgroundColor: colors.border,
            marginVertical: SPACING.sm,
        },
        totalLabel: {
            fontSize: FONT_SIZES.md,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        totalValue: {
            fontSize: FONT_SIZES.lg,
            fontWeight: '900',
            color: colors.primary,
        },
        checkoutButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primary,
            paddingVertical: SPACING.md,
            borderRadius: BORDER_RADIUS.md,
            marginTop: SPACING.md,
            gap: SPACING.xs,
        },
        checkoutButtonText: {
            color: colors.textInverse,
            fontSize: FONT_SIZES.md,
            fontWeight: 'bold',
        },
    });
};
