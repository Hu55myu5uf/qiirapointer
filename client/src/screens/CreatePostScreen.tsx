import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    Alert,
    Platform,
    KeyboardAvoidingView,
    StatusBar,
    FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Cached, downscaled images (expo-image) with the same props as React Native Image
import { Image } from '../components/CachedImage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS, CONTENT_MAX_WIDTH } from '../constants/theme';
import { postAPI } from '../services/api';
import { auth } from '../config/firebase';
import { useAuthStore } from '../store/authStore';
import { POPULAR_CATEGORIES } from '../constants/categories';
import CategoryPickerModal from '../components/CategoryPickerModal';
import VideoEditSheet, { VideoEdits } from '../components/VideoEditSheet';
import { uploadVideo, videoFrame, imageFileAsDataUri, MAX_VIDEO_SECONDS } from '../utils/videoUpload';

const CATEGORIES = POPULAR_CATEGORIES.filter(c => c !== 'All');

const PRESET_PHOTOS = [
    { label: '🍕 Food', url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800' },
    { label: '👗 Fashion', url: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800' },
    { label: '💻 Tech', url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800' },
    { label: '✨ Beauty', url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800' },
    { label: '💐 Gifts', url: 'https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=800' },
    { label: '🚗 Auto', url: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800' },
];

interface MediaItem {
    uri: string;                 // images: data URI or https link; videos: the local file
    type: 'image' | 'video';
    id: string;
    mime?: string | null;        // videos
    size?: number | null;        // videos, bytes
    duration?: number;           // videos, seconds
    edits?: VideoEdits;          // videos: trim / cover / mute
}

const newId = () => `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const NO_EDITS: VideoEdits = { start: 0, end: null, muted: false, coverTime: 0, coverUri: null };

export default function CreatePostScreen({ navigation }: any) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => getStyles(colors, insets.top), [colors, insets.top]);

    const { user, userRole, realRole } = useAuthStore();
    const isAdmin = Boolean(realRole === 'admin' || userRole === 'admin' || user?.email === 'admin@qiira.com' || user?.uid === 'v8MwaOet0ISfZAWXIDAPAGcg1td2');
    const isVendor = userRole === 'vendor' || realRole === 'vendor';

    const [postType, setPostType] = useState<'photos' | 'reels' | 'mixed'>('photos');
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
    const [customUrlInput, setCustomUrlInput] = useState<string>('');
    const [showUrlInput, setShowUrlInput] = useState<boolean>(false);
    const [caption, setCaption] = useState<string>('');
    const [price, setPrice] = useState<string>('');
    const [category, setCategory] = useState<string>('Food & Agriculture');
    const [showCategoryModal, setShowCategoryModal] = useState<boolean>(false);
    const [tags, setTags] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [uploadStatus, setUploadStatus] = useState<string>('');
    const [editingId, setEditingId] = useState<string | null>(null);

    /**
     * Turn a picked asset into a media item. Photos are sent as data URIs (small); videos stay as
     * local files and are uploaded directly to storage when the post is published.
     */
    const assetToMediaItem = async (asset: { uri: string; type?: string | null; base64?: string | null; mimeType?: string | null; fileSize?: number | null; duration?: number | null }): Promise<MediaItem | null> => {
        const isVideo = asset.type === 'video' || Boolean(asset.mimeType?.startsWith('video/'));
        if (isVideo) {
            if (Platform.OS === 'web') {
                Alert.alert('Use the app', 'Videos can be posted from the Pointer app on your phone.');
                return null;
            }
            const item: MediaItem = {
                uri: asset.uri,
                type: 'video',
                id: newId(),
                mime: asset.mimeType,
                size: asset.fileSize,
                duration: asset.duration ? asset.duration / 1000 : undefined,
                edits: { ...NO_EDITS },
            };
            // Default cover: the first frame (made in the background)
            videoFrame(asset.uri, 0).then(frame => {
                if (frame) setMediaItems(prev => prev.map(m => m.id === item.id ? { ...m, edits: { ...(m.edits || NO_EDITS), coverUri: m.edits?.coverUri || frame } } : m));
            });
            return item;
        }
        let finalUri = '';
        if (asset.base64) {
            finalUri = asset.base64.startsWith('data:') ? asset.base64 : `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`;
        } else if (asset.uri) {
            finalUri = await convertBlobToBase64(asset.uri);
        }
        return finalUri ? { uri: finalUri, type: 'image', id: newId() } : null;
    };

    const addAssets = async (assets: any[]) => {
        const items = (await Promise.all(assets.map(assetToMediaItem))).filter(Boolean) as MediaItem[];
        if (items.length) setMediaItems(prev => [...prev, ...items].slice(0, 10));
        // Open the editor straight away for a single new video
        const videos = items.filter(i => i.type === 'video');
        if (videos.length === 1) setEditingId(videos[0].id);
    };

    // Convert local/blob URIs to permanent base64 data URIs
    const convertBlobToBase64 = async (uri: string): Promise<string> => {
        try {
            if (!uri) return '';
            if (uri.startsWith('data:')) return uri;
            if (Platform.OS === 'web' || uri.startsWith('blob:')) {
                const response = await fetch(uri);
                const blob = await response.blob();
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        resolve(reader.result as string);
                    };
                    reader.onerror = () => {
                        resolve(uri);
                    };
                    reader.readAsDataURL(blob);
                });
            }
            return uri;
        } catch (e) {
            console.warn('Blob to base64 conversion note:', e);
            return uri;
        }
    };

    const handlePickImages = async () => {
        try {
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permissionResult.granted) {
                Alert.alert('Permission Denied', 'Please allow access to your photos/videos to create a post.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: postType === 'reels' ? ['videos'] : postType === 'mixed' ? ['images', 'videos'] : ['images'],
                allowsMultipleSelection: true,
                selectionLimit: 10,
                quality: 0.8,
                base64: true,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                await addAssets(result.assets);
            }
        } catch (error) {
            console.error('Pick media error:', error);
            Alert.alert('Error', 'Failed to pick media from device');
        }
    };

    const handlePickSingleMedia = async (mediaType: 'images' | 'videos') => {
        try {
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permissionResult.granted) {
                Alert.alert('Permission Denied', 'Please allow access to your media.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: [mediaType === 'videos' ? 'videos' : 'images'],
                allowsMultipleSelection: true,
                selectionLimit: 10,
                quality: 0.8,
                base64: true,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                await addAssets(result.assets);
            }
        } catch (error) {
            console.error('Pick media error:', error);
        }
    };

    const handleSnapCamera = async () => {
        try {
            const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
            if (!permissionResult.granted) {
                Alert.alert('Permission Denied', 'Camera permission is required to capture photos or video.');
                return;
            }

            const isShowcase = postType === 'reels';
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: isShowcase ? ['videos'] : ['images', 'videos'],
                videoMaxDuration: MAX_VIDEO_SECONDS,
                quality: 0.8,
                base64: true,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                await addAssets([result.assets[0]]);
            }
        } catch (error) {
            console.error('Camera capture error:', error);
            Alert.alert('Error', 'Could not open camera.');
        }
    };

    const handlePickDocument = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['image/*', 'video/*'],
                copyToCacheDirectory: true,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
                const asset = result.assets[0];
                const isVideo = Boolean(asset.mimeType?.startsWith('video/')) || /\.(mp4|mov)$/i.test(asset.name);
                await addAssets([{ uri: asset.uri, type: isVideo ? 'video' : 'image', mimeType: asset.mimeType, fileSize: asset.size }]);
            }
        } catch (e) {
            console.error('Document pick error:', e);
        }
    };

    const handleRemoveMedia = (id: string) => {
        setMediaItems(prev => prev.filter(item => item.id !== id));
    };

    const handleApplyCustomUrl = () => {
        if (!customUrlInput.trim()) {
            Alert.alert('Empty URL', 'Please enter an image or video URL.');
            return;
        }
        const newItem: MediaItem = {
            uri: customUrlInput.trim(),
            type: customUrlInput.includes('video') ? 'video' : 'image',
            id: `media_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        };
        setMediaItems(prev => [...prev, newItem]);
        setCustomUrlInput('');
        setShowUrlInput(false);
    };

    const handleAddPreset = (url: string) => {
        // Check if already added
        if (mediaItems.some(m => m.uri === url)) return;
        const newItem: MediaItem = {
            uri: url,
            type: 'image',
            id: `media_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        };
        setMediaItems(prev => [...prev, newItem]);
    };

    // Calculate clean parsed price number
    const getCleanNumericPrice = (rawPrice: string): number | undefined => {
        if (!rawPrice || !rawPrice.trim()) return undefined;
        const cleaned = rawPrice.replace(/[^0-9.]/g, '');
        const num = parseFloat(cleaned);
        return (!isNaN(num) && num > 0) ? num : undefined;
    };

    const parsedPriceNumber = getCleanNumericPrice(price);

    const handleCreatePost = async () => {
        if (mediaItems.length === 0) {
            Alert.alert('Missing Media', 'Please select at least one photo or video for your post.');
            return;
        }

        const vendorId = auth.currentUser?.uid;
        if (!vendorId) {
            Alert.alert('Authentication Error', 'You must be logged in as a vendor to create a post.');
            return;
        }

        setLoading(true);
        try {
            const formattedTags = tags
                .split(',')
                .map((t) => t.trim().replace(/^#/, ''))
                .filter(Boolean);

            // Determine the post type based on content
            const hasVideo = mediaItems.some(m => m.type === 'video');
            const hasImage = mediaItems.some(m => m.type === 'image');
            const resolvedType = (hasVideo && !hasImage) ? 'reel' : 'post';

            // Clips must fit the length limit (the editor shows how to trim)
            const longVideo = mediaItems.find(m => m.type === 'video' && m.duration && (((m.edits?.end ?? m.duration) - (m.edits?.start ?? 0)) > MAX_VIDEO_SECONDS + 0.5));
            if (longVideo) {
                setLoading(false);
                Alert.alert('Video too long', `Showcase videos can be up to ${MAX_VIDEO_SECONDS} seconds. Trim it in the editor.`, [
                    { text: 'Trim now', onPress: () => setEditingId(longVideo.id) },
                ]);
                return;
            }

            // Upload each video file straight to storage (with progress), keep photos as they are
            const videos = mediaItems.filter(m => m.type === 'video');
            const allUrls: string[] = [];
            let videoNo = 0;
            for (const m of mediaItems) {
                if (m.type !== 'video') { allUrls.push(m.uri); continue; }
                videoNo += 1;
                const label = videos.length > 1 ? `Uploading video ${videoNo} of ${videos.length}` : 'Uploading video';
                setUploadStatus(`${label}…`);
                const ref = await uploadVideo(m.uri, {
                    mime: m.mime,
                    size: m.size,
                    onProgress: (p) => setUploadStatus(`${label} · ${Math.round(p * 100)}%`),
                });
                allUrls.push(ref);
            }
            setUploadStatus('Publishing…');

            // Edits and cover of the first video
            const firstVideo = videos[0];
            const edits = firstVideo?.edits;
            const thumbnailData = edits?.coverUri ? await imageFileAsDataUri(edits.coverUri).catch(() => undefined) : undefined;

            await postAPI.createPost({
                vendorId,
                type: resolvedType,
                caption: caption.trim() || 'New product arrival',
                mediaUrl: allUrls[0],
                mediaUrls: allUrls,
                price: parsedPriceNumber,
                currency: 'NGN',
                category,
                tags: formattedTags,
                ...(firstVideo ? {
                    videoOptions: { muted: Boolean(edits?.muted), start: edits?.start || 0, end: edits?.end ?? null },
                    ...(thumbnailData ? { thumbnailData } : {}),
                } : { thumbnailUrl: allUrls[0] }),
            });

            Alert.alert(
                'Success 🎉',
                `Your post with ${allUrls.length} media item${allUrls.length > 1 ? 's' : ''} has been published!`,
                [{ text: 'OK', onPress: () => navigation.goBack() }]
            );
        } catch (error: any) {
            console.error('Create post error:', error);
            const msg = error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to publish post';
            Alert.alert('Could not publish', msg);
        } finally {
            setLoading(false);
            setUploadStatus('');
        }
    };

    const renderMediaItem = ({ item, index }: { item: MediaItem; index: number }) => (
        <View style={styles.mediaItemContainer}>
            {item.type === 'video' ? (
                item.edits?.coverUri
                    ? <Image source={{ uri: item.edits.coverUri }} style={styles.mediaItemImage} resizeMode="cover" />
                    : <View style={[styles.mediaItemImage, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color="#fff" /></View>
            ) : (
                <Image source={{ uri: item.uri }} style={styles.mediaItemImage} resizeMode="cover" />
            )}
            {/* Index badge */}
            <View style={styles.mediaItemIndex}>
                <Text style={styles.mediaItemIndexText}>{index + 1}</Text>
            </View>
            {/* Type badge */}
            {item.type === 'video' && (
                <TouchableOpacity
                    style={[styles.mediaItemTypeBadge, { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, width: undefined }]}
                    onPress={() => setEditingId(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Edit video"
                >
                    <Ionicons name="cut-outline" size={12} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Edit</Text>
                </TouchableOpacity>
            )}
            {/* Remove button */}
            <TouchableOpacity style={styles.mediaItemRemove} onPress={() => handleRemoveMedia(item.id)}>
                <Ionicons name="close-circle" size={22} color="#FF4444" />
            </TouchableOpacity>
        </View>
    );

    const editingItem = mediaItems.find(m => m.id === editingId && m.type === 'video');

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {editingItem ? (
                <VideoEditSheet
                    key={editingItem.id}
                    visible
                    uri={editingItem.uri}
                    durationSeconds={editingItem.duration || 0}
                    initial={editingItem.edits || NO_EDITS}
                    onCancel={() => setEditingId(null)}
                    onDone={(edits) => {
                        setMediaItems(prev => prev.map(m => m.id === editingItem.id ? { ...m, edits } : m));
                        setEditingId(null);
                    }}
                />
            ) : null}
            {uploadStatus ? (
                <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: SPACING.lg }}>
                    <View style={{ backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.lg, alignItems: 'center', gap: SPACING.sm, minWidth: 220 }}>
                        <ActivityIndicator color={colors.primary} />
                        <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{uploadStatus}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Keep the app open until it finishes.</Text>
                    </View>
                </View>
            ) : null}
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Create Post</Text>
                <TouchableOpacity
                    style={[styles.publishButton, (mediaItems.length === 0 || loading) && styles.publishButtonDisabled]}
                    onPress={handleCreatePost}
                    disabled={mediaItems.length === 0 || loading}
                >
                    {loading ? (
                        <ActivityIndicator size="small" color={colors.textInverse} />
                    ) : (
                        <Text style={styles.publishButtonText}>Publish</Text>
                    )}
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Post Type Selector */}
                <View style={styles.typeSelector}>
                    <TouchableOpacity
                        style={[styles.typeButton, postType === 'photos' && styles.typeButtonActive]}
                        onPress={() => setPostType('photos')}
                    >
                        <Ionicons
                            name="images-outline"
                            size={16}
                            color={postType === 'photos' ? colors.textInverse : colors.textSecondary}
                        />
                        <Text style={[styles.typeButtonText, postType === 'photos' && styles.typeButtonTextActive]}>
                            Photos
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.typeButton, postType === 'reels' && styles.typeButtonActive]}
                        onPress={() => setPostType('reels')}
                    >
                        <Ionicons
                            name="videocam-outline"
                            size={16}
                            color={postType === 'reels' ? colors.textInverse : colors.textSecondary}
                        />
                        <Text style={[styles.typeButtonText, postType === 'reels' && styles.typeButtonTextActive]}>
                            Showcase
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.typeButton, postType === 'mixed' && styles.typeButtonActive]}
                        onPress={() => setPostType('mixed')}
                    >
                        <Ionicons
                            name="albums-outline"
                            size={16}
                            color={postType === 'mixed' ? colors.textInverse : colors.textSecondary}
                        />
                        <Text style={[styles.typeButtonText, postType === 'mixed' && styles.typeButtonTextActive]}>
                            Mixed
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Media Gallery Section */}
                <View style={styles.mediaSection}>
                    <View style={styles.mediaSectionHeader}>
                        <Text style={styles.mediaSectionTitle}>
                            Media ({mediaItems.length}/10)
                        </Text>
                        {mediaItems.length > 0 && (
                            <TouchableOpacity onPress={() => setMediaItems([])}>
                                <Text style={styles.clearAllText}>Clear All</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Media Preview Carousel */}
                    {mediaItems.length > 0 && (
                        <FlatList
                            data={mediaItems}
                            horizontal
                            renderItem={renderMediaItem}
                            keyExtractor={item => item.id}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.mediaCarousel}
                        />
                    )}

                    {/* Add Media Buttons: Gallery & Camera */}
                    <View style={styles.addMediaRow}>
                        <TouchableOpacity style={[styles.addMediaButton, { flex: 1 }]} onPress={handlePickImages}>
                            <View style={styles.addMediaIconContainer}>
                                <Ionicons name="images-outline" size={26} color={colors.primary} />
                            </View>
                            <Text style={styles.addMediaButtonTitle}>
                                {postType === 'reels' ? 'Gallery Video' : 'Gallery'}
                            </Text>
                            <Text style={styles.addMediaButtonSubtitle}>
                                Choose from library
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.addMediaButton, { flex: 1 }]} onPress={handleSnapCamera}>
                            <View style={[styles.addMediaIconContainer, { backgroundColor: '#3B82F6' + '20' }]}>
                                <Ionicons name="camera-outline" size={26} color="#3B82F6" />
                            </View>
                            <Text style={styles.addMediaButtonTitle}>
                                {postType === 'reels' ? 'Record Video' : 'Camera Snap'}
                            </Text>
                            <Text style={styles.addMediaButtonSubtitle}>
                                Take with camera
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Document / File & URL Options */}
                    <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs }}>
                        <TouchableOpacity
                            style={[styles.quickMediaButton, { flex: 1 }]}
                            onPress={handlePickDocument}
                        >
                            <Ionicons name="document-attach-outline" size={16} color={colors.primary} />
                            <Text style={styles.quickMediaButtonText}>Browse Files</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.quickMediaButton, { flex: 1 }]}
                            onPress={() => setShowUrlInput(!showUrlInput)}
                        >
                            <Ionicons name="link-outline" size={16} color={colors.primary} />
                            <Text style={styles.quickMediaButtonText}>
                                {showUrlInput ? 'Hide URL' : 'Image URL'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Direct URL Input */}
                    {showUrlInput && (
                        <View style={styles.urlInputBox}>
                            <TextInput
                                style={styles.urlInputField}
                                placeholder="Paste direct image URL (https://...)"
                                placeholderTextColor={colors.textTertiary}
                                value={customUrlInput}
                                onChangeText={setCustomUrlInput}
                                autoCapitalize="none"
                            />
                            <TouchableOpacity style={styles.urlApplyButton} onPress={handleApplyCustomUrl}>
                                <Text style={styles.urlApplyButtonText}>Add</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Quick Preset Badges */}
                    <View style={styles.presetsWrapper}>
                        <Text style={styles.presetsLabel}>Or pick sample photos:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsScroll}>
                            {PRESET_PHOTOS.map((p, idx) => {
                                const isAdded = mediaItems.some(m => m.uri === p.url);
                                return (
                                    <TouchableOpacity
                                        key={idx}
                                        style={[
                                            styles.presetChip,
                                            isAdded && styles.presetChipActive,
                                        ]}
                                        onPress={() => handleAddPreset(p.url)}
                                    >
                                        <Text
                                            style={[
                                                styles.presetChipText,
                                                isAdded && styles.presetChipTextActive,
                                            ]}
                                        >
                                            {isAdded ? `✓ ${p.label}` : p.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>

                {/* Caption Input */}
                <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Caption / Description *</Text>
                    <TextInput
                        style={styles.textArea}
                        placeholder="Describe your product, service, special offer or new arrival..."
                        placeholderTextColor={colors.textTertiary}
                        value={caption}
                        onChangeText={setCaption}
                        multiline
                        numberOfLines={4}
                    />
                </View>

                {/* Price Input & Realtime Formatting */}
                <View style={styles.inputGroup}>
                    <View style={styles.labelWithPreview}>
                        <Text style={styles.inputLabel}>Product Price (₦ NGN - Optional)</Text>
                        {parsedPriceNumber ? (
                            <Text style={styles.pricePreviewBadge}>
                                Preview: ₦{parsedPriceNumber.toLocaleString()}
                            </Text>
                        ) : null}
                    </View>
                    <View style={styles.priceInputWrapper}>
                        <Text style={styles.currencyPrefix}>₦</Text>
                        <TextInput
                            style={styles.priceInput}
                            placeholder="e.g. 15,000"
                            placeholderTextColor={colors.textTertiary}
                            value={price}
                            onChangeText={setPrice}
                            keyboardType="numeric"
                        />
                    </View>
                </View>

                {/* Category Picker */}
                <View style={styles.inputGroup}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.inputLabel}>Category</Text>
                        <TouchableOpacity onPress={() => setShowCategoryModal(true)}>
                            <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>
                                🔍 Browse All Categories
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                        {(!CATEGORIES.includes(category) ? [category, ...CATEGORIES] : CATEGORIES).map((cat) => (
                            <TouchableOpacity
                                key={cat}
                                style={[styles.categoryChip, category === cat && styles.categoryChipActive]}
                                onPress={() => setCategory(cat)}
                            >
                                <Text
                                    style={[
                                        styles.categoryChipText,
                                        category === cat && styles.categoryChipTextActive,
                                    ]}
                                >
                                    {cat}
                                </Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                            style={[styles.categoryChip, { backgroundColor: `${colors.primary}15`, borderColor: colors.primary }]}
                            onPress={() => setShowCategoryModal(true)}
                        >
                            <Text style={[styles.categoryChipText, { color: colors.primary, fontWeight: '700' }]}>
                                + More
                            </Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>

                <CategoryPickerModal
                    visible={showCategoryModal}
                    onClose={() => setShowCategoryModal(false)}
                    selectedCategory={category}
                    onSelectCategory={(catName, subName) => {
                        setCategory(subName ? `${catName} - ${subName}` : catName);
                    }}
                    title="Select Post Category"
                    subtitle="Tag your post for relevant buyers & discovery"
                    allowSubcategories={true}
                />

                {/* Tags */}
                <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Tags (comma separated)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. sneakers, discount, luxury, fashion"
                        placeholderTextColor={colors.textTertiary}
                        value={tags}
                        onChangeText={setTags}
                    />
                </View>

                {/* Bottom spacer */}
                <View style={{ height: 40 }} />
            </ScrollView>
        </KeyboardAvoidingView>
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
        headerTitle: {
            fontSize: FONT_SIZES.lg,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        publishButton: {
            backgroundColor: colors.primary,
            paddingHorizontal: SPACING.lg,
            paddingVertical: SPACING.sm,
            borderRadius: BORDER_RADIUS.round,
        },
        publishButtonDisabled: {
            opacity: 0.5,
        },
        publishButtonText: {
            color: colors.textInverse,
            fontWeight: '700',
            fontSize: FONT_SIZES.sm,
        },
        scrollContent: {
            width: '100%',
            maxWidth: CONTENT_MAX_WIDTH,
            alignSelf: 'center',
            padding: SPACING.lg,
        },
        typeSelector: {
            flexDirection: 'row',
            backgroundColor: colors.surfaceLight,
            padding: 4,
            borderRadius: BORDER_RADIUS.md,
            marginBottom: SPACING.lg,
        },
        typeButton: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: SPACING.sm,
            borderRadius: BORDER_RADIUS.sm,
            gap: 4,
        },
        typeButtonActive: {
            backgroundColor: colors.primary,
        },
        typeButtonText: {
            fontSize: FONT_SIZES.xs,
            fontWeight: '600',
            color: colors.textSecondary,
        },
        typeButtonTextActive: {
            color: colors.textInverse,
        },

        // Media Gallery Section
        mediaSection: {
            marginBottom: SPACING.lg,
            backgroundColor: colors.surface,
            borderRadius: BORDER_RADIUS.lg,
            padding: SPACING.md,
            borderWidth: 1,
            borderColor: colors.border,
        },
        mediaSectionHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: SPACING.sm,
        },
        mediaSectionTitle: {
            fontSize: FONT_SIZES.md,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        clearAllText: {
            fontSize: FONT_SIZES.xs,
            color: colors.error,
            fontWeight: '600',
        },
        mediaCarousel: {
            paddingVertical: SPACING.xs,
        },
        mediaItemContainer: {
            width: 120,
            height: 120,
            borderRadius: BORDER_RADIUS.md,
            marginRight: SPACING.sm,
            overflow: 'hidden',
            position: 'relative',
            borderWidth: 2,
            borderColor: colors.border,
        },
        mediaItemImage: {
            width: '100%',
            height: '100%',
        },
        mediaItemIndex: {
            position: 'absolute',
            top: 4,
            left: 4,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: colors.primary,
            justifyContent: 'center',
            alignItems: 'center',
        },
        mediaItemIndexText: {
            color: '#fff',
            fontSize: 10,
            fontWeight: 'bold',
        },
        mediaItemTypeBadge: {
            position: 'absolute',
            bottom: 4,
            left: 4,
            backgroundColor: 'rgba(0,0,0,0.7)',
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: BORDER_RADIUS.round,
        },
        mediaItemRemove: {
            position: 'absolute',
            top: 2,
            right: 2,
        },
        addMediaRow: {
            flexDirection: 'row',
            gap: SPACING.sm,
            marginTop: SPACING.sm,
        },
        addMediaButton: {
            flex: 1,
            backgroundColor: colors.surfaceLight,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: colors.border,
            borderRadius: BORDER_RADIUS.md,
            paddingVertical: SPACING.lg,
            alignItems: 'center',
            justifyContent: 'center',
        },
        addMediaIconContainer: {
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: `${colors.primary}15`,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: SPACING.xs,
        },
        addMediaButtonTitle: {
            fontSize: FONT_SIZES.sm,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        addMediaButtonSubtitle: {
            fontSize: FONT_SIZES.xs,
            color: colors.textSecondary,
            marginTop: 2,
        },
        addMediaButtonSmall: {
            backgroundColor: colors.surfaceLight,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BORDER_RADIUS.md,
            paddingVertical: SPACING.md,
            paddingHorizontal: SPACING.sm,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            minWidth: 72,
        },
        addMediaButtonSmallText: {
            fontSize: 11,
            fontWeight: '600',
            color: colors.primary,
        },
        quickMediaBar: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: SPACING.sm,
        },
        quickMediaButton: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingVertical: 4,
        },
        quickMediaButtonText: {
            fontSize: FONT_SIZES.xs,
            color: colors.primary,
            fontWeight: '600',
        },
        urlInputBox: {
            flexDirection: 'row',
            gap: SPACING.xs,
            marginTop: SPACING.xs,
            marginBottom: SPACING.xs,
        },
        urlInputField: {
            flex: 1,
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BORDER_RADIUS.sm,
            paddingHorizontal: SPACING.sm,
            paddingVertical: 8,
            fontSize: FONT_SIZES.xs,
            color: colors.textPrimary,
        },
        urlApplyButton: {
            backgroundColor: colors.primary,
            borderRadius: BORDER_RADIUS.sm,
            paddingHorizontal: SPACING.md,
            justifyContent: 'center',
            alignItems: 'center',
        },
        urlApplyButtonText: {
            color: colors.textInverse,
            fontSize: FONT_SIZES.xs,
            fontWeight: 'bold',
        },
        presetsWrapper: {
            marginTop: SPACING.sm,
        },
        presetsLabel: {
            fontSize: 11,
            color: colors.textTertiary,
            marginBottom: 4,
        },
        presetsScroll: {
            flexDirection: 'row',
        },
        presetChip: {
            backgroundColor: colors.surfaceLight,
            paddingHorizontal: SPACING.sm,
            paddingVertical: 4,
            borderRadius: BORDER_RADIUS.round,
            marginRight: 6,
            borderWidth: 1,
            borderColor: colors.border,
        },
        presetChipActive: {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
        },
        presetChipText: {
            fontSize: 11,
            color: colors.textSecondary,
            fontWeight: '600',
        },
        presetChipTextActive: {
            color: colors.textInverse,
        },

        // Form fields
        inputGroup: {
            marginBottom: SPACING.lg,
        },
        labelWithPreview: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: SPACING.xs,
        },
        inputLabel: {
            fontSize: FONT_SIZES.sm,
            fontWeight: '600',
            color: colors.textSecondary,
        },
        pricePreviewBadge: {
            fontSize: FONT_SIZES.xs,
            fontWeight: 'bold',
            color: colors.primary,
            backgroundColor: colors.surfaceLight,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: BORDER_RADIUS.round,
        },
        input: {
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BORDER_RADIUS.md,
            padding: SPACING.md,
            fontSize: FONT_SIZES.md,
            color: colors.textPrimary,
        },
        textArea: {
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BORDER_RADIUS.md,
            padding: SPACING.md,
            fontSize: FONT_SIZES.md,
            color: colors.textPrimary,
            minHeight: 100,
            textAlignVertical: 'top',
        },
        priceInputWrapper: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BORDER_RADIUS.md,
            paddingHorizontal: SPACING.md,
        },
        currencyPrefix: {
            fontSize: FONT_SIZES.lg,
            fontWeight: 'bold',
            color: colors.primary,
            marginRight: SPACING.xs,
        },
        priceInput: {
            flex: 1,
            paddingVertical: SPACING.md,
            fontSize: FONT_SIZES.md,
            color: colors.textPrimary,
        },
        categoryScroll: {
            flexDirection: 'row',
            marginTop: 4,
        },
        categoryChip: {
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.xs,
            borderRadius: BORDER_RADIUS.round,
            backgroundColor: colors.surfaceLight,
            borderWidth: 1,
            borderColor: colors.border,
            marginRight: SPACING.xs,
        },
        categoryChipActive: {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
        },
        categoryChipText: {
            fontSize: FONT_SIZES.xs,
            fontWeight: '600',
            color: colors.textSecondary,
        },
        categoryChipTextActive: {
            color: colors.textInverse,
        },
    });
};
