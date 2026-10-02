import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    ScrollView,
    RefreshControl,
    Modal,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    Image,
    StatusBar,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { adminAPI } from '../services/api';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { auth } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';
import { confirmAction } from '../utils/alert';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { useAuthStore } from '../store/authStore';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function AdminDashboardScreen({ navigation }: any) {
    const { colors, theme, toggleTheme } = useTheme();
    const { switchViewRole } = useAuthStore();
    const styles = getStyles(colors);

    const scrollViewRef = useRef<ScrollView>(null);
    const pendingSectionRef = useRef<View>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [analytics, setAnalytics] = useState<any>(null);
    const [pendingVendors, setPendingVendors] = useState<any[]>([]);

    // Reviews modal state
    const [reviewsModalVisible, setReviewsModalVisible] = useState(false);
    const [allReviews, setAllReviews] = useState<any[]>([]);
    const [loadingReviews, setLoadingReviews] = useState(false);

    // Modal states
    const [modalVisible, setModalVisible] = useState(false);
    const [passwordModalVisible, setPasswordModalVisible] = useState(false);
    const [creating, setCreating] = useState(false);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        fullName: '',
        phoneNumber: '',
        businessName: '',
        category: '',
        description: '',
        address: '',
        services: '',
        businessImage: '',
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [analyticsRes, vendorsRes] = await Promise.all([
                adminAPI.getAnalytics(),
                adminAPI.getPendingVendors(),
            ]);
            setAnalytics(analyticsRes.data);
            setPendingVendors(vendorsRes.data.vendors);
        } catch (error) {
            console.error('Error fetching admin data:', error);
            Alert.alert('Error', 'Failed to load dashboard data');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    const openReviewsModal = async () => {
        setReviewsModalVisible(true);
        setLoadingReviews(true);
        try {
            const res = await adminAPI.getReviews();
            setAllReviews(res.data.reviews || []);
        } catch (err) {
            console.error('Error fetching admin reviews:', err);
        } finally {
            setLoadingReviews(false);
        }
    };

    const handleVerify = (vendorId: string, status: 'approved' | 'rejected', entityName?: string) => {
        const action = status === 'approved' ? 'Approve Account' : 'Reject Account';
        const label = entityName || 'this application';
        confirmAction(
            action,
            `Are you sure you want to ${status === 'approved' ? 'approve' : 'reject the application for'} ${label}?`,
            async () => {
                try {
                    await adminAPI.verifyVendor(vendorId, status);
                    const msg = `Account ${status} successfully`;
                    Alert.alert('Success', msg);
                    setPendingVendors((prev) => prev.filter((v) => (v.id || v.uid) !== vendorId));
                    fetchData();
                } catch (error: any) {
                    console.error('Error verifying vendor:', error);
                    const msg = error.response?.data?.message || error.message || 'Failed to update verification status';
                    Alert.alert('Error', msg);
                }
            },
            status === 'approved' ? 'Approve' : 'Reject'
        );
    };



    const handlePickImage = async () => {
        Alert.alert(
            'Vendor Image',
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
                            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
                            if (!permissionResult.granted) {
                                Alert.alert('Permission Required', 'Please grant permission to access your photos');
                                return;
                            }
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

    const handleCreateVendor = async () => {
        if (!formData.email || !formData.password || !formData.fullName || !formData.businessName || !formData.category) {
            Alert.alert('Error', 'Please fill in all required fields');
            return;
        }

        setCreating(true);
        try {
            await adminAPI.createVendor(formData);
            Alert.alert('Success', 'Vendor created successfully!');
            setModalVisible(false);
            setFormData({
                email: '',
                password: '',
                fullName: '',
                phoneNumber: '',
                businessName: '',
                category: '',
                description: '',
                address: '',
                services: '',
                businessImage: '',
            });
            fetchData();
        } catch (error: any) {
            console.error('Error creating vendor:', error);
            const errorMessage = error.response?.data?.message || error.message || 'Failed to create vendor';
            Alert.alert('Error', errorMessage);
        } finally {
            setCreating(false);
        }
    };

    const scrollToPending = () => {
        if (pendingSectionRef.current) {
            try {
                (pendingSectionRef.current as any)?.scrollIntoView?.({ behavior: 'smooth' });
            } catch (e) { }
            pendingSectionRef.current?.measureLayout?.(
                scrollViewRef.current as any,
                (x, y) => {
                    scrollViewRef.current?.scrollTo({ y: y - 20, animated: true });
                },
                () => {
                    scrollViewRef.current?.scrollToEnd?.({ animated: true });
                }
            );
        }
    };

    const handlePendingQueuePress = () => {
        if (pendingVendors.length > 0) {
            scrollToPending();
        } else {
            navigation?.navigate('Users', { role: 'vendor' });
        }
    };

    const handleAnalyticsCardPress = (cardType: string) => {
        switch (cardType) {
            case 'users':
                navigation?.navigate('Users', { role: 'all' });
                break;
            case 'active':
                navigation?.navigate('Discover');
                break;
            case 'pending':
                scrollToPending();
                break;
            case 'reviews':
                openReviewsModal();
                break;
        }
    };

    const renderAnalyticsCard = (title: string, value: number | string, color: string, cardType: string, hint: string) => (
        <TouchableOpacity
            style={[styles.analyticsCard, { borderLeftColor: color }]}
            onPress={() => handleAnalyticsCardPress(cardType)}
            activeOpacity={0.7}
        >
            <Text style={styles.analyticsValue}>{value}</Text>
            <Text style={styles.analyticsTitle}>{title}</Text>
            <Text style={[styles.tapHint, { color }]}>{hint} →</Text>
        </TouchableOpacity>
    );

    const renderPendingVendor = ({ item }: { item: any }) => {
        const entityId = item.id || item.uid;
        const displayName = item.businessName || item.userInfo?.fullName || item.userInfo?.email || 'Applicant';
        const role = item.userInfo?.role || (item.category?.toLowerCase().includes('client') ? 'client' : 'vendor');

        return (
            <View style={styles.vendorCard}>
                <View style={styles.vendorHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.vendorName}>{displayName}</Text>
                        <Text style={styles.vendorCategory}>{item.category || 'Verification Request'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <View style={[styles.rolePill, { backgroundColor: role === 'vendor' ? '#B28A4525' : '#4A90E225' }]}>
                            <Text style={[styles.rolePillText, { color: role === 'vendor' ? '#B28A45' : '#4A90E2' }]}>
                                {role.toUpperCase()}
                            </Text>
                        </View>
                        <View style={styles.statusBadge}>
                            <Text style={styles.statusText}>PENDING</Text>
                        </View>
                    </View>
                </View>

                {item.paymentReference ? (
                    <Text style={[styles.vendorInfo, { color: '#B28A45', fontWeight: 'bold' }]}>
                        💳 Payment Ref: {item.paymentReference} (₦{(item.paymentAmount || 3000).toLocaleString()})
                    </Text>
                ) : null}
                <Text style={styles.vendorInfo}>📍 {item.address || 'No address provided'}</Text>
                <Text style={styles.vendorInfo}>📧 {item.userInfo?.email || 'No email'}</Text>
                <Text style={styles.vendorInfo}>📱 {item.userInfo?.phoneNumber || 'No phone'}</Text>

                {item.description ? (
                    <Text style={styles.vendorDescription} numberOfLines={2}>
                        {item.description}
                    </Text>
                ) : null}

                {item.services ? (
                    <Text style={styles.vendorServices}>
                        Services: {item.services}
                    </Text>
                ) : null}

                <View style={styles.actionButtons}>
                    <TouchableOpacity
                        style={[styles.actionButton, styles.approveButton]}
                        onPress={() => handleVerify(entityId, 'approved', displayName)}
                    >
                        <Text style={styles.actionButtonText}>✓ Approve</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, styles.rejectButton]}
                        onPress={() => handleVerify(entityId, 'rejected', displayName)}
                    >
                        <Text style={styles.actionButtonText}>✕ Reject</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>Admin Dashboard</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <TouchableOpacity
                        style={[styles.headerButton, styles.previewHeaderBtnClient]}
                        onPress={() => switchViewRole('client')}
                    >
                        <Text style={styles.headerButtonText}>👥 Client View</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.headerButton, styles.previewHeaderBtnVendor]}
                        onPress={() => switchViewRole('vendor')}
                    >
                        <Text style={styles.headerButtonText}>🏪 Vendor View</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.headerButton}
                        onPress={() => setPasswordModalVisible(true)}
                    >
                        <Text style={styles.headerButtonText}>🔒 Password</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.headerButton}
                        onPress={toggleTheme}
                    >
                        <Text style={styles.headerButtonText}>{theme === 'dark' ? '☀️ Light' : '🌙 Dark'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.headerButton}
                        onPress={() => confirmAction('Logout', 'Are you sure you want to logout?', () => auth.signOut(), 'Logout')}
                    >
                        <Text style={styles.headerButtonText}>🚪 Logout</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                ref={scrollViewRef}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
            >
                {/* Switch Experience Mode Section */}
                <Text style={styles.sectionTitle}>👁️ Switch Experience Mode</Text>
                <View style={styles.viewModeContainer}>
                    <TouchableOpacity
                        style={[styles.viewModeCard, { borderLeftColor: '#4A90E2', borderLeftWidth: 4 }]}
                        onPress={() => switchViewRole('client')}
                        activeOpacity={0.8}
                    >
                        <View style={[styles.viewModeIconCircle, { backgroundColor: '#4A90E220' }]}>
                            <Text style={{ fontSize: 24 }}>👥</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={[styles.viewModeTitle, { color: colors.textPrimary }]}>View as Client</Text>
                                <View style={[styles.rolePill, { backgroundColor: '#4A90E225' }]}>
                                    <Text style={[styles.rolePillText, { color: '#4A90E2' }]}>CUSTOMER</Text>
                                </View>
                            </View>
                            <Text style={styles.viewModeDesc}>
                                Experience discovery maps, explore showcase, products, saved cart, vendor chats, and customer profile.
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.viewModeCard, { borderLeftColor: '#B28A45', borderLeftWidth: 4 }]}
                        onPress={() => switchViewRole('vendor')}
                        activeOpacity={0.8}
                    >
                        <View style={[styles.viewModeIconCircle, { backgroundColor: '#B28A4520' }]}>
                            <Text style={{ fontSize: 24 }}>🏪</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={[styles.viewModeTitle, { color: colors.textPrimary }]}>View as Vendor</Text>
                                <View style={[styles.rolePill, { backgroundColor: '#B28A4525' }]}>
                                    <Text style={[styles.rolePillText, { color: '#B28A45' }]}>MERCHANT</Text>
                                </View>
                            </View>
                            <Text style={styles.viewModeDesc}>
                                Experience merchant storefront, publish posts & showcase, review customer feedback, and manage business profile.
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                {/* Analytics Section with Verification Queue Notification */}
                <View style={styles.sectionHeaderRow}>
                    <Text style={[styles.sectionTitle, { marginBottom: 0, marginTop: 0 }]}>Platform Overview</Text>
                    <TouchableOpacity
                        style={[
                            styles.queueBadge,
                            pendingVendors.length > 0 ? styles.queueBadgeActive : styles.queueBadgeInactive
                        ]}
                        onPress={handlePendingQueuePress}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.queueDot, pendingVendors.length > 0 ? styles.queueDotActive : styles.queueDotInactive]} />
                        <Ionicons
                            name={pendingVendors.length > 0 ? "shield-outline" : "shield-checkmark-outline"}
                            size={14}
                            color={pendingVendors.length > 0 ? '#B28A45' : colors.textSecondary}
                        />
                        <Text style={[
                            styles.queueText,
                            pendingVendors.length > 0 ? styles.queueTextActive : { color: colors.textSecondary }
                        ]}>
                            {pendingVendors.length > 0 ? `${pendingVendors.length} Pending Verification${pendingVendors.length > 1 ? 's' : ''}` : 'Verification Queue'}
                        </Text>
                        <Ionicons
                            name="chevron-forward"
                            size={12}
                            color={pendingVendors.length > 0 ? '#B28A45' : colors.textSecondary}
                        />
                    </TouchableOpacity>
                </View>
                <View style={styles.analyticsContainer}>
                    {renderAnalyticsCard('Total Users', analytics?.totalUsers || 0, colors.primary, 'users', 'View Users')}
                    {renderAnalyticsCard('Active Vendors', analytics?.activeVendors || 0, colors.success, 'active', 'Browse Vendors')}
                    {renderAnalyticsCard('Pending', analytics?.pendingVendors || 0, colors.warning, 'pending', 'Approvals')}
                    {renderAnalyticsCard('Reviews', analytics?.totalReviews || 0, colors.info, 'reviews', 'All Reviews')}
                </View>

                {/* Pending Vendors Section */}
                <View ref={pendingSectionRef} style={styles.sectionHeaderRow}>
                    <Text style={[styles.sectionTitle, { marginBottom: 0, marginTop: 0 }]}>
                        Pending Approvals ({pendingVendors.length})
                    </Text>
                    <TouchableOpacity
                        style={styles.manageUsersLink}
                        onPress={() => navigation?.navigate('Users', { role: 'vendor' })}
                    >
                        <Text style={[styles.manageUsersLinkText, { color: colors.primary }]}>
                            Manage in Users Tab →
                        </Text>
                    </TouchableOpacity>
                </View>
                {pendingVendors.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>No pending verifications</Text>
                    </View>
                ) : (
                    pendingVendors.map(item => (
                        <View key={item.id} style={{ marginBottom: SPACING.md }}>
                            {renderPendingVendor({ item })}
                        </View>
                    ))
                )}
            </ScrollView>

            {/* Floating Action Button */}
            <TouchableOpacity
                style={styles.fab}
                onPress={() => setModalVisible(true)}
                activeOpacity={0.8}
            >
                <Text style={styles.fabIcon}>+</Text>
            </TouchableOpacity>

            {/* Create Vendor Modal */}
            <Modal
                animationType="slide"
                transparent={false}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <KeyboardAvoidingView
                    style={styles.modalContainer}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <ScrollView contentContainerStyle={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Create New Vendor</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Text style={styles.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.modalLabel}>Email *</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="vendor@example.com"
                            placeholderTextColor={colors.textTertiary}
                            value={formData.email}
                            onChangeText={(text) => setFormData({ ...formData, email: text })}
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />

                        <Text style={styles.modalLabel}>Password *</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Minimum 6 characters"
                            placeholderTextColor={colors.textTertiary}
                            value={formData.password}
                            onChangeText={(text) => setFormData({ ...formData, password: text })}
                            secureTextEntry
                        />

                        <Text style={styles.modalLabel}>Full Name *</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="John Doe"
                            placeholderTextColor={colors.textTertiary}
                            value={formData.fullName}
                            onChangeText={(text) => setFormData({ ...formData, fullName: text })}
                        />

                        <Text style={styles.modalLabel}>Phone Number</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="+234..."
                            placeholderTextColor={colors.textTertiary}
                            value={formData.phoneNumber}
                            onChangeText={(text) => setFormData({ ...formData, phoneNumber: text })}
                            keyboardType="phone-pad"
                        />

                        <Text style={styles.modalLabel}>Business Name *</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Best Bakery"
                            placeholderTextColor={colors.textTertiary}
                            value={formData.businessName}
                            onChangeText={(text) => setFormData({ ...formData, businessName: text })}
                        />

                        <Text style={styles.modalLabel}>Category *</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Restaurant, Retail, Services, etc."
                            placeholderTextColor={colors.textTertiary}
                            value={formData.category}
                            onChangeText={(text) => setFormData({ ...formData, category: text })}
                        />

                        <Text style={styles.modalLabel}>Description</Text>
                        <TextInput
                            style={[styles.modalInput, styles.modalTextArea]}
                            placeholder="Describe the business..."
                            placeholderTextColor={colors.textTertiary}
                            value={formData.description}
                            onChangeText={(text) => setFormData({ ...formData, description: text })}
                            multiline
                            numberOfLines={3}
                        />

                        <Text style={styles.modalLabel}>Address</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="123 Main Street"
                            placeholderTextColor={colors.textTertiary}
                            value={formData.address}
                            onChangeText={(text) => setFormData({ ...formData, address: text })}
                        />

                        <Text style={styles.modalLabel}>Services</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Delivery, Catering, etc."
                            placeholderTextColor={colors.textTertiary}
                            value={formData.services}
                            onChangeText={(text) => setFormData({ ...formData, services: text })}
                        />

                        <Text style={styles.modalLabel}>Business Image</Text>
                        <TouchableOpacity
                            style={styles.imagePickerButton}
                            onPress={handlePickImage}
                        >
                            <Text style={styles.imagePickerButtonText}>
                                {formData.businessImage ? '✓ Image Selected' : '📷 Choose Business Photo'}
                            </Text>
                        </TouchableOpacity>
                        {formData.businessImage && (
                            <Image
                                source={{ uri: formData.businessImage }}
                                style={styles.imagePreview}
                            />
                        )}

                        <TouchableOpacity
                            style={[styles.modalButton, creating && styles.modalButtonDisabled]}
                            onPress={handleCreateVendor}
                            disabled={creating}
                        >
                            {creating ? (
                                <ActivityIndicator color={colors.textInverse} />
                            ) : (
                                <Text style={styles.modalButtonText}>Create Vendor</Text>
                            )}
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            </Modal>

            {/* All Reviews Modal */}
            <Modal
                animationType="slide"
                transparent={false}
                visible={reviewsModalVisible}
                onRequestClose={() => setReviewsModalVisible(false)}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <View>
                            <Text style={styles.modalTitle}>Platform Reviews</Text>
                            <Text style={{ fontSize: FONT_SIZES.xs, color: colors.textSecondary, marginTop: 2 }}>
                                {allReviews.length} total reviews
                            </Text>
                        </View>
                        <TouchableOpacity onPress={() => setReviewsModalVisible(false)}>
                            <Text style={styles.modalClose}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {loadingReviews ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <ActivityIndicator size="large" color={colors.primary} />
                        </View>
                    ) : allReviews.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>No reviews found on the platform yet.</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={allReviews}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={{ padding: SPACING.md }}
                            renderItem={({ item }) => (
                                <View style={[styles.vendorCard, { marginBottom: SPACING.md }]}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <Text style={{ fontWeight: 'bold', fontSize: FONT_SIZES.md, color: colors.textPrimary }}>
                                            👤 {item.clientName}
                                        </Text>
                                        <Text style={{ color: colors.warning, fontWeight: 'bold' }}>
                                            {'⭐'.repeat(Math.round(item.rating))} ({item.rating})
                                        </Text>
                                    </View>
                                    <Text style={{ fontSize: FONT_SIZES.xs, color: colors.primary, fontWeight: '600', marginBottom: 6 }}>
                                        🏢 For: {item.vendorName}
                                    </Text>
                                    {item.comment ? (
                                        <Text style={{ fontSize: FONT_SIZES.sm, color: colors.textSecondary, lineHeight: 20 }}>
                                            "{item.comment}"
                                        </Text>
                                    ) : null}
                                    <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 6 }}>
                                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}
                                    </Text>
                                </View>
                            )}
                        />
                    )}
                </View>
            </Modal>

            {/* Change Password Modal */}
            <ChangePasswordModal
                visible={passwordModalVisible}
                onClose={() => setPasswordModalVisible(false)}
            />
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
        loadingContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
        header: {
            padding: SPACING.lg,
            paddingTop: statusBarHeight + SPACING.sm,
            backgroundColor: colors.primary,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
    headerTitle: {
        fontSize: FONT_SIZES.xl,
        fontWeight: 'bold',
        color: colors.textInverse,
    },
    headerButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        paddingHorizontal: SPACING.sm,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.sm,
    },
    headerButtonText: {
        color: colors.textInverse,
        fontWeight: 'bold',
        fontSize: FONT_SIZES.xs,
    },
    previewHeaderBtnClient: {
        backgroundColor: 'rgba(74, 144, 226, 0.25)',
        borderWidth: 1,
        borderColor: '#4A90E2',
    },
    previewHeaderBtnVendor: {
        backgroundColor: 'rgba(178, 138, 69, 0.25)',
        borderWidth: 1,
        borderColor: '#B28A45',
    },
    viewModeContainer: {
        marginBottom: SPACING.lg,
        gap: SPACING.sm,
    },
    viewModeCard: {
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.md,
        ...SHADOWS.small,
    },
    viewModeIconCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    viewModeTitle: {
        fontSize: FONT_SIZES.md,
        fontWeight: 'bold',
    },
    viewModeDesc: {
        fontSize: FONT_SIZES.xs,
        color: colors.textSecondary,
        marginTop: 3,
        lineHeight: 16,
    },
    rolePill: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    rolePillText: {
        fontSize: 9,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    scrollContent: {
        padding: SPACING.md,
    },
    sectionTitle: {
        fontSize: FONT_SIZES.lg,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: SPACING.md,
        marginTop: SPACING.sm,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        marginBottom: SPACING.md,
        marginTop: SPACING.sm,
        gap: 8,
    },
    queueBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.round,
        borderWidth: 1,
    },
    queueBadgeActive: {
        backgroundColor: '#B28A4518',
        borderColor: '#B28A45',
    },
    queueBadgeInactive: {
        backgroundColor: colors.surfaceLight,
        borderColor: colors.border,
    },
    queueDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
    },
    queueDotActive: {
        backgroundColor: '#B28A45',
    },
    queueDotInactive: {
        backgroundColor: colors.textTertiary,
    },
    queueText: {
        fontSize: FONT_SIZES.xs,
        fontWeight: '600',
    },
    queueTextActive: {
        color: '#B28A45',
        fontWeight: 'bold',
    },
    manageUsersLink: {
        paddingVertical: 4,
        paddingHorizontal: 8,
    },
    manageUsersLinkText: {
        fontSize: FONT_SIZES.xs,
        fontWeight: '600',
    },
    analyticsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: SPACING.lg,
    },
    analyticsCard: {
        width: '48%',
        backgroundColor: colors.surface,
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        marginBottom: SPACING.md,
        borderLeftWidth: 4,
        ...SHADOWS.small,
    },
    analyticsValue: {
        fontSize: FONT_SIZES.xl,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: SPACING.xs,
    },
    analyticsTitle: {
        fontSize: FONT_SIZES.xs,
        color: colors.textSecondary,
        textTransform: 'uppercase',
    },
    tapHint: {
        fontSize: 9,
        color: colors.textTertiary,
        marginTop: 4,
        fontStyle: 'italic',
    },
    vendorCard: {
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.lg,
        padding: SPACING.md,
        ...SHADOWS.medium,
    },
    vendorHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: SPACING.md,
    },
    vendorName: {
        fontSize: FONT_SIZES.lg,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    vendorCategory: {
        fontSize: FONT_SIZES.sm,
        color: colors.primary,
        fontWeight: '600',
    },
    statusBadge: {
        backgroundColor: colors.warning,
        paddingHorizontal: SPACING.sm,
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.sm,
    },
    statusText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: colors.textInverse,
    },
    vendorInfo: {
        fontSize: FONT_SIZES.sm,
        color: colors.textSecondary,
        marginBottom: 4,
    },
    vendorDescription: {
        fontSize: FONT_SIZES.sm,
        color: colors.textPrimary,
        marginTop: SPACING.xs,
        marginBottom: SPACING.xs,
    },
    vendorServices: {
        fontSize: FONT_SIZES.xs,
        color: colors.textSecondary,
        fontStyle: 'italic',
        marginBottom: SPACING.xs,
    },
    actionButtons: {
        flexDirection: 'row',
        marginTop: SPACING.md,
    },
    actionButton: {
        flex: 1,
        padding: SPACING.sm,
        borderRadius: BORDER_RADIUS.md,
        alignItems: 'center',
        marginHorizontal: 4,
    },
    approveButton: {
        backgroundColor: colors.success,
    },
    rejectButton: {
        backgroundColor: colors.error,
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: FONT_SIZES.sm,
    },
    emptyState: {
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.xl,
        alignItems: 'center',
        marginVertical: SPACING.md,
    },
    emptyText: {
        color: colors.textSecondary,
        fontSize: FONT_SIZES.md,
    },
    fab: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        ...SHADOWS.large,
    },
    fabIcon: {
        fontSize: 32,
        color: colors.textInverse,
        fontWeight: '300',
    },
    modalContainer: {
        flex: 1,
        backgroundColor: colors.background,
    },
    modalContent: {
        padding: SPACING.lg,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.lg,
        paddingBottom: SPACING.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    modalTitle: {
        fontSize: FONT_SIZES.xl,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    modalClose: {
        fontSize: FONT_SIZES.xl,
        color: colors.textSecondary,
    },
    modalLabel: {
        fontSize: FONT_SIZES.sm,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: SPACING.xs,
        marginTop: SPACING.sm,
    },
    modalInput: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        fontSize: FONT_SIZES.md,
        color: colors.textPrimary,
    },
    modalTextArea: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
    imagePickerButton: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        alignItems: 'center',
    },
    imagePickerButtonText: {
        color: colors.primary,
        fontSize: FONT_SIZES.md,
        fontWeight: '500',
    },
    imagePreview: {
        width: '100%',
        height: 150,
        borderRadius: BORDER_RADIUS.md,
        marginTop: SPACING.sm,
    },
    modalButton: {
        backgroundColor: colors.primary,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        alignItems: 'center',
        marginTop: SPACING.xl,
        marginBottom: SPACING.xl,
    },
    modalButtonDisabled: {
        backgroundColor: colors.textTertiary,
    },
    modalButtonText: {
        color: colors.textInverse,
        fontSize: FONT_SIZES.md,
        fontWeight: 'bold',
    },
});
};
