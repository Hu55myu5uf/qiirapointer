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
    ScrollView,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { clientAPI } from '../services/api';
import { uploadImageViaBackend, uploadDocumentViaBackend } from '../utils/backendUpload';

interface UpgradeToVendorModalProps {
    visible: boolean;
    onClose: () => void;
    clientId: string;
    clientEmail?: string;
    clientName?: string;
    onSuccess?: () => void;
}

import { POPULAR_CATEGORIES, BUSINESS_CATEGORIES } from '../constants/categories';
import CategoryPickerModal from './CategoryPickerModal';

const CATEGORIES = POPULAR_CATEGORIES.filter(c => c !== 'All');

export default function UpgradeToVendorModal({
    visible,
    onClose,
    clientId,
    clientEmail,
    clientName,
    onSuccess,
}: UpgradeToVendorModalProps) {
    const { colors } = useTheme();

    const [businessName, setBusinessName] = useState(clientName || '');
    const [category, setCategory] = useState(CATEGORIES[0]);
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [description, setDescription] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [address, setAddress] = useState('');
    const [document, setDocument] = useState<{ uri: string; name: string; type: 'image' | 'pdf' } | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handlePickImage = async () => {
        try {
            const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.8,
            });
            if (!res.canceled && res.assets[0]) {
                setDocument({
                    uri: res.assets[0].uri,
                    name: res.assets[0].fileName || 'business_doc.jpg',
                    type: 'image',
                });
            }
        } catch (e: any) {
            Alert.alert('Error', e.message);
        }
    };

    const handlePickPdf = async () => {
        try {
            const res = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf'],
            });
            if (!res.canceled && res.assets[0]) {
                setDocument({
                    uri: res.assets[0].uri,
                    name: res.assets[0].name || 'business_doc.pdf',
                    type: 'pdf',
                });
            }
        } catch (e: any) {
            Alert.alert('Error', e.message);
        }
    };

    const handleSubmit = async () => {
        if (!businessName.trim()) {
            Alert.alert('Required', 'Please enter your Business or Store Name.');
            return;
        }

        setSubmitting(true);
        try {
            let docUrl = '';
            if (document) {
                if (document.type === 'pdf') {
                    try {
                        const res = await uploadDocumentViaBackend(document.uri, document.name);
                        docUrl = res?.fileUrl || document.uri;
                    } catch (_) {
                        docUrl = document.uri;
                    }
                } else {
                    try {
                        docUrl = await uploadImageViaBackend(document.uri, 'vendor-upgrade');
                    } catch (_) {
                        docUrl = document.uri;
                    }
                }
            }

            await clientAPI.requestVendorConversion(clientId, {
                businessName: businessName.trim(),
                category,
                description: description.trim(),
                phoneNumber: phoneNumber.trim(),
                address: address.trim(),
                documentUrl: docUrl,
                documentType: document?.type === 'pdf' ? 'PDF Document' : 'ID / CAC Photo',
            });

            Alert.alert(
                'Application Submitted! 🏪',
                'Your vendor upgrade request has been sent to the QIIRA Administration for approval. You will receive an alert as soon as it is reviewed.',
                [
                    {
                        text: 'OK',
                        onPress: () => {
                            onSuccess?.();
                            onClose();
                        },
                    },
                ]
            );
        } catch (error: any) {
            console.error('Conversion request error:', error);
            Alert.alert('Error', error.message || 'Failed to submit application. Please try again.');
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
                            <Ionicons name="storefront" size={24} color="#B28A45" />
                            <Text style={[styles.title, { color: colors.textPrimary }]}>Become a Vendor</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} disabled={submitting}>
                            <Ionicons name="close" size={24} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        <View style={[styles.infoBanner, { backgroundColor: 'rgba(178, 138, 69, 0.1)', borderColor: '#B28A45' }]}>
                            <Text style={[styles.infoBannerText, { color: colors.textPrimary }]}>
                                Upgrade your account to unlock store publishing, post showcase reels, manage catalogs, and receive direct customer orders.
                            </Text>
                        </View>

                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Business / Store Name *</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.border }]}
                            placeholder="e.g. Apex Luxury Lounge & Boutique"
                            placeholderTextColor={colors.textTertiary}
                            value={businessName}
                            onChangeText={setBusinessName}
                        />

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 0 }]}>Primary Category *</Text>
                            <TouchableOpacity onPress={() => setShowCategoryPicker(true)}>
                                <Text style={{ fontSize: 12, color: '#B28A45', fontWeight: 'bold' }}>
                                    🔍 Browse All Categories
                                </Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.md }}>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                {(!CATEGORIES.includes(category) ? [category, ...CATEGORIES] : CATEGORIES).map((cat) => (
                                    <TouchableOpacity
                                        key={cat}
                                        style={[
                                            styles.categoryChip,
                                            { borderColor: colors.border, backgroundColor: colors.surfaceLight },
                                            category === cat && { borderColor: '#B28A45', backgroundColor: 'rgba(178, 138, 69, 0.15)' },
                                        ]}
                                        onPress={() => setCategory(cat)}
                                    >
                                        <Text
                                            style={[
                                                styles.categoryChipText,
                                                { color: colors.textPrimary },
                                                category === cat && { color: '#B28A45', fontWeight: 'bold' },
                                            ]}
                                        >
                                            {cat}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                                <TouchableOpacity
                                    style={[
                                        styles.categoryChip,
                                        { borderColor: '#B28A45', backgroundColor: 'rgba(178, 138, 69, 0.1)' }
                                    ]}
                                    onPress={() => setShowCategoryPicker(true)}
                                >
                                    <Text style={[styles.categoryChipText, { color: '#B28A45', fontWeight: 'bold' }]}>
                                        + More Categories
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>

                        <CategoryPickerModal
                            visible={showCategoryPicker}
                            onClose={() => setShowCategoryPicker(false)}
                            selectedCategory={category}
                            onSelectCategory={(catName, subName) => {
                                setCategory(subName ? `${catName} - ${subName}` : catName);
                            }}
                            title="Select Business Category"
                            subtitle="Choose your industry or primary trade"
                            allowSubcategories={true}
                        />

                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>About Your Business</Text>
                        <TextInput
                            style={[styles.input, styles.multilineInput, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.border }]}
                            placeholder="Tell customers what products, foods, or services you specialize in..."
                            placeholderTextColor={colors.textTertiary}
                            multiline
                            numberOfLines={3}
                            value={description}
                            onChangeText={setDescription}
                        />

                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Business Phone Number</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.border }]}
                            placeholder="e.g. 08034567890"
                            placeholderTextColor={colors.textTertiary}
                            keyboardType="phone-pad"
                            value={phoneNumber}
                            onChangeText={setPhoneNumber}
                        />

                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Physical Address / Location</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.border }]}
                            placeholder="e.g. Plot 412, Ademola Adetokunbo Crescent, Wuse 2"
                            placeholderTextColor={colors.textTertiary}
                            value={address}
                            onChangeText={setAddress}
                        />

                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Verification ID or CAC Document (Optional)</Text>
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: SPACING.md }}>
                            <TouchableOpacity
                                style={[styles.docBtn, { borderColor: colors.border, backgroundColor: colors.surfaceLight }]}
                                onPress={handlePickImage}
                            >
                                <Ionicons name="image-outline" size={18} color={colors.primary} />
                                <Text style={[styles.docBtnText, { color: colors.textPrimary }]}>Upload Photo</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.docBtn, { borderColor: colors.border, backgroundColor: colors.surfaceLight }]}
                                onPress={handlePickPdf}
                            >
                                <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                                <Text style={[styles.docBtnText, { color: colors.textPrimary }]}>Upload PDF</Text>
                            </TouchableOpacity>
                        </View>

                        {document && (
                            <View style={[styles.selectedDocCard, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
                                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                                <Text style={[styles.selectedDocText, { color: colors.textPrimary }]} numberOfLines={1}>
                                    {document.name}
                                </Text>
                                <TouchableOpacity onPress={() => setDocument(null)}>
                                    <Ionicons name="close-circle" size={18} color="#EF4444" />
                                </TouchableOpacity>
                            </View>
                        )}

                        <TouchableOpacity
                            style={[styles.submitButton, submitting && { opacity: 0.7 }]}
                            onPress={handleSubmit}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <>
                                    <Ionicons name="send" size={18} color="#FFFFFF" />
                                    <Text style={styles.submitButtonText}>Submit Application to Admin</Text>
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
    infoBanner: {
        borderWidth: 1,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        marginBottom: SPACING.md,
    },
    infoBannerText: {
        fontSize: FONT_SIZES.sm,
        lineHeight: 18,
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
    categoryChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: BORDER_RADIUS.round,
        borderWidth: 1,
    },
    categoryChipText: {
        fontSize: 12,
        fontWeight: '600',
    },
    docBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
    },
    docBtnText: {
        fontSize: 12,
        fontWeight: '600',
    },
    selectedDocCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 10,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        marginBottom: SPACING.md,
    },
    selectedDocText: {
        flex: 1,
        fontSize: 12,
        fontWeight: '500',
    },
    submitButton: {
        backgroundColor: '#B28A45',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: BORDER_RADIUS.md,
        gap: 8,
        marginTop: SPACING.xs,
        marginBottom: SPACING.md,
    },
    submitButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: FONT_SIZES.md,
    },
});
