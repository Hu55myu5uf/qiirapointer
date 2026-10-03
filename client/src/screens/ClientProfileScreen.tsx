import React, { useState, useEffect, useCallback } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    Image,
    Switch,
    Platform,
    StatusBar,
} from 'react-native';
import { confirmAction } from '../utils/alert';
import { authAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { auth } from '../config/firebase';
import { updateProfile } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import { PLACEHOLDER_AVATARS } from '../assets';
import { useTheme } from '../context/ThemeContext';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { uploadImageViaBackend } from '../utils/backendUpload';
import { VerificationBadgeInline, AvatarVerificationBadge } from '../components/VerificationBadge';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as FileSystem from 'expo-file-system/legacy';
import TabSwipeHandler from '../components/TabSwipeHandler';

export default function ClientProfileScreen() {
    const navigation = useNavigation<any>();
    const { theme, colors, toggleTheme } = useTheme();
    const styles = getStyles(colors);

    const { user, userRole, realRole } = useAuthStore();
    const isAdmin = Boolean(realRole === 'admin' || userRole === 'admin' || user?.email === 'admin@qiira.com' || user?.uid === 'v8MwaOet0ISfZAWXIDAPAGcg1td2');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [passwordModalVisible, setPasswordModalVisible] = useState(false);

    // Profile fields
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [profileImage, setProfileImage] = useState('');
    const [isVerified, setIsVerified] = useState(false);

    useFocusEffect(
        useCallback(() => {
            fetchProfile();
        }, [user])
    );

    const fetchProfile = async () => {
        if (!user) return;
        try {
            const response = await authAPI.getUser(user.uid);
            const userData = response.data?.user;
            if (userData) {
                setFullName(userData.fullName || userData.full_name || userData.displayName || '');
                setEmail(userData.email || user.email || '');
                setPhoneNumber(userData.phoneNumber || userData.phone_number || '');
                setProfileImage(userData.profileImage || userData.profile_image || userData.photoURL || '');
                setIsVerified(Boolean(userData.isVerified ?? userData.is_verified ?? false));
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
            // Fallback to local auth store values
            setFullName(user.displayName || '');
            setEmail(user.email || '');
            setProfileImage(user.photoURL || '');
        } finally {
            setLoading(false);
        }
    };

    const handlePickImage = async () => {
        Alert.alert(
            'Profile Photo',
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
                                aspect: [1, 1],
                                quality: 0.8,
                            });
                            if (!res.canceled && res.assets[0]) {
                                setProfileImage(res.assets[0].uri);
                            }
                        } catch (e) {
                            console.error('Camera photo error:', e);
                        }
                    },
                },
                {
                    text: 'Choose from Gallery',
                    onPress: async () => {
                        try {
                            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
                            if (!permissionResult.granted) {
                                Alert.alert('Permission Required', 'Please grant permission to access your photos');
                                return;
                            }
                            const result = await ImagePicker.launchImageLibraryAsync({
                                mediaTypes: ['images'],
                                allowsEditing: true,
                                aspect: [1, 1],
                                quality: 0.8,
                            });
                            if (!result.canceled && result.assets[0]) {
                                setProfileImage(result.assets[0].uri);
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

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            let uploadedImageUrl = profileImage;
            
            // Upload image to backend if it's a local file URI, blob URI, or data URI
            if (profileImage && !profileImage.startsWith('http')) {
                try {
                    console.log('[ClientProfile] Uploading new image...');
                    uploadedImageUrl = await uploadImageViaBackend(profileImage, 'profile', user.uid);
                    console.log('[ClientProfile] Image uploaded successfully:', uploadedImageUrl);
                } catch (e) {
                    console.error('[ClientProfile] Failed to upload image:', e);
                    // Fallback to existing or empty
                    uploadedImageUrl = '';
                }
            }

            const response = await authAPI.updateProfile(user.uid, {
                fullName,
                phoneNumber,
                profileImage: uploadedImageUrl,
            });

            if (auth.currentUser) {
                try {
                    await updateProfile(auth.currentUser, {
                        displayName: fullName,
                        photoURL: uploadedImageUrl || undefined,
                    });
                } catch (_) {}
            }

            if (response?.data?.user) {
                const u = response.data.user;
                setFullName(u.fullName || u.full_name || fullName);
                setPhoneNumber(u.phoneNumber || u.phone_number || phoneNumber);
                setProfileImage(u.profileImage || u.profile_image || profileImage);
                useAuthStore.getState().setUser({
                    ...(user as any),
                    displayName: u.fullName || fullName,
                    photoURL: u.profileImage || uploadedImageUrl,
                } as any);
            }

            Alert.alert('Success', 'Profile updated successfully');
            setIsEditing(false);
        } catch (error) {
            console.error('Error updating profile:', error);
            Alert.alert('Error', 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        confirmAction('Logout', 'Are you sure you want to logout?', () => auth.signOut(), 'Logout');
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <TabSwipeHandler currentTab="Profile" navigation={navigation}>
            <View style={styles.container}>
                {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerProfile}>
                    <Image
                        source={profileImage ? { uri: profileImage } : PLACEHOLDER_AVATARS.client}
                        style={styles.headerAvatar}
                    />
                    <View style={styles.headerTextContainer}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={styles.headerTitle} numberOfLines={1}>
                                {fullName || 'My Profile'}
                            </Text>
                            <VerificationBadgeInline isVerified={Boolean(isVerified || isAdmin)} isAdmin={isAdmin} size={18} />
                        </View>
                        <Text style={styles.headerSubtitle}>{isAdmin ? 'System Administrator' : 'Client Profile'}</Text>
                    </View>
                </View>

                {!isEditing ? (
                    <TouchableOpacity onPress={() => setIsEditing(true)}>
                        <Text style={styles.headerAction}>Edit</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity onPress={() => setIsEditing(false)}>
                        <Text style={styles.headerAction}>Cancel</Text>
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Profile Image with Avatar Verification Badge */}
                <TouchableOpacity
                    style={styles.avatarContainer}
                    onPress={isEditing ? handlePickImage : undefined}
                    disabled={!isEditing}
                >
                    <Image
                        source={profileImage ? { uri: profileImage } : PLACEHOLDER_AVATARS.client}
                        style={styles.avatar}
                    />
                    <AvatarVerificationBadge isVerified={Boolean(isVerified || isAdmin)} isAdmin={isAdmin} size={26} />
                    {isEditing && (
                        <View style={styles.editBadge}>
                            <Text style={styles.editBadgeText}>📷</Text>
                        </View>
                    )}
                </TouchableOpacity>

                {/* Profile Card */}
                <View style={styles.card}>
                    {/* Name */}
                    <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Full Name</Text>
                        {isEditing ? (
                            <TextInput
                                style={styles.input}
                                value={fullName}
                                onChangeText={setFullName}
                                placeholder="Enter your name"
                                placeholderTextColor={colors.textTertiary}
                            />
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={styles.value}>{fullName || 'Not set'}</Text>
                                <VerificationBadgeInline isVerified={Boolean(isVerified || isAdmin)} isAdmin={isAdmin} size={18} />
                            </View>
                        )}
                    </View>

                    {/* Email (read-only) */}
                    <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Email</Text>
                        <Text style={styles.value}>{email}</Text>
                    </View>

                    {/* Phone */}
                    <View style={styles.fieldContainer}>
                        <Text style={styles.label}>Phone Number</Text>
                        {isEditing ? (
                            <TextInput
                                style={styles.input}
                                value={phoneNumber}
                                onChangeText={setPhoneNumber}
                                placeholder="Enter phone number"
                                placeholderTextColor={colors.textTertiary}
                                keyboardType="phone-pad"
                            />
                        ) : (
                            <Text style={styles.value}>{phoneNumber || 'Not set'}</Text>
                        )}
                    </View>

                    {/* Save Button (when editing) */}
                    {isEditing && (
                        <TouchableOpacity
                            style={styles.saveButton}
                            onPress={handleSave}
                            disabled={saving}
                        >
                            {saving ? (
                                <ActivityIndicator color={colors.textInverse} />
                            ) : (
                                <Text style={styles.saveButtonText}>Save Changes</Text>
                            )}
                        </TouchableOpacity>
                    )}
                </View>

                {/* Get Verified Section */}
                <Text style={styles.sectionHeader}>Verification</Text>
                <TouchableOpacity
                    style={[
                        styles.card,
                        {
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: 16,
                            borderColor: '#B28A45',
                            borderWidth: 1.5,
                            backgroundColor: isVerified ? 'rgba(178, 138, 69, 0.15)' : 'rgba(178, 138, 69, 0.08)',
                        }
                    ]}
                    onPress={() => navigation.navigate('GetVerified')}
                    activeOpacity={0.8}
                >
                    <View style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: 'rgba(178, 138, 69, 0.2)',
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginRight: 12,
                    }}>
                        <Ionicons name="checkmark-circle" size={24} color="#B28A45" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.settingTitle, { color: colors.textPrimary, fontWeight: 'bold' }]}>
                            {isVerified ? 'Verified Account ✓' : 'Get Verified ✓'}
                        </Text>
                        <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                            {isVerified ? 'Your golden verified badge is active' : 'Get a verified badge on your profile for ₦3,000/month'}
                        </Text>
                    </View>
                    <Text style={[styles.chevron, { color: '#B28A45', fontWeight: 'bold' }]}>›</Text>
                </TouchableOpacity>

                {/* Account & Security Card */}
                <Text style={styles.sectionHeader}>Account & Security</Text>
                <View style={styles.card}>
                    <TouchableOpacity
                        style={styles.securityRow}
                        onPress={() => setPasswordModalVisible(true)}
                    >
                        <View style={styles.settingInfo}>
                            <Text style={styles.settingTitle}>🔒 Change Password</Text>
                            <Text style={styles.settingDescription}>
                                Update your account login password
                            </Text>
                        </View>
                        <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                </View>

                {/* Settings / Preferences Card */}
                <Text style={styles.sectionHeader}>Settings & Preferences</Text>
                <View style={styles.card}>
                    <View style={styles.settingRow}>
                        <View style={styles.settingInfo}>
                            <Text style={styles.settingTitle}>🌙 Dark Mode</Text>
                            <Text style={styles.settingDescription}>
                                Switch between light and dark themes
                            </Text>
                        </View>
                        <Switch
                            value={theme === 'dark'}
                            onValueChange={toggleTheme}
                            trackColor={{ false: colors.border, true: colors.primaryLight }}
                            thumbColor={theme === 'dark' ? colors.primary : colors.surface}
                        />
                    </View>
                </View>

                {/* Logout Button */}
                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                    <Text style={styles.logoutButtonText}>🚪 Logout</Text>
                </TouchableOpacity>
            </ScrollView>

            {/* Change Password Modal */}
            <ChangePasswordModal
                visible={passwordModalVisible}
                onClose={() => setPasswordModalVisible(false)}
            />
        </View>
        </TabSwipeHandler>
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
        header: {
            backgroundColor: colors.primary,
            paddingTop: statusBarHeight + SPACING.xs,
            paddingBottom: SPACING.md,
            paddingHorizontal: SPACING.lg,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
    headerProfile: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: SPACING.md,
    },
    headerAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        marginRight: SPACING.sm,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.6)',
        backgroundColor: colors.primaryLight,
    },
    headerTextContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: FONT_SIZES.lg,
        fontWeight: 'bold',
        color: colors.textInverse,
    },
    headerSubtitle: {
        fontSize: FONT_SIZES.xs,
        color: colors.textInverse,
        opacity: 0.85,
    },
    headerAction: {
        fontSize: FONT_SIZES.md,
        color: colors.textInverse,
        fontWeight: '600',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        paddingHorizontal: SPACING.md,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.sm,
    },
    content: {
        padding: SPACING.lg,
    },
    avatarContainer: {
        alignSelf: 'center',
        marginBottom: SPACING.xl,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
    },
    editBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: colors.surface,
        borderRadius: 15,
        padding: 5,
        ...SHADOWS.small,
    },
    editBadgeText: {
        fontSize: 16,
    },
    fieldContainer: {
        marginBottom: SPACING.lg,
    },
    label: {
        fontSize: FONT_SIZES.sm,
        color: colors.textSecondary,
        marginBottom: SPACING.xs,
    },
    value: {
        fontSize: FONT_SIZES.md,
        color: colors.textPrimary,
        paddingVertical: SPACING.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    input: {
        fontSize: FONT_SIZES.md,
        color: colors.textPrimary,
        paddingVertical: SPACING.sm,
        borderBottomWidth: 2,
        borderBottomColor: colors.primary,
    },
    saveButton: {
        backgroundColor: colors.primary,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        alignItems: 'center',
        marginTop: SPACING.lg,
    },
    saveButtonText: {
        color: colors.textInverse,
        fontWeight: 'bold',
        fontSize: FONT_SIZES.md,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.lg,
        padding: SPACING.lg,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: SPACING.lg,
        ...SHADOWS.small,
    },
    sectionHeader: {
        fontSize: FONT_SIZES.md,
        fontWeight: 'bold',
        color: colors.textSecondary,
        marginBottom: SPACING.sm,
        marginTop: SPACING.xs,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    settingInfo: {
        flex: 1,
        marginRight: SPACING.md,
    },
    settingTitle: {
        fontSize: FONT_SIZES.md,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 2,
    },
    settingDescription: {
        fontSize: FONT_SIZES.sm,
        color: colors.textSecondary,
    },
    securityRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: SPACING.xs,
    },
    chevron: {
        fontSize: FONT_SIZES.xl,
        color: colors.textTertiary,
        fontWeight: 'bold',
    },
    logoutButton: {
        backgroundColor: colors.error || '#E53935',
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        alignItems: 'center',
        marginTop: SPACING.sm,
        marginBottom: SPACING.xl,
        shadowColor: colors.error || '#E53935',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 3,
    },
    logoutButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: FONT_SIZES.md,
    },
});
};
