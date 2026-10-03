import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    TextInput,
    Alert,
    ActivityIndicator,
    Image,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { chatAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';

interface PlaceOrderModalProps {
    visible: boolean;
    onClose: () => void;
    vendorId: string;
    vendorName: string;
    vendorImage?: string;
    product: {
        id?: string;
        title: string;
        price: number | string;
        image?: string;
        category?: string;
    };
    navigation: any;
}

export default function PlaceOrderModal({
    visible,
    onClose,
    vendorId,
    vendorName,
    vendorImage,
    product,
    navigation,
}: PlaceOrderModalProps) {
    const { colors } = useTheme();
    const { user } = useAuthStore();

    const [quantity, setQuantity] = useState(1);
    const [notes, setNotes] = useState('');
    const [phone, setPhone] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const unitPrice = Number(product.price) || 0;
    const totalPrice = unitPrice * quantity;

    const handleSendOrder = async () => {
        if (!user) {
            Alert.alert('Login Required', 'Please log in to place an order.');
            return;
        }

        if (quantity < 1) {
            Alert.alert('Invalid Quantity', 'Quantity must be at least 1.');
            return;
        }

        setSubmitting(true);
        try {
            const orderId = `ORD_${Date.now().toString().slice(-6)}`;
            const orderSummaryText = `🛍️ [NEW ORDER #${orderId}]\nItem: ${product.title}\nQty: ${quantity}\nUnit Price: ₦${unitPrice.toLocaleString()}\nTotal: ₦${totalPrice.toLocaleString()}${deliveryAddress ? `\nDeliver to: ${deliveryAddress}` : ''}${phone ? `\nContact Phone: ${phone}` : ''}${notes ? `\nSpecial Notes: ${notes}` : ''}`;

            // Send order card as a direct chat message to vendor
            await chatAPI.sendMessage({
                senderId: user.uid,
                receiverId: vendorId,
                receiverName: vendorName || 'Vendor',
                receiverImage: vendorImage || undefined,
                text: orderSummaryText,
                messageType: 'order',
                orderData: {
                    orderId,
                    productId: product.id,
                    productTitle: product.title,
                    productImage: product.image,
                    quantity,
                    unitPrice,
                    totalPrice,
                    deliveryAddress,
                    contactPhone: phone,
                    notes,
                    status: 'placed',
                    placedAt: new Date().toISOString(),
                },
            });

            onClose();

            Alert.alert(
                'Order Sent! 🛍️',
                `Your order for "${product.title}" has been sent directly to ${vendorName}. You can now chat in real-time to confirm delivery & payment.`,
                [
                    {
                        text: 'View in Chat',
                        onPress: () => {
                            navigation.navigate('Chat', {
                                otherUserId: vendorId,
                                otherUserName: vendorName,
                                otherUserImage: vendorImage || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200',
                                receiverId: vendorId,
                                receiverName: vendorName,
                                receiverImage: vendorImage || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200',
                            });
                        },
                    },
                    {
                        text: 'Done',
                        style: 'cancel',
                    },
                ]
            );
        } catch (error: any) {
            console.error('Place order error:', error);
            Alert.alert('Error', error.message || 'Failed to send order. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={[styles.content, { backgroundColor: colors.surface }]}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="bag-check" size={24} color={colors.primary} />
                            <Text style={[styles.title, { color: colors.textPrimary }]}>Direct Order</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} disabled={submitting}>
                            <Ionicons name="close" size={24} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Product Card Preview */}
                        <View style={[styles.productCard, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
                            {product.image ? (
                                <Image source={{ uri: product.image }} style={styles.productImage} resizeMode="cover" />
                            ) : (
                                <View style={[styles.productPlaceholder, { backgroundColor: `${colors.primary}20` }]}>
                                    <Ionicons name="cube-outline" size={28} color={colors.primary} />
                                </View>
                            )}
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.productTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                                    {product.title}
                                </Text>
                                <Text style={[styles.vendorLabel, { color: colors.textSecondary }]}>
                                    Vendor: {vendorName}
                                </Text>
                                <Text style={[styles.productPrice, { color: colors.primary }]}>
                                    ₦{unitPrice.toLocaleString()} {unitPrice === 0 ? '(Negotiable / Custom Quote)' : 'each'}
                                </Text>
                            </View>
                        </View>

                        {/* Quantity Counter */}
                        <View style={styles.quantityRow}>
                            <Text style={[styles.fieldLabel, { color: colors.textPrimary, marginBottom: 0 }]}>Quantity:</Text>
                            <View style={styles.counterBox}>
                                <TouchableOpacity
                                    style={[styles.counterBtn, { borderColor: colors.border }]}
                                    onPress={() => setQuantity(Math.max(1, quantity - 1))}
                                >
                                    <Text style={[styles.counterBtnText, { color: colors.textPrimary }]}>−</Text>
                                </TouchableOpacity>
                                <Text style={[styles.counterValue, { color: colors.textPrimary }]}>{quantity}</Text>
                                <TouchableOpacity
                                    style={[styles.counterBtn, { borderColor: colors.border }]}
                                    onPress={() => setQuantity(quantity + 1)}
                                >
                                    <Text style={[styles.counterBtnText, { color: colors.textPrimary }]}>+</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Contact Phone */}
                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Your Contact Phone Number</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.border }]}
                            placeholder="e.g. 08012345678"
                            placeholderTextColor={colors.textTertiary}
                            keyboardType="phone-pad"
                            value={phone}
                            onChangeText={setPhone}
                        />

                        {/* Delivery Address */}
                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Delivery Address / Location</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.border }]}
                            placeholder="e.g. 15 Herbert Macaulay Way, Wuse 2, Abuja"
                            placeholderTextColor={colors.textTertiary}
                            value={deliveryAddress}
                            onChangeText={setDeliveryAddress}
                        />

                        {/* Notes / Customization */}
                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Order Notes / Custom Requests</Text>
                        <TextInput
                            style={[styles.input, styles.multilineInput, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.border }]}
                            placeholder="Add specific sizes, colors, flavor options, or pickup instructions..."
                            placeholderTextColor={colors.textTertiary}
                            multiline
                            numberOfLines={3}
                            value={notes}
                            onChangeText={setNotes}
                        />

                        {/* Total Summary */}
                        <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                            <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Estimated Total:</Text>
                            <Text style={[styles.totalAmount, { color: colors.primary }]}>
                                {unitPrice > 0 ? `₦${totalPrice.toLocaleString()}` : 'Free Consultation / Inquiry'}
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={[styles.submitButton, { backgroundColor: colors.primary }, submitting && { opacity: 0.7 }]}
                            onPress={handleSendOrder}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <>
                                    <Ionicons name="chatbubbles-outline" size={20} color="#FFFFFF" />
                                    <Text style={styles.submitButtonText}>Send Order to Vendor in Chat</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'flex-end',
    },
    content: {
        borderTopLeftRadius: BORDER_RADIUS.xl,
        borderTopRightRadius: BORDER_RADIUS.xl,
        padding: SPACING.lg,
        maxHeight: '88%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.md,
    },
    title: {
        fontSize: FONT_SIZES.lg,
        fontWeight: 'bold',
    },
    productCard: {
        flexDirection: 'row',
        gap: 12,
        padding: 10,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        marginBottom: SPACING.md,
        alignItems: 'center',
    },
    productImage: {
        width: 65,
        height: 65,
        borderRadius: BORDER_RADIUS.sm,
    },
    productPlaceholder: {
        width: 65,
        height: 65,
        borderRadius: BORDER_RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    productTitle: {
        fontSize: FONT_SIZES.sm,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    vendorLabel: {
        fontSize: 11,
        marginBottom: 4,
    },
    productPrice: {
        fontSize: FONT_SIZES.md,
        fontWeight: 'bold',
    },
    quantityRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.md,
    },
    counterBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    counterBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    counterBtnText: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    counterValue: {
        fontSize: 16,
        fontWeight: 'bold',
        minWidth: 24,
        textAlign: 'center',
    },
    fieldLabel: {
        fontSize: FONT_SIZES.xs,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        marginBottom: 6,
        letterSpacing: 0.5,
    },
    input: {
        borderWidth: 1,
        borderRadius: BORDER_RADIUS.md,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: FONT_SIZES.sm,
        marginBottom: SPACING.md,
    },
    multilineInput: {
        minHeight: 70,
        textAlignVertical: 'top',
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        paddingTop: SPACING.md,
        marginBottom: SPACING.md,
    },
    totalLabel: {
        fontSize: FONT_SIZES.md,
        fontWeight: '600',
    },
    totalAmount: {
        fontSize: FONT_SIZES.xl,
        fontWeight: 'bold',
    },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: BORDER_RADIUS.md,
        gap: 8,
        marginBottom: SPACING.md,
    },
    submitButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: FONT_SIZES.md,
    },
});
