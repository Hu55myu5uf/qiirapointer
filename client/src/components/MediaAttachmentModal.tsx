import React from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Platform,
    Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';

export interface SelectedAttachment {
    uri: string;
    type: 'image' | 'video' | 'document';
    name?: string;
    mimeType?: string;
    size?: number;
}

interface MediaAttachmentModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (attachment: SelectedAttachment) => void;
    title?: string;
    allowVideo?: boolean;
    allowDocuments?: boolean;
    allowsEditing?: boolean;
    aspect?: [number, number];
}

export default function MediaAttachmentModal({
    visible,
    onClose,
    onSelect,
    title = 'Add Attachment',
    allowVideo = true,
    allowDocuments = true,
    allowsEditing = false,
    aspect = [1, 1],
}: MediaAttachmentModalProps) {
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const handleCameraPhoto = async () => {
        try {
            onClose();
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Camera permission is required to snap photos.');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing,
                aspect: allowsEditing ? aspect : undefined,
                quality: 0.85,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const asset = result.assets[0];
                onSelect({
                    uri: asset.uri,
                    type: 'image',
                    name: asset.fileName || `photo_${Date.now()}.jpg`,
                    mimeType: asset.mimeType || 'image/jpeg',
                    size: asset.fileSize,
                });
            }
        } catch (error) {
            console.error('Camera error:', error);
            Alert.alert('Error', 'Could not open camera.');
        }
    };

    const handleCameraVideo = async () => {
        try {
            onClose();
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Camera permission is required to record video.');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['videos'],
                videoMaxDuration: 60,
                quality: 0.8,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const asset = result.assets[0];
                onSelect({
                    uri: asset.uri,
                    type: 'video',
                    name: asset.fileName || `video_${Date.now()}.mp4`,
                    mimeType: asset.mimeType || 'video/mp4',
                    size: asset.fileSize,
                });
            }
        } catch (error) {
            console.error('Video camera error:', error);
            Alert.alert('Error', 'Could not open video camera.');
        }
    };

    const handleGallery = async () => {
        try {
            onClose();
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Gallery access is required.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: allowVideo ? ['images', 'videos'] : ['images'],
                allowsEditing,
                aspect: allowsEditing ? aspect : undefined,
                quality: 0.85,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const asset = result.assets[0];
                const isVideo = asset.type === 'video' || asset.mimeType?.startsWith('video');
                onSelect({
                    uri: asset.uri,
                    type: isVideo ? 'video' : 'image',
                    name: asset.fileName || (isVideo ? `video_${Date.now()}.mp4` : `image_${Date.now()}.jpg`),
                    mimeType: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
                    size: asset.fileSize,
                });
            }
        } catch (error) {
            console.error('Gallery error:', error);
            Alert.alert('Error', 'Could not open gallery.');
        }
    };

    const handleDocument = async () => {
        try {
            onClose();
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/*', 'video/*'],
                copyToCacheDirectory: true,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const asset = result.assets[0];
                const mime = asset.mimeType || '';
                const isImg = mime.startsWith('image/');
                const isVid = mime.startsWith('video/');
                onSelect({
                    uri: asset.uri,
                    type: isImg ? 'image' : isVid ? 'video' : 'document',
                    name: asset.name,
                    mimeType: asset.mimeType || 'application/octet-stream',
                    size: asset.size,
                });
            }
        } catch (error) {
            console.error('Document picker error:', error);
            Alert.alert('Error', 'Could not pick document.');
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.overlay}>
                    <TouchableWithoutFeedback>
                        <View style={styles.sheetContainer}>
                            <View style={styles.dragHandle} />
                            <Text style={styles.sheetTitle}>{title}</Text>

                            <View style={styles.optionsGrid}>
                                {/* Camera Snap */}
                                <TouchableOpacity
                                    style={styles.optionItem}
                                    onPress={handleCameraPhoto}
                                    activeOpacity={0.7}
                                >
                                    <View style={[styles.iconCircle, { backgroundColor: '#3B82F6' + '20' }]}>
                                        <Ionicons name="camera" size={26} color="#3B82F6" />
                                    </View>
                                    <Text style={styles.optionLabel}>Snap Photo</Text>
                                    <Text style={styles.optionSub}>Take with camera</Text>
                                </TouchableOpacity>

                                {/* Gallery */}
                                <TouchableOpacity
                                    style={styles.optionItem}
                                    onPress={handleGallery}
                                    activeOpacity={0.7}
                                >
                                    <View style={[styles.iconCircle, { backgroundColor: '#10B981' + '20' }]}>
                                        <Ionicons name="images" size={26} color="#10B981" />
                                    </View>
                                    <Text style={styles.optionLabel}>Gallery</Text>
                                    <Text style={styles.optionSub}>Photos & Videos</Text>
                                </TouchableOpacity>

                                {/* Video Camera */}
                                {allowVideo && (
                                    <TouchableOpacity
                                        style={styles.optionItem}
                                        onPress={handleCameraVideo}
                                        activeOpacity={0.7}
                                    >
                                        <View style={[styles.iconCircle, { backgroundColor: '#EC4899' + '20' }]}>
                                            <Ionicons name="videocam" size={26} color="#EC4899" />
                                        </View>
                                        <Text style={styles.optionLabel}>Record Video</Text>
                                        <Text style={styles.optionSub}>Shoot Showcase</Text>
                                    </TouchableOpacity>
                                )}

                                {/* Document / Files */}
                                {allowDocuments && (
                                    <TouchableOpacity
                                        style={styles.optionItem}
                                        onPress={handleDocument}
                                        activeOpacity={0.7}
                                    >
                                        <View style={[styles.iconCircle, { backgroundColor: '#F59E0B' + '20' }]}>
                                            <Ionicons name="document-text" size={26} color="#F59E0B" />
                                        </View>
                                        <Text style={styles.optionLabel}>Documents</Text>
                                        <Text style={styles.optionSub}>PDF, Files & Docs</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={onClose}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

const getStyles = (colors: any) =>
    StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            justifyContent: 'flex-end',
        },
        sheetContainer: {
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: SPACING.lg,
            paddingTop: SPACING.md,
            paddingBottom: Platform.OS === 'ios' ? SPACING.xl * 1.5 : SPACING.xl,
            borderWidth: 1,
            borderColor: colors.border,
        },
        dragHandle: {
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.border,
            alignSelf: 'center',
            marginBottom: SPACING.md,
        },
        sheetTitle: {
            fontSize: FONT_SIZES.md,
            fontWeight: '700',
            color: colors.textPrimary,
            textAlign: 'center',
            marginBottom: SPACING.lg,
        },
        optionsGrid: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: SPACING.md,
        },
        optionItem: {
            width: '47%',
            backgroundColor: colors.background,
            borderRadius: BORDER_RADIUS.lg,
            padding: SPACING.md,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.border,
        },
        iconCircle: {
            width: 56,
            height: 56,
            borderRadius: 28,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: SPACING.sm,
        },
        optionLabel: {
            fontSize: FONT_SIZES.sm,
            fontWeight: '600',
            color: colors.textPrimary,
            marginBottom: 2,
        },
        optionSub: {
            fontSize: FONT_SIZES.xs,
            color: colors.textSecondary,
        },
        cancelButton: {
            marginTop: SPACING.lg,
            paddingVertical: SPACING.md,
            backgroundColor: colors.background,
            borderRadius: BORDER_RADIUS.md,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.border,
        },
        cancelText: {
            fontSize: FONT_SIZES.sm,
            fontWeight: '600',
            color: colors.textSecondary,
        },
    });
