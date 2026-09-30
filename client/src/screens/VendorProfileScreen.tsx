import React, { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Image,
    Dimensions,
    Modal,
    FlatList,
    StatusBar,
    Linking,
} from 'react-native';
import { vendorAPI, postAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { shareVendorProfile, sharePost } from '../services/shareService';
import Ionicons from '@expo/vector-icons/Ionicons';
import { auth, storage } from '../config/firebase';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy'; // Use Legacy API for SDK 54
import { ref, uploadString, uploadBytes, uploadBytesResumable, getDownloadURL } from 'firebase/storage'; // Changed uploadBytes to uploadString
import { setLogLevel } from 'firebase/app';
import { LinearGradient } from 'expo-linear-gradient';
import { BusinessHours, DEFAULT_BUSINESS_HOURS, DAY_LABELS, formatTime } from '../utils/businessHours';
import { uploadImageViaBackend, uploadDocumentViaBackend } from '../utils/backendUpload';
import { PLACEHOLDER_AVATARS } from '../assets';
import { useTheme } from '../context/ThemeContext';
import { confirmAction } from '../utils/alert';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { VerificationBadgeInline, AvatarVerificationBadge } from '../components/VerificationBadge';

// Enable Debug Logs for Firebase
setLogLevel('debug');

const { width } = Dimensions.get('window');

// X-Style Theme Constants
const X_THEME = {
    bannerHeight: 150,
    avatarSize: 80,
};

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

export default function VendorProfileScreen({ navigation }: any) {
  const { theme, colors, toggleTheme } = useTheme();
  const styles = getStyles(colors);

    const { user, userRole, realRole } = useAuthStore();
    const isAdmin = Boolean(realRole === 'admin' || userRole === 'admin' || user?.email === 'admin@qiira.com' || user?.uid === 'v8MwaOet0ISfZAWXIDAPAGcg1td2');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [passwordModalVisible, setPasswordModalVisible] = useState(false);

    // Form State
    const [businessName, setBusinessName] = useState('');
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');
    const [address, setAddress] = useState('');
    const [services, setServices] = useState('');

    const [verificationStatus, setVerificationStatus] = useState('');
    const [isVerified, setIsVerified] = useState(false);
    const [businessImage, setBusinessImage] = useState('');
    const [bannerImage, setBannerImage] = useState('');

    // Tab State for View Mode (Defaults to 'posts' as requested)
    const [activeTab, setActiveTab] = useState<'posts' | 'about' | 'services' | 'docs'>('posts');
    const [posts, setPosts] = useState<any[]>([]);
    const [postsLoading, setPostsLoading] = useState(false);

    // Comments Modal State
    const [commentsModalVisible, setCommentsModalVisible] = useState(false);
    const [activePostForComments, setActivePostForComments] = useState<any>(null);
    const [comments, setComments] = useState<any[]>([]);
    const [newCommentText, setNewCommentText] = useState('');
    const [loadingComments, setLoadingComments] = useState(false);
    const [submittingComment, setSubmittingComment] = useState(false);

    // Business Hours State
    const [businessHours, setBusinessHours] = useState<BusinessHours>(DEFAULT_BUSINESS_HOURS);

    // Verification Documents
    const [documents, setDocuments] = useState<any[]>([]);

    // Menu/PDF Documents state
    const [menuDocuments, setMenuDocuments] = useState<any[]>([]);
    const [menuDocsLoading, setMenuDocsLoading] = useState(false);
    const [newDocTitle, setNewDocTitle] = useState('');
    const [newDocUrl, setNewDocUrl] = useState('');
    const [docSourceType, setDocSourceType] = useState<'file' | 'link'>('file');
    const [selectedPdfFile, setSelectedPdfFile] = useState<any | null>(null);
    const [uploadingDoc, setUploadingDoc] = useState(false);
    const [showAddDocForm, setShowAddDocForm] = useState(false);

    // Live location toggle state
    const [useLiveLocation, setUseLiveLocation] = useState(false);
    const [locationToggling, setLocationToggling] = useState(false);

    // Fetch menu documents
    const fetchMenuDocuments = useCallback(async () => {
        if (!user) return;
        setMenuDocsLoading(true);
        try {
            const response = await vendorAPI.getDocuments(user.uid);
            setMenuDocuments(response.data.documents || []);
        } catch (error) {
            console.error('Error fetching menu documents:', error);
        } finally {
            setMenuDocsLoading(false);
        }
    }, [user]);

    const handlePickPdfFile = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf'],
                copyToCacheDirectory: true,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const asset = result.assets[0];
                setSelectedPdfFile(asset);
                // Auto-fill title if currently empty
                if (!newDocTitle.trim()) {
                    const cleanName = (asset.name || 'Document').replace(/\.pdf$/i, '').replace(/[_-]/g, ' ');
                    setNewDocTitle(cleanName);
                }
            }
        } catch (err) {
            console.error('Error picking PDF file:', err);
            Alert.alert('File Selection Error', 'Could not open file picker. Please try again.');
        }
    };

    const handleAddMenuDocument = async () => {
        if (!user) return;

        if (docSourceType === 'file') {
            if (!selectedPdfFile) {
                Alert.alert('No File Selected', 'Please choose a PDF file from your device.');
                return;
            }
            if (!newDocTitle.trim()) {
                Alert.alert('Missing Title', 'Please enter a title for the document.');
                return;
            }

            setUploadingDoc(true);
            try {
                // 1. Upload local PDF file to backend
                const uploadRes = await uploadDocumentViaBackend(
                    selectedPdfFile.uri,
                    selectedPdfFile.name || 'document.pdf',
                    user.uid,
                    selectedPdfFile.mimeType || 'application/pdf'
                );

                // 2. Add document record to vendor profile
                const response = await vendorAPI.addDocument(user.uid, {
                    title: newDocTitle.trim(),
                    url: uploadRes.fileUrl,
                    fileType: 'application/pdf',
                    fileSize: uploadRes.fileSize || selectedPdfFile.size || 0,
                });

                setMenuDocuments(prev => [...prev, response.data.document]);
                setNewDocTitle('');
                setNewDocUrl('');
                setSelectedPdfFile(null);
                setShowAddDocForm(false);
                Alert.alert('Success', 'PDF Document uploaded and saved successfully!');
            } catch (error: any) {
                console.error('Upload document error:', error);
                Alert.alert('Upload Failed', error.message || 'Could not upload PDF document.');
            } finally {
                setUploadingDoc(false);
            }
        } else {
            // URL Link mode
            if (!newDocTitle.trim() || !newDocUrl.trim()) {
                Alert.alert('Missing Info', 'Please provide both a title and valid PDF URL link.');
                return;
            }
            setUploadingDoc(true);
            try {
                const response = await vendorAPI.addDocument(user.uid, {
                    title: newDocTitle.trim(),
                    url: newDocUrl.trim(),
                    fileType: 'application/pdf',
                });
                setMenuDocuments(prev => [...prev, response.data.document]);
                setNewDocTitle('');
                setNewDocUrl('');
                setSelectedPdfFile(null);
                setShowAddDocForm(false);
                Alert.alert('Success', 'PDF Document link added successfully!');
            } catch (error: any) {
                console.error('Add document link error:', error);
                Alert.alert('Error', error.message || 'Failed to add document link.');
            } finally {
                setUploadingDoc(false);
            }
        }
    };

    const handleRemoveMenuDocument = async (docId: string) => {
        if (!user) return;
        try {
            await vendorAPI.removeDocument(user.uid, docId);
            setMenuDocuments(prev => prev.filter(d => d.id !== docId));
        } catch (error) {
            console.error('Remove document error:', error);
            Alert.alert('Error', 'Failed to remove document.');
        }
    };

    const handleToggleLocation = async () => {
        if (!user) return;
        setLocationToggling(true);
        try {
            if (!useLiveLocation) {
                // Turning ON live location
                let { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permission Denied', 'Location permission is required to share your live location.');
                    setLocationToggling(false);
                    return;
                }
                const loc = await Location.getCurrentPositionAsync({});
                await vendorAPI.updateLocation(user.uid, {
                    useLiveLocation: true,
                    liveLatitude: loc.coords.latitude,
                    liveLongitude: loc.coords.longitude,
                });
                setUseLiveLocation(true);
                Alert.alert('Live Location Enabled', 'Your current GPS location is now visible to clients.');
            } else {
                // Turning OFF — revert to default business location
                await vendorAPI.updateLocation(user.uid, {
                    useLiveLocation: false,
                });
                setUseLiveLocation(false);
                Alert.alert('Business Location Restored', 'Your default business address is now shown to clients.');
            }
        } catch (error) {
            console.error('Toggle location error:', error);
            Alert.alert('Error', 'Failed to update location.');
        } finally {
            setLocationToggling(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchVendorProfile();
            fetchVendorPosts();
            fetchMenuDocuments();
        }, [user])
    );

    const fetchVendorProfile = async () => {
        if (!user) return;
        try {
            const response = await vendorAPI.getById(user.uid);
            const vendor = response.data?.vendor;

            if (vendor) {
                setBusinessName(vendor.businessName || '');
                setCategory(vendor.category || '');
                setDescription(vendor.description || '');
                setAddress(vendor.address || '');
                setServices(vendor.services || '');
                setBusinessImage(vendor.businessImage || '');
                setBannerImage(vendor.bannerImage || '');
                setVerificationStatus(vendor.verificationStatus || 'approved');
                const verifiedFlag = Boolean(
                    vendor.isVerified ??
                    vendor.is_verified ??
                    vendor.userInfo?.isVerified ??
                    (userRole === 'admin')
                );
                setIsVerified(verifiedFlag);
                setBusinessHours(vendor.businessHours || DEFAULT_BUSINESS_HOURS);
            }
        } catch (error) {
            console.log('Vendor profile fetch fallback for admin preview:', error);
            setBusinessName(user.displayName || 'QIIRA Store (Preview)');
            setCategory('Technology & Electronics');
            setDescription('Official QIIRA Administrator Storefront Preview');
            setAddress('Kano, Nigeria');
            setServices('Platform Operations, Verified Services');
            setIsVerified(userRole === 'admin');
        } finally {
            setLoading(false);
        }
    };

    const fetchVendorPosts = useCallback(async () => {
        if (!user) return;
        setPostsLoading(true);
        try {
            const response = await postAPI.getVendorPosts(user.uid);
            setPosts(response.data.posts || []);
        } catch (error) {
            console.error('Error fetching vendor posts:', error);
        } finally {
            setPostsLoading(false);
        }
    }, [user]);

    useFocusEffect(
        useCallback(() => {
            fetchVendorProfile();
            if (activeTab === 'posts') {
                fetchVendorPosts();
            }
        }, [activeTab, fetchVendorPosts])
    );

    useEffect(() => {
        if (activeTab === 'posts') {
            fetchVendorPosts();
        }
    }, [activeTab]);

    const handleOpenComments = async (post: any) => {
        setActivePostForComments(post);
        setCommentsModalVisible(true);
        setLoadingComments(true);
        try {
            const response = await postAPI.getComments(post.id);
            setComments(response.data.comments || []);
        } catch (error) {
            console.error('Fetch comments error:', error);
        } finally {
            setLoadingComments(false);
        }
    };

    const handleAddComment = async () => {
        if (!newCommentText.trim() || !activePostForComments || !user) return;
        setSubmittingComment(true);
        try {
            const response = await postAPI.addComment(activePostForComments.id, {
                userId: user.uid,
                userName: businessName || user.displayName || 'Vendor',
                userAvatar: businessImage || '',
                text: newCommentText.trim(),
            });

            setComments((prev) => [...prev, response.data.comment]);
            setNewCommentText('');

            // Increment comments count on local post
            setPosts((prev) =>
                prev.map((p) =>
                    p.id === activePostForComments.id
                        ? { ...p, commentsCount: (p.commentsCount || 0) + 1 }
                        : p
                )
            );
        } catch (error) {
            console.error('Add comment error:', error);
            Alert.alert('Error', 'Failed to post comment');
        } finally {
            setSubmittingComment(false);
        }
    };

    const handleDeletePost = async (postId: string) => {
        if (!user) return;

        const performDelete = async () => {
            try {
                await postAPI.deletePost(postId, { userId: user.uid, role: 'vendor' });
                setPosts((prev) => prev.filter((p) => p.id !== postId));
                Alert.alert('Deleted', 'Post deleted successfully');
            } catch (error: any) {
                console.error('Delete post error:', error);
                const msg = error.response?.data?.error || error.message || 'Failed to delete post';
                Alert.alert('Error', msg);
            }
        };

        Alert.alert(
            'Delete Post',
            'Are you sure you want to permanently delete this post? This action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: performDelete },
            ]
        );
    };

    const handlePickImage = async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permissionResult.granted) {
            Alert.alert('Permission Required', 'Please grant permission to access your photos');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1], // Profile is square
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            setBusinessImage(result.assets[0].uri);
        }
    };

    const handlePickBanner = async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permissionResult.granted) {
            Alert.alert('Permission Required', 'Please grant permission to access your photos');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [3, 1], // Banner usually wider
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            setBannerImage(result.assets[0].uri);
        }
    };

    const handlePickDocument = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'image/*'],
                copyToCacheDirectory: true,
            });
            
            if (!result.canceled && result.assets.length > 0) {
                setDocuments([...documents, result.assets[0]]);
            }
        } catch (err) {
            console.error('Error picking document:', err);
        }
    };

    const handlePayment = () => {
        Alert.alert('Payment Integration', 'This would integrate with Paystack/Stripe to process the verification fee.');
    };

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            let imageUrl = businessImage;
            let bannerUrl = bannerImage;

            // Helper: Convert Base64 to Uint8Array (Bypassing Blob/Fetch entirely)
            const base64ToUint8Array = (base64: string): Uint8Array => {
                const raw = atob(base64);
                const uint8Array = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) {
                    uint8Array[i] = raw.charCodeAt(i);
                }
                return uint8Array;
            };

            // Polyfill atob if needed (for RN environment)
            const atob = (input: string) => {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
                let str = input.replace(/=+$/, '');
                let output = '';
                if (str.length % 4 == 1) {
                    throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
                }
                for (let bc = 0, bs = 0, buffer, i = 0;
                    buffer = str.charAt(i++);
                    ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
                        bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0
                ) {
                    buffer = chars.indexOf(buffer);
                }
                return output;
            }

            const uploadBase64Directly = async (uri: string, filename: string): Promise<string> => {
                console.log('[Upload] Reading file as Base64:', uri.substring(0, 50) + '...');
                const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
                console.log('[Upload] Base64 read. Length:', base64.length);

                console.log('[Upload] Converting to Uint8Array...');
                const bytes = base64ToUint8Array(base64);
                console.log('[Upload] Converted. Byte Length:', bytes.length);

                const storageRef = ref(storage, filename);
                console.log('[Upload] Starting uploadBytesResumable...');
                const uploadTask = uploadBytesResumable(storageRef, bytes, { contentType: 'image/jpeg' });

                return new Promise((resolve, reject) => {
                    uploadTask.on('state_changed',
                        (snapshot) => console.log('[Upload] Progress:', snapshot.bytesTransferred, '/', snapshot.totalBytes),
                        (error) => {
                            console.error('[Upload] Resumable Error:', error);
                            reject(error);
                        },
                        async () => {
                            console.log('[Upload] Upload Complete!');
                            const url = await getDownloadURL(storageRef);
                            resolve(url);
                        }
                    );
                });
            }

            // Upload Business Image if changed (local URI or data URI)
            if (businessImage && !businessImage.startsWith('http')) {
                try {
                    imageUrl = await uploadImageViaBackend(businessImage, 'profile', user.uid);
                    console.log('[Upload] Got URL:', imageUrl);
                } catch (e) {
                    console.log('[Upload] Error uploading business image:', e);
                }
            }

            // Upload Banner Image if changed
            if (bannerImage && !bannerImage.startsWith('http')) {
                try {
                    bannerUrl = await uploadImageViaBackend(bannerImage, 'banner', user.uid);
                    console.log('[Upload] Got URL:', bannerUrl);
                } catch (e) {
                    console.log('[Upload] Error uploading banner image:', e);
                }
            }

            await vendorAPI.updateProfile(user.uid, {
                businessName,
                category,
                description,
                address,
                services,
                businessImage: imageUrl,
                bannerImage: bannerUrl,
                businessHours,
            });

            // Update local state to prevent re-upload
            if (imageUrl !== businessImage) setBusinessImage(imageUrl);
            if (bannerUrl !== bannerImage) setBannerImage(bannerUrl);

            Alert.alert('Success', 'Profile updated successfully');
            setIsEditing(false); // Switch back to View Mode
        } catch (error) {
            console.error('Error updating profile:', error);
            // Log more details if it's a Firebase Error
            if ((error as any).code) {
                console.error('Firebase Error Code:', (error as any).code);
                console.error('Firebase Error Message:', (error as any).message);
            }
            Alert.alert('Error', 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    const renderAvatar = () => {
        if (businessImage) {
            return <Image source={{ uri: businessImage }} style={styles.avatarImage} />;
        }
        return <Image source={PLACEHOLDER_AVATARS.vendor} style={styles.avatarImage} />;
    };

    const renderBanner = () => {
        if (bannerImage) {
            return <Image source={{ uri: bannerImage }} style={styles.banner} />;
        }
        return (
            <LinearGradient
                colors={[colors.primary, colors.primaryLight]}
                style={styles.banner}
            />
        );
    }

    // --- VIEW MODE ---
    if (!isEditing) {
        return (
            <View style={styles.container}>
                {/* Custom Header */}
                <View style={styles.customHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.customHeaderTitle}>{businessName || 'My Business'}</Text>
                        <VerificationBadgeInline isVerified={isVerified} isAdmin={userRole === 'admin'} size={18} />
                    </View>
                </View>
                <ScrollView contentContainerStyle={styles.viewContent} showsVerticalScrollIndicator={false}>
                    {/* Banner */}
                    <View style={styles.bannerContainer}>
                        {renderBanner()}
                        {/* Verification Badge Overlay */}
                        <View style={[
                            styles.verificationBadge,
                            (isVerified || verificationStatus === 'approved') ? styles.statusApproved :
                                verificationStatus === 'rejected' ? styles.statusRejected : styles.statusPending
                        ]}>
                            <Text style={styles.statusText}>{(isVerified || verificationStatus === 'approved') ? 'VERIFIED' : verificationStatus.toUpperCase()}</Text>
                        </View>
                    </View>

                    {/* Profile Header */}
                    <View style={styles.profileHeader}>
                        {/* Avatar with Golden Badge */}
                        <View style={styles.avatarContainer}>
                            {renderAvatar()}
                            <AvatarVerificationBadge isVerified={Boolean(isVerified || isAdmin)} isAdmin={isAdmin} size={24} />
                        </View>

                        {/* Action Bar */}
                        <View style={styles.actionBar}>
                            <TouchableOpacity
                                style={styles.actionButtonOutline}
                                onPress={() => shareVendorProfile({
                                    vendorId: user?.uid || '',
                                    businessName: businessName,
                                    category: category,
                                    address: address,
                                })}
                            >
                                <Ionicons name="share-social-outline" size={16} color={colors.textPrimary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionButtonOutline}
                                onPress={() => confirmAction('Logout', 'Are you sure you want to logout?', () => auth.signOut(), 'Logout')}
                            >
                                <Text style={styles.actionButtonOutlineText}>Logout</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionButtonOutline}
                                onPress={() => setPasswordModalVisible(true)}
                            >
                                <Text style={styles.actionButtonOutlineText}>🔒</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionButtonOutline}
                                onPress={toggleTheme}
                            >
                                <Text style={styles.actionButtonOutlineText}>{theme === 'dark' ? '☀️' : '🌙'}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.actionButtonSolid}
                                onPress={() => setIsEditing(true)}
                            >
                                <Text style={styles.actionButtonText}>Edit</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Info */}
                        <View style={styles.infoContainer}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={styles.businessName}>{businessName || (isAdmin ? 'System Administrator' : 'Business Name')}</Text>
                                <VerificationBadgeInline isVerified={Boolean(isVerified || isAdmin)} isAdmin={isAdmin} size={20} />
                            </View>
                            <Text style={styles.categoryText}>@{category.replace(/\s+/g, '').toLowerCase() || 'category'}</Text>

                            {address ? (
                                <Text style={styles.locationText}>📍 {address}</Text>
                            ) : null}
                        </View>

                        {/* Get Verified Card */}
                        <TouchableOpacity
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                borderColor: '#B28A45',
                                borderWidth: 1.5,
                                backgroundColor: isVerified ? '#B28A4515' : '#B28A4510',
                                borderRadius: BORDER_RADIUS.md,
                                padding: SPACING.md,
                                marginHorizontal: SPACING.md,
                                marginTop: SPACING.sm,
                                marginBottom: SPACING.xs,
                            }}
                            onPress={() => navigation.navigate('GetVerified')}
                            activeOpacity={0.8}
                        >
                            <View style={{
                                width: 38,
                                height: 38,
                                borderRadius: 19,
                                backgroundColor: '#B28A4525',
                                justifyContent: 'center',
                                alignItems: 'center',
                                marginRight: 12,
                            }}>
                                <Ionicons name="checkmark-circle" size={24} color="#B28A45" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: FONT_SIZES.md, fontWeight: 'bold', color: colors.textPrimary }}>
                                    {isVerified ? 'Verified Account ✓' : 'Get Verified ✓'}
                                </Text>
                                <Text style={{ fontSize: FONT_SIZES.xs, color: colors.textSecondary, marginTop: 2 }}>
                                    {isVerified ? 'Your golden verified badge is active' : 'Get a verified badge on your profile for ₦3,000/month'}
                                </Text>
                            </View>
                            <Text style={{ fontSize: 20, color: '#B28A45', fontWeight: 'bold' }}>›</Text>
                        </TouchableOpacity>

                        {/* Location Toggle */}
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: colors.surfaceLight,
                            marginHorizontal: SPACING.md,
                            marginTop: SPACING.sm,
                            padding: SPACING.md,
                            borderRadius: BORDER_RADIUS.md,
                            borderWidth: 1,
                            borderColor: colors.border,
                        }}>
                            <View style={{ flex: 1, marginRight: SPACING.sm }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Ionicons name={useLiveLocation ? 'navigate' : 'location-outline'} size={18} color={useLiveLocation ? '#34C759' : colors.textSecondary} />
                                    <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: colors.textPrimary }}>
                                        {useLiveLocation ? 'Live Location Active' : 'Business Location'}
                                    </Text>
                                </View>
                                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                                    {useLiveLocation ? 'Clients see your real-time GPS position' : 'Clients see your registered business address'}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={handleToggleLocation}
                                disabled={locationToggling}
                                style={{
                                    backgroundColor: useLiveLocation ? '#34C759' : colors.border,
                                    width: 48,
                                    height: 28,
                                    borderRadius: 14,
                                    justifyContent: 'center',
                                    paddingHorizontal: 3,
                                }}
                            >
                                {locationToggling ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <View style={{
                                        width: 22,
                                        height: 22,
                                        borderRadius: 11,
                                        backgroundColor: '#fff',
                                        alignSelf: useLiveLocation ? 'flex-end' : 'flex-start',
                                    }} />
                                )}
                            </TouchableOpacity>
                        </View>

                        {/* Tabs */}
                        <View style={styles.tabBar}>
                            {['posts', 'about', 'services', 'docs'].map((tab) => (
                                <TouchableOpacity
                                    key={tab}
                                    style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
                                    onPress={() => {
                                        setActiveTab(tab as any);
                                        if (tab === 'posts') fetchVendorPosts();
                                        if (tab === 'docs') fetchMenuDocuments();
                                    }}
                                >
                                    <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                                        {tab === 'posts' ? 'Posts' : tab === 'docs' ? '📄 Docs' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Content */}
                        <View style={styles.contentArea}>
                            {activeTab === 'about' && (
                                <Text style={styles.bodyText}>{description || 'No description provided yet.'}</Text>
                            )}
                            {activeTab === 'services' && (
                                <Text style={styles.bodyText}>{services || 'No services listed yet.'}</Text>
                            )}
                            {activeTab === 'posts' && (
                                <View>
                                    <TouchableOpacity
                                        style={{
                                            backgroundColor: colors.primary,
                                            paddingVertical: SPACING.sm,
                                            paddingHorizontal: SPACING.md,
                                            borderRadius: BORDER_RADIUS.round,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 6,
                                            marginBottom: SPACING.md,
                                        }}
                                        onPress={() => navigation.navigate('CreatePost')}
                                    >
                                        <Ionicons name="add-circle-outline" size={18} color={colors.textInverse} />
                                        <Text style={{ color: colors.textInverse, fontWeight: 'bold', fontSize: FONT_SIZES.sm }}>
                                            + Create New Post / Reel
                                        </Text>
                                    </TouchableOpacity>

                                    {postsLoading ? (
                                        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: SPACING.md }} />
                                    ) : posts.length === 0 ? (
                                        <View style={{ alignItems: 'center', paddingVertical: SPACING.lg }}>
                                            <Ionicons name="images-outline" size={36} color={colors.textTertiary} />
                                            <Text style={{ color: colors.textSecondary, marginTop: SPACING.xs, fontSize: FONT_SIZES.sm }}>
                                                You haven't posted any products or reels yet.
                                            </Text>
                                        </View>
                                    ) : (
                                        <View style={{ gap: SPACING.md }}>
                                            {posts.map((post) => (
                                                <View key={post.id} style={{ backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
                                                    <Image
                                                        source={{ uri: post.mediaUrl || post.thumbnailUrl || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400' }}
                                                        style={{ width: '100%', height: 200, resizeMode: 'cover', backgroundColor: colors.surfaceLight }}
                                                    />
                                                    <View style={{ padding: SPACING.sm }}>
                                                        <Text style={{ fontSize: FONT_SIZES.sm, color: colors.textPrimary, fontWeight: '600' }}>{post.caption}</Text>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                                                                <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                                                                    ❤️ {post.likesCount || 0}
                                                                </Text>
                                                                <TouchableOpacity
                                                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: BORDER_RADIUS.round }}
                                                                    onPress={() => handleOpenComments(post)}
                                                                >
                                                                    <Ionicons name="chatbubble-outline" size={12} color={colors.primary} />
                                                                    <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700' }}>
                                                                        {post.commentsCount || 0} Comments (View/Reply)
                                                                    </Text>
                                                                </TouchableOpacity>
                                                            </View>
                                                            {post.price !== undefined && post.price !== null && post.price !== '' && Number(post.price) > 0 ? (
                                                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.primary }}>
                                                                    ₦{Number(post.price).toLocaleString()}
                                                                </Text>
                                                            ) : null}
                                                        </View>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: SPACING.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }}>
                                                            <TouchableOpacity
                                                                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: BORDER_RADIUS.sm, backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                                                                onPress={() => handleDeletePost(post.id)}
                                                            >
                                                                <Ionicons name="trash-outline" size={14} color={colors.error} />
                                                                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.error }}>Delete Post</Text>
                                                            </TouchableOpacity>
                                                        </View>
                                                    </View>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            )}

                            {/* Docs/Menu Tab */}
                            {activeTab === 'docs' && (
                                <View>
                                    <TouchableOpacity
                                        style={{
                                            backgroundColor: colors.primary,
                                            paddingVertical: SPACING.sm,
                                            paddingHorizontal: SPACING.md,
                                            borderRadius: BORDER_RADIUS.round,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 6,
                                            marginBottom: SPACING.md,
                                        }}
                                        onPress={() => setShowAddDocForm(!showAddDocForm)}
                                    >
                                        <Ionicons name={showAddDocForm ? 'close-circle-outline' : 'add-circle-outline'} size={18} color={colors.textInverse} />
                                        <Text style={{ color: colors.textInverse, fontWeight: 'bold', fontSize: FONT_SIZES.sm }}>
                                            {showAddDocForm ? 'Cancel' : '+ Add Menu / Document'}
                                        </Text>
                                    </TouchableOpacity>

                                    {/* Add Document Form */}
                                    {showAddDocForm && (
                                        <View style={{
                                            backgroundColor: colors.surface,
                                            borderRadius: BORDER_RADIUS.md,
                                            borderWidth: 1,
                                            borderColor: colors.border,
                                            padding: SPACING.md,
                                            marginBottom: SPACING.md,
                                        }}>
                                            {/* Mode Selector Tabs */}
                                            <View style={{
                                                flexDirection: 'row',
                                                backgroundColor: colors.surfaceLight,
                                                borderRadius: BORDER_RADIUS.sm,
                                                padding: 3,
                                                marginBottom: SPACING.md,
                                            }}>
                                                <TouchableOpacity
                                                    style={{
                                                        flex: 1,
                                                        paddingVertical: 8,
                                                        alignItems: 'center',
                                                        borderRadius: 6,
                                                        backgroundColor: docSourceType === 'file' ? colors.primary : 'transparent',
                                                    }}
                                                    onPress={() => setDocSourceType('file')}
                                                >
                                                    <Text style={{
                                                        fontSize: FONT_SIZES.xs,
                                                        fontWeight: '700',
                                                        color: docSourceType === 'file' ? colors.textInverse : colors.textSecondary,
                                                    }}>
                                                        📁 Device Storage (PDF)
                                                    </Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={{
                                                        flex: 1,
                                                        paddingVertical: 8,
                                                        alignItems: 'center',
                                                        borderRadius: 6,
                                                        backgroundColor: docSourceType === 'link' ? colors.primary : 'transparent',
                                                    }}
                                                    onPress={() => setDocSourceType('link')}
                                                >
                                                    <Text style={{
                                                        fontSize: FONT_SIZES.xs,
                                                        fontWeight: '700',
                                                        color: docSourceType === 'link' ? colors.textInverse : colors.textSecondary,
                                                    }}>
                                                        🔗 PDF URL Link
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>

                                            {/* Form content depending on mode */}
                                            {docSourceType === 'file' ? (
                                                <View style={{ marginBottom: SPACING.sm }}>
                                                    <TouchableOpacity
                                                        onPress={handlePickPdfFile}
                                                        style={{
                                                            borderWidth: 1.5,
                                                            borderColor: selectedPdfFile ? colors.primary : colors.border,
                                                            borderStyle: selectedPdfFile ? 'solid' : 'dashed',
                                                            borderRadius: BORDER_RADIUS.md,
                                                            backgroundColor: selectedPdfFile ? `${colors.primary}10` : colors.surfaceLight,
                                                            padding: SPACING.md,
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            marginBottom: SPACING.sm,
                                                        }}
                                                    >
                                                        <Ionicons
                                                            name={selectedPdfFile ? 'document-attach' : 'cloud-upload-outline'}
                                                            size={32}
                                                            color={selectedPdfFile ? colors.primary : colors.textTertiary}
                                                        />
                                                        <Text style={{
                                                            fontSize: FONT_SIZES.sm,
                                                            fontWeight: '700',
                                                            color: selectedPdfFile ? colors.primary : colors.textPrimary,
                                                            marginTop: 6,
                                                            textAlign: 'center',
                                                        }}>
                                                            {selectedPdfFile ? selectedPdfFile.name : 'Choose PDF from Local Storage'}
                                                        </Text>
                                                        {selectedPdfFile && selectedPdfFile.size ? (
                                                            <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                                                                {(selectedPdfFile.size / (1024 * 1024)).toFixed(2)} MB
                                                            </Text>
                                                        ) : (
                                                            <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                                                                Tap to browse documents (.pdf)
                                                            </Text>
                                                        )}
                                                    </TouchableOpacity>
                                                </View>
                                            ) : (
                                                <View style={{ marginBottom: SPACING.sm }}>
                                                    <Text style={{ fontSize: FONT_SIZES.xs, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 }}>PDF Direct Link (URL)</Text>
                                                    <TextInput
                                                        style={{
                                                            backgroundColor: colors.surfaceLight,
                                                            borderWidth: 1,
                                                            borderColor: colors.border,
                                                            borderRadius: BORDER_RADIUS.sm,
                                                            padding: SPACING.sm,
                                                            fontSize: FONT_SIZES.sm,
                                                            color: colors.textPrimary,
                                                            marginBottom: SPACING.xs,
                                                        }}
                                                        placeholder="https://example.com/menu.pdf"
                                                        placeholderTextColor={colors.textTertiary}
                                                        value={newDocUrl}
                                                        onChangeText={setNewDocUrl}
                                                        autoCapitalize="none"
                                                    />
                                                </View>
                                            )}

                                            <Text style={{ fontSize: FONT_SIZES.xs, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 }}>Document Display Title</Text>
                                            <TextInput
                                                style={{
                                                    backgroundColor: colors.surfaceLight,
                                                    borderWidth: 1,
                                                    borderColor: colors.border,
                                                    borderRadius: BORDER_RADIUS.sm,
                                                    padding: SPACING.sm,
                                                    fontSize: FONT_SIZES.sm,
                                                    color: colors.textPrimary,
                                                    marginBottom: SPACING.md,
                                                }}
                                                placeholder="e.g. Lunch & Dinner Menu, Price List"
                                                placeholderTextColor={colors.textTertiary}
                                                value={newDocTitle}
                                                onChangeText={setNewDocTitle}
                                            />

                                            <TouchableOpacity
                                                style={{
                                                    backgroundColor: colors.primary,
                                                    paddingVertical: SPACING.sm,
                                                    borderRadius: BORDER_RADIUS.md,
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexDirection: 'row',
                                                    gap: 6,
                                                    opacity: uploadingDoc ? 0.7 : 1,
                                                }}
                                                onPress={handleAddMenuDocument}
                                                disabled={uploadingDoc}
                                            >
                                                {uploadingDoc ? (
                                                    <ActivityIndicator size="small" color={colors.textInverse} />
                                                ) : (
                                                    <>
                                                        <Ionicons name="checkmark-circle-outline" size={18} color={colors.textInverse} />
                                                        <Text style={{ color: colors.textInverse, fontWeight: 'bold', fontSize: FONT_SIZES.sm }}>
                                                            {docSourceType === 'file' ? 'Upload & Save PDF' : 'Save Document Link'}
                                                        </Text>
                                                    </>
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {/* Document List */}
                                    {menuDocsLoading ? (
                                        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: SPACING.md }} />
                                    ) : menuDocuments.length === 0 ? (
                                        <View style={{ alignItems: 'center', paddingVertical: SPACING.lg }}>
                                            <Ionicons name="document-text-outline" size={36} color={colors.textTertiary} />
                                            <Text style={{ color: colors.textSecondary, marginTop: SPACING.xs, fontSize: FONT_SIZES.sm, textAlign: 'center' }}>
                                                No menus or documents uploaded yet.{"\n"}Upload PDFs from device storage or add web links.
                                            </Text>
                                        </View>
                                    ) : (
                                        <View style={{ gap: SPACING.sm }}>
                                            {menuDocuments.map((doc: any) => (
                                                <TouchableOpacity
                                                    key={doc.id}
                                                    activeOpacity={0.7}
                                                    onPress={() => {
                                                        if (doc.url) {
                                                            Linking.openURL(doc.url).catch(() => {
                                                                Alert.alert('Unable to Open', 'Could not open PDF file.');
                                                            });
                                                        }
                                                    }}
                                                    style={{
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        backgroundColor: colors.surface,
                                                        borderWidth: 1,
                                                        borderColor: colors.border,
                                                        borderRadius: BORDER_RADIUS.md,
                                                        padding: SPACING.sm,
                                                    }}
                                                >
                                                    <View style={{
                                                        width: 42,
                                                        height: 42,
                                                        borderRadius: 8,
                                                        backgroundColor: '#FF3B5C18',
                                                        justifyContent: 'center',
                                                        alignItems: 'center',
                                                        marginRight: SPACING.sm,
                                                    }}>
                                                        <Ionicons name="document-text" size={24} color="#FF3B5C" />
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{doc.title}</Text>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                                            <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '600' }}>PDF DOCUMENT</Text>
                                                            {doc.fileSize ? (
                                                                <Text style={{ fontSize: 10, color: colors.textTertiary }}>
                                                                    • {(doc.fileSize / (1024 * 1024)).toFixed(2)} MB
                                                                </Text>
                                                            ) : null}
                                                            <Text style={{ fontSize: 10, color: colors.textTertiary }}>
                                                                • {new Date(doc.uploadedAt).toLocaleDateString()}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                    <TouchableOpacity
                                                        onPress={(e) => {
                                                            e.stopPropagation?.();
                                                            confirmAction('Delete Document', 'Are you sure you want to remove this PDF document?', () => handleRemoveMenuDocument(doc.id), 'Delete');
                                                        }}
                                                        style={{ padding: 8 }}
                                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                    >
                                                        <Ionicons name="trash-outline" size={18} color={colors.error} />
                                                    </TouchableOpacity>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>
                    </View>
                </ScrollView>

                {/* Change Password Modal */}
                <ChangePasswordModal
                    visible={passwordModalVisible}
                    onClose={() => setPasswordModalVisible(false)}
                />

                {/* Comments Modal for Vendor / Admin */}
                <Modal
                    visible={commentsModalVisible}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => setCommentsModalVisible(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            {/* Modal Header */}
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Post Comments 💬</Text>
                                <TouchableOpacity onPress={() => setCommentsModalVisible(false)}>
                                    <Ionicons name="close" size={24} color={colors.textPrimary} />
                                </TouchableOpacity>
                            </View>

                            {/* Comments List */}
                            {loadingComments ? (
                                <View style={styles.commentsLoading}>
                                    <ActivityIndicator size="small" color={colors.primary} />
                                </View>
                            ) : comments.length === 0 ? (
                                <View style={styles.noCommentsContainer}>
                                    <Text style={styles.noCommentsText}>No comments on this post yet.</Text>
                                </View>
                            ) : (
                                <FlatList
                                    data={comments}
                                    keyExtractor={(item) => item.id}
                                    style={styles.commentsList}
                                    renderItem={({ item }) => (
                                        <View style={styles.commentItem}>
                                            <Image
                                                source={{
                                                    uri: item.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
                                                }}
                                                style={styles.commentAvatar}
                                            />
                                            <View style={styles.commentTextContainer}>
                                                <Text style={styles.commentUserName}>{item.userName}</Text>
                                                <Text style={styles.commentBody}>{item.text}</Text>
                                            </View>
                                        </View>
                                    )}
                                />
                            )}

                            {/* Comment Input */}
                            <View style={styles.commentInputRow}>
                                <TextInput
                                    style={styles.commentTextInput}
                                    placeholder="Write a reply or comment..."
                                    placeholderTextColor={colors.textTertiary}
                                    value={newCommentText}
                                    onChangeText={setNewCommentText}
                                />
                                <TouchableOpacity
                                    style={[
                                        styles.sendCommentButton,
                                        !newCommentText.trim() && { opacity: 0.5 },
                                    ]}
                                    onPress={handleAddComment}
                                    disabled={!newCommentText.trim() || submittingComment}
                                >
                                    {submittingComment ? (
                                        <ActivityIndicator size="small" color={colors.primary} />
                                    ) : (
                                        <Ionicons name="send" size={20} color={colors.primary} />
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </View>
        );
    }

    // --- EDIT MODE ---
    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            {/* Edit Header */}
            <View style={styles.editHeader}>
                <TouchableOpacity onPress={() => setIsEditing(false)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.editTitle}>Edit Profile</Text>
                <TouchableOpacity onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.saveText}>Save</Text>}
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.editContent}>

                {/* Banner Editor */}
                <TouchableOpacity style={styles.editBannerContainer} onPress={handlePickBanner}>
                    {bannerImage ? (
                        <Image source={{ uri: bannerImage }} style={styles.banner} />
                    ) : (
                        <View style={[styles.banner, { backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center' }]}>
                            <Text style={{ color: colors.textSecondary }}>Tap to add Cover Photo</Text>
                        </View>
                    )}
                    <View style={styles.editBannerOverlay}>
                        <Text style={styles.editIcon}>📷</Text>
                    </View>
                </TouchableOpacity>

                {/* Avatar Editor (Overlapping) */}
                <View style={styles.editAvatarContainerWrapper}>
                    <TouchableOpacity style={styles.editAvatarContainer} onPress={handlePickImage}>
                        {businessImage ? (
                            <Image source={{ uri: businessImage }} style={styles.editImage} />
                        ) : (
                            <View style={styles.editImagePlaceholder}>
                                <Text>+</Text>
                            </View>
                        )}
                        <View style={styles.cameraIcon}>
                            <Text style={{ fontSize: 12 }}>📷</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                <View style={[styles.inputGroup, { marginTop: SPACING.xl }]}>
                    <Text style={styles.label}>Name</Text>
                    <TextInput
                        style={styles.input}
                        value={businessName}
                        onChangeText={setBusinessName}
                        placeholder="Business Name"
                    />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Category</Text>
                    <TouchableOpacity
                        style={styles.selectButton}
                        onPress={() => setShowCategoryPicker(true)}
                    >
                        <Text style={category ? styles.selectText : styles.selectPlaceholder}>
                            {category || 'Select a category'}
                        </Text>
                        <Text style={styles.selectArrow}>▼</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Location</Text>
                    <TextInput
                        style={styles.input}
                        value={address}
                        onChangeText={setAddress}
                        placeholder="Address"
                    />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Bio</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        value={description}
                        onChangeText={setDescription}
                        placeholder="Business Description"
                        multiline
                        numberOfLines={4}
                    />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Services</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        value={services}
                        onChangeText={setServices}
                        placeholder="Services Offered"
                        multiline
                        numberOfLines={3}
                    />
                </View>

                {/* Business Hours Editor */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>🕐 Business Hours</Text>
                    <View style={styles.hoursEditorContainer}>
                        {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).map((day) => (
                            <View key={day} style={styles.hoursEditorRow}>
                                <Text style={styles.dayLabelEdit}>{DAY_LABELS[day]}</Text>
                                <View style={styles.hoursInputs}>
                                    {businessHours[day]?.closed ? (
                                        <Text style={styles.closedLabel}>Closed</Text>
                                    ) : (
                                        <>
                                            <TextInput
                                                style={styles.timeInput}
                                                value={businessHours[day]?.open || '09:00'}
                                                onChangeText={(text) => setBusinessHours({
                                                    ...businessHours,
                                                    [day]: { ...businessHours[day], open: text }
                                                })}
                                                placeholder="09:00"
                                            />
                                            <Text style={styles.timeSeparator}>-</Text>
                                            <TextInput
                                                style={styles.timeInput}
                                                value={businessHours[day]?.close || '17:00'}
                                                onChangeText={(text) => setBusinessHours({
                                                    ...businessHours,
                                                    [day]: { ...businessHours[day], close: text }
                                                })}
                                                placeholder="17:00"
                                            />
                                        </>
                                    )}
                                    <TouchableOpacity
                                        style={[styles.closedToggle, businessHours[day]?.closed && styles.closedToggleActive]}
                                        onPress={() => setBusinessHours({
                                            ...businessHours,
                                            [day]: { ...businessHours[day], closed: !businessHours[day]?.closed }
                                        })}
                                    >
                                        <Text style={styles.closedToggleText}>
                                            {businessHours[day]?.closed ? 'Open' : 'Close'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Documents & Verification */}
                <View style={[styles.inputGroup, { marginTop: SPACING.md }]}>
                    <Text style={styles.label}>📄 Verification Documents</Text>
                    <Text style={styles.helperText}>Upload your Business License, ID, or other relevant documents to get verified.</Text>
                    
                    {documents.map((doc, index) => (
                        <View key={index} style={styles.documentItem}>
                            <Text style={styles.documentName} numberOfLines={1}>{doc.name}</Text>
                            <TouchableOpacity onPress={() => setDocuments(documents.filter((_, i) => i !== index))}>
                                <Text style={styles.removeDocumentText}>✕</Text>
                            </TouchableOpacity>
                        </View>
                    ))}

                    <TouchableOpacity style={styles.uploadButton} onPress={handlePickDocument}>
                        <Text style={styles.uploadButtonText}>+ Upload Document</Text>
                    </TouchableOpacity>
                </View>

                {/* Verification Payment */}
                {verificationStatus !== 'approved' && (
                    <View style={[styles.inputGroup, { marginBottom: SPACING.xl * 2 }]}>
                        <Text style={styles.label}>💳 Verification Fee</Text>
                        <View style={styles.paymentContainer}>
                            <Text style={styles.paymentText}>A one-time verification fee is required to verify your business and boost your visibility.</Text>
                            <TouchableOpacity style={styles.paymentButton} onPress={handlePayment}>
                                <Text style={styles.paymentButtonText}>Pay Verification Fee</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
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
                                        category === item && styles.categoryItemSelected
                                    ]}
                                    onPress={() => {
                                        setCategory(item);
                                        setShowCategoryPicker(false);
                                    }}
                                >
                                    <Text style={[
                                        styles.categoryItemText,
                                        category === item && styles.categoryItemTextSelected
                                    ]}>
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

const getStyles = (colors: any) => {
    const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : (Platform.OS === 'web' ? 0 : 48);
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        loadingContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
        customHeader: {
            backgroundColor: colors.primary,
            paddingTop: statusBarHeight + SPACING.xs,
            paddingBottom: SPACING.md,
            paddingHorizontal: SPACING.lg,
        },
        customHeaderTitle: {
            fontSize: FONT_SIZES.xl,
            fontWeight: 'bold',
            color: colors.textInverse,
        },
    // --- View Mode Styles ---
    viewContent: {
        paddingBottom: 50,
    },
    bannerContainer: {
        height: X_THEME.bannerHeight,
        width: '100%',
    },
    banner: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    verificationBadge: {
        position: 'absolute',
        top: 40,
        right: 20,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    statusPending: { backgroundColor: colors.warning },
    statusApproved: { backgroundColor: colors.success },
    statusRejected: { backgroundColor: colors.error },
    statusText: { color: colors.textInverse, fontWeight: 'bold', fontSize: 10 },

    profileHeader: {
        paddingHorizontal: SPACING.md,
    },
    avatarContainer: {
        marginTop: -(X_THEME.avatarSize / 2),
        marginBottom: SPACING.sm,
        borderWidth: 4,
        borderColor: colors.background,
        borderRadius: X_THEME.avatarSize / 2,
        width: X_THEME.avatarSize,
        height: X_THEME.avatarSize,
        position: 'relative',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
        borderRadius: (X_THEME.avatarSize / 2) - 4,
        resizeMode: 'cover',
    },
    avatarPlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 32,
        fontWeight: 'bold',
        color: colors.primary,
    },
    actionBar: {
        position: 'absolute',
        top: SPACING.xs,
        right: SPACING.md,
        flexDirection: 'row',
        gap: SPACING.sm,
    },
    actionButtonSolid: {
        backgroundColor: colors.textPrimary, // Black
        paddingHorizontal: SPACING.md,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.round,
        borderWidth: 1,
        borderColor: colors.textPrimary,
    },
    actionButtonText: {
        color: colors.textInverse,
        fontWeight: 'bold',
        fontSize: FONT_SIZES.sm,
    },
    actionButtonOutline: {
        paddingHorizontal: SPACING.md,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.round,
        borderWidth: 1,
        borderColor: colors.border,
    },
    actionButtonOutlineText: {
        color: colors.textPrimary,
        fontWeight: 'bold',
        fontSize: FONT_SIZES.sm,
    },
    infoContainer: {
        marginTop: SPACING.xs,
        marginBottom: SPACING.lg,
    },
    businessName: {
        fontSize: FONT_SIZES.xl,
        fontWeight: '900',
        color: colors.textPrimary,
        marginBottom: 2,
    },
    categoryText: {
        fontSize: FONT_SIZES.md,
        color: colors.textSecondary,
        marginBottom: 4,
    },
    locationText: {
        fontSize: FONT_SIZES.sm,
        color: colors.textSecondary,
    },
    tabBar: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        marginBottom: SPACING.md,
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: SPACING.md,
        borderBottomWidth: 3,
        borderBottomColor: 'transparent',
    },
    tabItemActive: {
        borderBottomColor: colors.primary,
    },
    tabText: {
        fontWeight: '600',
        color: colors.textSecondary,
    },
    tabTextActive: {
        color: colors.primary,
        fontWeight: 'bold',
    },
    contentArea: {
        minHeight: 200,
    },
    bodyText: {
        fontSize: FONT_SIZES.md,
        color: colors.textPrimary,
        lineHeight: 22,
    },

    // --- Edit Mode Styles ---
    editHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: SPACING.lg,
        paddingTop: statusBarHeight + SPACING.xs,
        paddingBottom: SPACING.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface,
    },
    editTitle: {
        fontWeight: 'bold',
        fontSize: FONT_SIZES.lg,
    },
    cancelText: {
        color: colors.textPrimary,
        fontSize: FONT_SIZES.md,
    },
    saveText: {
        color: colors.primary,
        fontWeight: 'bold',
        fontSize: FONT_SIZES.md,
    },
    editContent: {
        // padding: SPACING.lg, // Removed padding to let banner be full width
    },
    editBannerContainer: {
        height: 120, // Smaller than view mode banner
        width: '100%',
        backgroundColor: colors.surface,
        marginBottom: 20,
    },
    editBannerOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    editIcon: {
        color: 'white',
        fontSize: 24,
    },
    editAvatarContainerWrapper: {
        paddingHorizontal: SPACING.lg,
        marginTop: -60, // Overlap banner
    },
    editAvatarContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 3,
        borderColor: colors.background,
        backgroundColor: colors.surfaceLight,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    editImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    editImagePlaceholder: {
        alignItems: 'center',
    },
    cameraIcon: {
        position: 'absolute',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 4,
        borderRadius: 20,
    },
    inputGroup: {
        marginBottom: SPACING.lg,
        paddingHorizontal: SPACING.lg,
    },
    label: {
        fontWeight: 'bold',
        color: colors.textSecondary,
        marginBottom: SPACING.xs,
        fontSize: FONT_SIZES.sm,
    },
    input: {
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: 8,
        fontSize: FONT_SIZES.md,
        color: colors.textPrimary,
    },
    textArea: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
    // Business Hours Editor Styles
    hoursEditorContainer: {
        backgroundColor: colors.surfaceLight,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.sm,
    },
    hoursEditorRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: SPACING.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    dayLabelEdit: {
        width: 70,
        fontSize: FONT_SIZES.sm,
        color: colors.textSecondary,
    },
    hoursInputs: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        justifyContent: 'flex-end',
        gap: SPACING.xs,
    },
    timeInput: {
        width: 55,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BORDER_RADIUS.sm,
        padding: SPACING.xs,
        fontSize: FONT_SIZES.sm,
        textAlign: 'center',
        backgroundColor: colors.surface,
    },
    timeSeparator: {
        fontSize: FONT_SIZES.sm,
        color: colors.textSecondary,
    },
    closedLabel: {
        color: colors.error,
        fontSize: FONT_SIZES.sm,
        fontStyle: 'italic',
        flex: 1,
        textAlign: 'center',
    },
    closedToggle: {
        paddingHorizontal: SPACING.sm,
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.sm,
        borderWidth: 1,
        borderColor: colors.border,
        marginLeft: SPACING.xs,
    },
    closedToggleActive: {
        backgroundColor: colors.success,
        borderColor: colors.success,
    },
    closedToggleText: {
        fontSize: FONT_SIZES.xs,
        color: colors.textSecondary,
    },
    // Category picker styles
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
    categoryItemText: {
        fontSize: FONT_SIZES.md,
        color: colors.textPrimary,
    },
    categoryItemTextSelected: {
        color: colors.textInverse,
        fontWeight: '600',
    },
    helperText: {
        fontSize: FONT_SIZES.xs,
        color: colors.textSecondary,
        marginBottom: SPACING.sm,
    },
    documentItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: colors.surfaceLight,
        padding: SPACING.sm,
        borderRadius: BORDER_RADIUS.sm,
        marginBottom: SPACING.xs,
        borderWidth: 1,
        borderColor: colors.border,
    },
    documentName: {
        flex: 1,
        fontSize: FONT_SIZES.sm,
        color: colors.textPrimary,
        marginRight: SPACING.sm,
    },
    removeDocumentText: {
        color: colors.error,
        fontWeight: 'bold',
        padding: SPACING.xs,
    },
    uploadButton: {
        borderWidth: 1,
        borderColor: colors.primary,
        borderStyle: 'dashed',
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        alignItems: 'center',
        marginTop: SPACING.xs,
    },
    uploadButtonText: {
        color: colors.primary,
        fontWeight: '600',
    },
    paymentContainer: {
        backgroundColor: colors.surfaceLight,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    paymentText: {
        fontSize: FONT_SIZES.sm,
        color: colors.textSecondary,
        marginBottom: SPACING.md,
        lineHeight: 20,
    },
    paymentButton: {
        backgroundColor: colors.primary,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        alignItems: 'center',
    },
    paymentButtonText: {
        color: colors.textInverse,
        fontWeight: 'bold',
        fontSize: FONT_SIZES.md,
    },
    commentsLoading: {
        padding: SPACING.xl,
        alignItems: 'center',
    },
    noCommentsContainer: {
        padding: SPACING.xl,
        alignItems: 'center',
    },
    noCommentsText: {
        color: colors.textSecondary,
        fontSize: FONT_SIZES.sm,
    },
    commentsList: {
        padding: SPACING.md,
        maxHeight: 350,
    },
    commentItem: {
        flexDirection: 'row',
        marginBottom: SPACING.md,
        gap: SPACING.sm,
    },
    commentAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.surfaceLight,
    },
    commentTextContainer: {
        flex: 1,
        backgroundColor: colors.surfaceLight,
        padding: SPACING.sm,
        borderRadius: BORDER_RADIUS.md,
    },
    commentUserName: {
        fontSize: FONT_SIZES.xs,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 2,
    },
    commentBody: {
        fontSize: FONT_SIZES.sm,
        color: colors.textPrimary,
        lineHeight: 18,
    },
    commentInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.md,
        paddingTop: SPACING.sm,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        gap: SPACING.sm,
    },
    commentTextInput: {
        flex: 1,
        backgroundColor: colors.surfaceLight,
        borderRadius: BORDER_RADIUS.round,
        paddingHorizontal: SPACING.md,
        paddingVertical: 8,
        fontSize: FONT_SIZES.sm,
        color: colors.textPrimary,
    },
    sendCommentButton: {
        padding: SPACING.xs,
    },
});
};
