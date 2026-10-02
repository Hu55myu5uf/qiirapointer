import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Image,
    Modal,
    FlatList,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { vendorAPI } from '../services/api';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

// Vendor category options
const VENDOR_CATEGORIES = [
    'Restaurants & Cafes',
    'Retail & Shopping',
    'Health & Wellness',
    'Beauty & Spa',
    'Automotive Services',
    'Home Services',
    'Professional Services',
    'Entertainment',
    'Education & Training',
    'Technology & Electronics',
    'Fashion & Apparel',
    'Grocery & Supermarket',
    'Travel & Tourism',
    'Fitness & Gym',
    'Other',
];

export default function VendorProfileCompletionScreen({ route, navigation }: any) {
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const { vendorId } = route.params;
    const [loading, setLoading] = useState(false);
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [formData, setFormData] = useState({
        businessName: '',
        category: '',
        description: '',
        address: '',
        services: '',
        businessImage: '',
    });

    const handlePickImage = async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permissionResult.granted) {
            Alert.alert('Permission Required', 'Please grant permission to access your photos');
            return;
        }

        Alert.alert(
            'Business Image',
            'Choose image source:',
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
                                aspect: [16, 9],
                                quality: 0.8,
                            });
                            if (!res.canceled && res.assets[0]) {
                                setFormData({ ...formData, businessImage: res.assets[0].uri });
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
                            const result = await ImagePicker.launchImageLibraryAsync({
                                mediaTypes: ['images'],
                                allowsEditing: true,
                                aspect: [16, 9],
                                quality: 0.8,
                            });
                            if (!result.canceled && result.assets[0]) {
                                setFormData({ ...formData, businessImage: result.assets[0].uri });
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

    const handleComplete = async () => {
        // Validation
        if (!formData.businessName || !formData.category) {
            Alert.alert('Error', 'Please fill in business name and category');
            return;
        }

        setLoading(true);
        try {
            await vendorAPI.updateProfile(vendorId, formData);
            Alert.alert(
                'Success',
                'Profile completed! You can now log in.',
                [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
            );
        } catch (error: any) {
            console.error('Error completing profile:', error);
            Alert.alert('Error', error.response?.data?.message || 'Failed to update profile');
        } finally {
            setLoading(false);
        }
    };

    const handleSkip = () => {
        Alert.alert(
            'Skip Profile Setup?',
            'You can complete your profile later from the dashboard.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Skip', onPress: () => navigation.navigate('Login') },
            ]
        );
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.title}>Complete Your Business Profile</Text>
                    <Text style={styles.subtitle}>
                        Let's set up your business details. You can update these later.
                    </Text>
                </View>

                <View style={styles.form}>
                    <Text style={styles.label}>Business Name *</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g., Joe's Coffee Shop"
                        placeholderTextColor={colors.textTertiary}
                        value={formData.businessName}
                        onChangeText={(text) => setFormData({ ...formData, businessName: text })}
                    />

                    <Text style={styles.label}>Category *</Text>
                    <TouchableOpacity
                        style={styles.selectButton}
                        onPress={() => setShowCategoryPicker(true)}
                    >
                        <Text
                            style={formData.category ? styles.selectText : styles.selectPlaceholder}
                        >
                            {formData.category || 'Select a category'}
                        </Text>
                        <Text style={styles.selectArrow}>▼</Text>
                    </TouchableOpacity>

                    <Text style={styles.label}>Description</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Tell customers about your business..."
                        placeholderTextColor={colors.textTertiary}
                        value={formData.description}
                        onChangeText={(text) => setFormData({ ...formData, description: text })}
                        multiline
                        numberOfLines={4}
                    />

                    <Text style={styles.label}>Address</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Business location"
                        placeholderTextColor={colors.textTertiary}
                        value={formData.address}
                        onChangeText={(text) => setFormData({ ...formData, address: text })}
                    />

                    <Text style={styles.label}>Services Offered</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g., Delivery, Walk-in, Catering"
                        placeholderTextColor={colors.textTertiary}
                        value={formData.services}
                        onChangeText={(text) => setFormData({ ...formData, services: text })}
                    />

                    <Text style={styles.label}>Business Photo</Text>
                    <TouchableOpacity
                        style={styles.imagePickerButton}
                        onPress={handlePickImage}
                    >
                        <Text style={styles.imagePickerButtonText}>
                            {formData.businessImage ? '✓ Image Selected' : '📷 Choose Business Photo'}
                        </Text>
                    </TouchableOpacity>
                    {formData.businessImage ? (
                        <Image
                            source={{ uri: formData.businessImage }}
                            style={styles.imagePreview}
                        />
                    ) : null}

                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleComplete}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color={colors.textInverse} />
                        ) : (
                            <Text style={styles.buttonText}>Complete Profile</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.skipButton}
                        onPress={handleSkip}
                        disabled={loading}
                    >
                        <Text style={styles.skipButtonText}>Skip for Now</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            {/* Category Picker Modal */}
            <Modal
                visible={showCategoryPicker}
                animationType="slide"
                transparent={true}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select Category</Text>
                            <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
                                <Text style={styles.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={VENDOR_CATEGORIES}
                            keyExtractor={(item) => item}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[
                                        styles.categoryItem,
                                        formData.category === item && styles.categoryItemSelected,
                                    ]}
                                    onPress={() => {
                                        setFormData({ ...formData, category: item });
                                        setShowCategoryPicker(false);
                                    }}
                                >
                                    <Text
                                        style={[
                                            styles.categoryText,
                                            formData.category === item && styles.categoryTextSelected,
                                        ]}
                                    >
                                        {item}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
}

