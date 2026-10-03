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
    Switch,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { vendorAPI } from '../services/api';
import { uploadImageViaBackend } from '../utils/backendUpload';

interface AddCatalogItemModalProps {
    visible: boolean;
    onClose: () => void;
    vendorId: string;
    onSuccess?: () => void;
}

const COMMON_COLLECTIONS = [
    'Specials',
    'Main Menu',
    'Services',
    'Best Sellers',
    'Drinks & Beverages',
    'Accessories',
    'Packages',
];

export default function AddCatalogItemModal({
    visible,
    onClose,
    vendorId,
    onSuccess,
}: AddCatalogItemModalProps) {
    const { colors } = useTheme();

    const [name, setName] = useState('');
    const [price, setPrice] = useState('');
    const [category, setCategory] = useState(COMMON_COLLECTIONS[0]);
    const [customCategory, setCustomCategory] = useState('');
    const [description, setDescription] = useState('');
    const [imageUri, setImageUri] = useState('');
    const [inStock, setInStock] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const handlePickImage = async () => {
        try {
            const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });
            if (!res.canceled && res.assets[0]) {
                setImageUri(res.assets[0].uri);
            }
        } catch (e: any) {
            Alert.alert('Error', e.message);
        }
    };

    const handleSubmit = async () => {
        if (!name.trim()) {
            Alert.alert('Required', 'Please enter the item name.');
            return;
        }

        const parsedPrice = parseFloat(price.replace(/,/g, ''));
        if (isNaN(parsedPrice) || parsedPrice < 0) {
            Alert.alert('Invalid Price', 'Please enter a valid price amount.');
            return;
        }

        setSubmitting(true);
        try {
            let finalImageUrl = imageUri;
            if (imageUri && (imageUri.startsWith('file:') || imageUri.startsWith('blob:') || imageUri.startsWith('content:'))) {
                try {
                    finalImageUrl = await uploadImageViaBackend(imageUri, 'catalog');
                } catch (_) {
                    finalImageUrl = imageUri;
                }
            }

            const chosenCategory = customCategory.trim() || category;

            await vendorAPI.addCatalogItem(vendorId, {
                name: name.trim(),
                price: parsedPrice,
                category: chosenCategory,
                description: description.trim(),
                imageUrl: finalImageUrl,
                inStock,
            });

            Alert.alert('Success 🎉', `"${name.trim()}" has been added to your catalog!`);
            onSuccess?.();
            onClose();
            // Reset fields
            setName('');
            setPrice('');
            setDescription('');
            setImageUri('');
        } catch (error: any) {
            console.error('Add catalog item error:', error);
            Alert.alert('Error', error.message || 'Failed to add item to catalog.');
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
                    <View style={styles.header}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="book" size={24} color={colors.primary} />
                            <Text style={[styles.title, { color: colors.textPrimary }]}>Add Catalog Item</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} disabled={submitting}>
                            <Ionicons name="close" size={24} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Image Uploader */}
                        <TouchableOpacity
                            style={[
                                styles.imagePickerBox,
                                { borderColor: colors.border, backgroundColor: colors.surfaceLight },
                                imageUri ? { padding: 0 } : null,
                            ]}
                            onPress={handlePickImage}
                        >
                            {imageUri ? (
                                <Image source={{ uri: imageUri }} style={styles.pickedImage} />
                            ) : (
                                <View style={{ alignItems: 'center' }}>
                                    <Ionicons name="camera-outline" size={32} color={colors.textTertiary} />
                                    <Text style={[styles.imagePickerText, { color: colors.textSecondary }]}>
                                        Tap to add product photo
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>

                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Product / Service Name *</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.border }]}
                            placeholder="e.g. Seafood Jollof Feast"
                            placeholderTextColor={colors.textTertiary}
                            value={name}
                            onChangeText={setName}
                        />

                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Price (₦) *</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.border }]}
                            placeholder="e.g. 4500"
                            placeholderTextColor={colors.textTertiary}
                            keyboardType="numeric"
                            value={price}
                            onChangeText={setPrice}
                        />

                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Catalog Section / Collection</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                {COMMON_COLLECTIONS.map((c) => (
                                    <TouchableOpacity
                                        key={c}
                                        style={[
                                            styles.categoryChip,
                                            { borderColor: colors.border, backgroundColor: colors.surfaceLight },
                                            category === c && !customCategory && { borderColor: colors.primary, backgroundColor: `${colors.primary}15` },
                                        ]}
                                        onPress={() => {
                                            setCategory(c);
                                            setCustomCategory('');
                                        }}
                                    >
                                        <Text
                                            style={[
                                                styles.categoryChipText,
                                                { color: colors.textPrimary },
                                                category === c && !customCategory && { color: colors.primary, fontWeight: 'bold' },
                                            ]}
                                        >
                                            {c}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>

                        <TextInput
                            style={[styles.input, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.border }]}
                            placeholder="Or type custom collection..."
                            placeholderTextColor={colors.textTertiary}
                            value={customCategory}
                            onChangeText={setCustomCategory}
                        />

                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Description (Optional)</Text>
                        <TextInput
                            style={[styles.input, styles.multilineInput, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.border }]}
                            placeholder="Describe ingredients, specifications, sizes, or details..."
                            placeholderTextColor={colors.textTertiary}
                            multiline
                            numberOfLines={3}
                            value={description}
                            onChangeText={setDescription}
                        />

                        {/* Availability Toggle */}
                        <View style={styles.toggleRow}>
                            <View>
                                <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>Available / In Stock</Text>
                                <Text style={[styles.toggleSub, { color: colors.textSecondary }]}>Clients can immediately place orders</Text>
                            </View>
                            <Switch
                                value={inStock}
                                onValueChange={setInStock}
                                trackColor={{ false: colors.border, true: colors.primaryLight }}
                                thumbColor={inStock ? colors.primary : colors.surface}
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.submitButton, { backgroundColor: colors.primary }, submitting && { opacity: 0.7 }]}
                            onPress={handleSubmit}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <>
                                    <Ionicons name="add-circle" size={20} color="#FFFFFF" />
                                    <Text style={styles.submitButtonText}>Add to Catalog</Text>
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
        maxHeight: '90%',
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
    imagePickerBox: {
        height: 140,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SPACING.md,
        overflow: 'hidden',
    },
    pickedImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    imagePickerText: {
        fontSize: 12,
        fontWeight: '600',
        marginTop: 6,
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
        minHeight: 65,
        textAlignVertical: 'top',
    },
    categoryChip: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: BORDER_RADIUS.round,
        borderWidth: 1,
    },
    categoryChipText: {
        fontSize: 12,
        fontWeight: '600',
    },
    toggleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.lg,
        paddingTop: 4,
    },
    toggleTitle: {
        fontSize: FONT_SIZES.sm,
        fontWeight: '600',
    },
    toggleSub: {
        fontSize: 11,
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
