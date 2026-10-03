import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    Image,
    ScrollView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { vendorAPI } from '../services/api';
import { uploadImageViaBackend, uploadDocumentViaBackend } from '../utils/backendUpload';

interface VendorVerificationModalProps {
    visible: boolean;
    onClose: () => void;
    vendorId: string;
    onSuccess?: () => void;
}

const DOCUMENT_TYPES = [
    { id: 'NIN', label: '🆔 National Identity Number (NIN)' },
    { id: 'DriversLicense', label: "🚗 Driver's License" },
    { id: 'Passport', label: '🛂 International Passport' },
    { id: 'CAC', label: '🏢 CAC / Business Certificate' },
];

export default function VendorVerificationModal({
    visible,
    onClose,
    vendorId,
    onSuccess,
}: VendorVerificationModalProps) {
    const { colors } = useTheme();
    const [selectedDocType, setSelectedDocType] = useState('NIN');
    const [pickedFile, setPickedFile] = useState<{ uri: string; name: string; type: 'image' | 'pdf'; mimeType?: string } | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handlePickImage = async () => {
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Gallery access is needed to upload your identity document.');
                return;
            }
            const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 0.85,
            });
            if (!res.canceled && res.assets[0]) {
                const asset = res.assets[0];
                setPickedFile({
                    uri: asset.uri,
                    name: asset.fileName || `${selectedDocType}_ID.jpg`,
                    type: 'image',
                    mimeType: asset.mimeType || 'image/jpeg',
                });
            }
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to select image');
        }
    };

    const handleTakePhoto = async () => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Camera permission is required to capture your document.');
                return;
            }
            const res = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 0.85,
            });
            if (!res.canceled && res.assets[0]) {
                const asset = res.assets[0];
                setPickedFile({
                    uri: asset.uri,
                    name: `Camera_${selectedDocType}.jpg`,
                    type: 'image',
                    mimeType: asset.mimeType || 'image/jpeg',
                });
            }
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to capture photo');
        }
    };

    const handlePickPdf = async () => {
        try {
            const res = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf'],
                copyToCacheDirectory: true,
            });
            if (!res.canceled && res.assets[0]) {
                const asset = res.assets[0];
                setPickedFile({
                    uri: asset.uri,
                    name: asset.name || `${selectedDocType}_document.pdf`,
                    type: 'pdf',
                    mimeType: 'application/pdf',
                });
            }
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to pick document');
        }
    };

    const handleSubmit = async () => {
        if (!pickedFile) {
            Alert.alert('Document Required', 'Please select or capture a photo/PDF of your identity document.');
            return;
        }

        setSubmitting(true);
        try {
            let uploadedUrl = pickedFile.uri;

            if (pickedFile.type === 'pdf') {
                try {
                    const res = await uploadDocumentViaBackend(pickedFile.uri, pickedFile.name);
                    uploadedUrl = res?.fileUrl || pickedFile.uri;
                } catch (pdfErr) {
                    console.warn('PDF upload via backend fallback to local URI:', pdfErr);
                }
            } else {
                try {
                    uploadedUrl = await uploadImageViaBackend(pickedFile.uri, 'vendor-kyc');
                } catch (imgErr) {
                    console.warn('Image upload fallback:', imgErr);
                }
            }

            const docTypeLabel = DOCUMENT_TYPES.find(d => d.id === selectedDocType)?.label || selectedDocType;

            await vendorAPI.submitVerification(vendorId, {
                documentType: docTypeLabel,
                documentUrl: uploadedUrl,
                documentName: pickedFile.name,
                documentFileType: pickedFile.mimeType || (pickedFile.type === 'pdf' ? 'application/pdf' : 'image/jpeg'),
            });

            Alert.alert(
                'Verification Submitted! 🛡️',
                'Your document has been sent to the QIIRA Administration for review. You can continue exploring the app and updating your profile while verification is pending.',
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
            console.error('Submit verification error:', error);
            Alert.alert('Error', error.message || 'Failed to submit document. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={[styles.content, { backgroundColor: colors.surface }]}>
                    <View style={styles.header}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="shield-checkmark" size={24} color="#B28A45" />
                            <Text style={[styles.title, { color: colors.textPrimary }]}>Vendor Verification</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} disabled={submitting}>
                            <Ionicons name="close" size={24} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        <View style={[styles.noticeBox, { backgroundColor: 'rgba(178, 138, 69, 0.1)', borderColor: '#B28A45' }]}>
                            <Text style={[styles.noticeText, { color: colors.textPrimary }]}>
                                <Text style={{ fontWeight: 'bold' }}>Compulsory for Vendors:</Text> You must submit a valid government ID (NIN, Driver&apos;s License, or Passport) before publishing posts or products.
                            </Text>
                            <Text style={[styles.noticeSub, { color: colors.textSecondary }]}>
                                You can freely browse, explore, and change your profile and banner pictures while verification is under review.
                            </Text>
                        </View>

                        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Select Document Type</Text>
                        <View style={styles.docTypeContainer}>
                            {DOCUMENT_TYPES.map(type => (
                                <TouchableOpacity
                                    key={type.id}
                                    style={[
                                        styles.docTypeOption,
                                        { borderColor: colors.border },
                                        selectedDocType === type.id && { borderColor: '#B28A45', backgroundColor: 'rgba(178, 138, 69, 0.12)' },
                                    ]}
                                    onPress={() => setSelectedDocType(type.id)}
                                >
                                    <Text
                                        style={[
                                            styles.docTypeText,
                                            { color: colors.textPrimary },
                                            selectedDocType === type.id && { color: '#B28A45', fontWeight: 'bold' },
                                        ]}
                                    >
                                        {type.label}
                                    </Text>
                                    {selectedDocType === type.id && (
                                        <Ionicons name="checkmark-circle" size={18} color="#B28A45" />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: SPACING.md }]}>Upload Document</Text>
                        <View style={styles.uploadRow}>
                            <TouchableOpacity style={[styles.uploadButton, { borderColor: colors.border }]} onPress={handlePickImage}>
                                <Ionicons name="images-outline" size={20} color={colors.primary} />
                                <Text style={[styles.uploadButtonText, { color: colors.textPrimary }]}>Gallery</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={[styles.uploadButton, { borderColor: colors.border }]} onPress={handleTakePhoto}>
                                <Ionicons name="camera-outline" size={20} color={colors.primary} />
                                <Text style={[styles.uploadButtonText, { color: colors.textPrimary }]}>Camera</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={[styles.uploadButton, { borderColor: colors.border }]} onPress={handlePickPdf}>
                                <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                                <Text style={[styles.uploadButtonText, { color: colors.textPrimary }]}>PDF File</Text>
                            </TouchableOpacity>
                        </View>

                        {/* File preview */}
                        {pickedFile && (
                            <View style={[styles.previewCard, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
                                {pickedFile.type === 'image' ? (
                                    <Image source={{ uri: pickedFile.uri }} style={styles.previewImage} />
                                ) : (
                                    <View style={styles.pdfPreviewIcon}>
                                        <Ionicons name="document-attach" size={36} color="#B28A45" />
                                    </View>
                                )}
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.previewName, { color: colors.textPrimary }]} numberOfLines={1}>
                                        {pickedFile.name}
                                    </Text>
                                    <Text style={[styles.previewMeta, { color: colors.textSecondary }]}>
                                        {pickedFile.type === 'pdf' ? 'PDF Document' : 'Photo Document'} Ready
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={() => setPickedFile(null)}>
                                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                                </TouchableOpacity>
                            </View>
                        )}

                        <TouchableOpacity
                            style={[styles.submitButton, (!pickedFile || submitting) && { opacity: 0.6 }]}
                            onPress={handleSubmit}
                            disabled={!pickedFile || submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <>
                                    <Ionicons name="paper-plane" size={18} color="#FFFFFF" />
                                    <Text style={styles.submitButtonText}>Submit to Admin for Verification</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
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
        maxHeight: '85%',
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
    noticeBox: {
        borderWidth: 1,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        marginBottom: SPACING.md,
    },
    noticeText: {
        fontSize: FONT_SIZES.sm,
        lineHeight: 18,
        marginBottom: 4,
    },
    noticeSub: {
        fontSize: 12,
        lineHeight: 16,
    },
    sectionLabel: {
        fontSize: FONT_SIZES.xs,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        marginBottom: SPACING.xs,
        letterSpacing: 0.5,
    },
    docTypeContainer: {
        gap: 8,
    },
    docTypeOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderRadius: BORDER_RADIUS.md,
        padding: 12,
    },
    docTypeText: {
        fontSize: FONT_SIZES.sm,
        fontWeight: '500',
    },
    uploadRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: SPACING.md,
    },
    uploadButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderWidth: 1,
        borderRadius: BORDER_RADIUS.md,
        gap: 4,
    },
    uploadButtonText: {
        fontSize: 12,
        fontWeight: '600',
    },
    previewCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 10,
        borderWidth: 1,
        borderRadius: BORDER_RADIUS.md,
        marginBottom: SPACING.md,
    },
    previewImage: {
        width: 50,
        height: 50,
        borderRadius: BORDER_RADIUS.sm,
        backgroundColor: '#CCC',
    },
    pdfPreviewIcon: {
        width: 50,
        height: 50,
        borderRadius: BORDER_RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(178, 138, 69, 0.15)',
    },
    previewName: {
        fontSize: 13,
        fontWeight: 'bold',
    },
    previewMeta: {
        fontSize: 11,
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