const getStyles = (colors: any) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        scrollContent: {
            flexGrow: 1,
            padding: SPACING.lg,
            paddingTop: SPACING.xl * 2,
        },
        header: {
            marginBottom: SPACING.xl,
        },
        title: {
            fontSize: FONT_SIZES.xxl,
            fontWeight: 'bold',
            color: colors.textPrimary,
            marginBottom: SPACING.sm,
        },
        subtitle: {
            fontSize: FONT_SIZES.md,
            color: colors.textSecondary,
        },
        form: {
            backgroundColor: colors.surface,
            borderRadius: BORDER_RADIUS.lg,
            padding: SPACING.lg,
        },
        label: {
            fontSize: FONT_SIZES.sm,
            fontWeight: '600',
            color: colors.textPrimary,
            marginBottom: SPACING.xs,
            marginTop: SPACING.sm,
        },
        input: {
            backgroundColor: colors.surfaceLight,
            borderRadius: BORDER_RADIUS.md,
            padding: SPACING.md,
            fontSize: FONT_SIZES.md,
            color: colors.textPrimary,
            borderWidth: 1,
            borderColor: colors.border,
        },
        textArea: {
            height: 100,
            textAlignVertical: 'top',
        },
        selectButton: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: colors.surfaceLight,
            borderRadius: BORDER_RADIUS.md,
            padding: SPACING.md,
            borderWidth: 1,
            borderColor: colors.border,
        },
        selectText: {
            fontSize: FONT_SIZES.md,
            color: colors.textPrimary,
        },
        selectPlaceholder: {
            fontSize: FONT_SIZES.md,
            color: colors.textTertiary,
        },
        selectArrow: {
            fontSize: FONT_SIZES.sm,
            color: colors.textSecondary,
        },
        button: {
            backgroundColor: colors.primary,
            borderRadius: BORDER_RADIUS.md,
            padding: SPACING.md,
            alignItems: 'center',
            marginTop: SPACING.xl,
        },
        buttonDisabled: {
            backgroundColor: colors.textTertiary,
        },
        buttonText: {
            color: colors.textInverse,
            fontSize: FONT_SIZES.md,
            fontWeight: 'bold',
        },
        skipButton: {
            marginTop: SPACING.md,
            padding: SPACING.sm,
            alignItems: 'center',
        },
        skipButtonText: {
            color: colors.textSecondary,
            fontSize: FONT_SIZES.sm,
        },
        imagePickerButton: {
            backgroundColor: colors.surfaceLight,
            borderRadius: BORDER_RADIUS.md,
            padding: SPACING.md,
            alignItems: 'center',
            borderWidth: 2,
            borderColor: colors.primary,
            borderStyle: 'dashed',
        },
        imagePickerButtonText: {
            color: colors.primary,
            fontSize: FONT_SIZES.md,
            fontWeight: '600',
        },
        imagePreview: {
            width: '100%',
            height: 200,
            borderRadius: BORDER_RADIUS.md,
            marginTop: SPACING.sm,
            resizeMode: 'cover',
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
            maxHeight: '70%',
        },
        modalHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: SPACING.lg,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        modalTitle: {
            fontSize: FONT_SIZES.lg,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        modalClose: {
            fontSize: FONT_SIZES.xl,
            color: colors.textSecondary,
        },
        categoryItem: {
            padding: SPACING.md,
            paddingHorizontal: SPACING.lg,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        categoryItemSelected: {
            backgroundColor: colors.primaryLight,
        },
        categoryText: {
            fontSize: FONT_SIZES.md,
            color: colors.textPrimary,
        },
        categoryTextSelected: {
            color: colors.textInverse,
            fontWeight: '600',
        },
    });
