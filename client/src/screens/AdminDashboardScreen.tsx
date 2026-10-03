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
import { adminAPI, chatAPI } from '../services/api';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { auth } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';
import { confirmAction } from '../utils/alert';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { useAuthStore } from '../store/authStore';
import Ionicons from '@expo/vector-icons/Ionicons';

const SUPPORT_QUICK_RESPONSES = [
    'Hello! We are currently looking into this and will assist you immediately.',
    'Thank you for reaching out. Your vendor verification has been reviewed and approved!',
    'We have forwarded your transaction query to our escrow & payments department.',
    'Please provide your order number or reference code so we can resolve this quickly.',
];

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

    // Navigation Sub-tab: 'overview' | 'support'
    const [adminActiveTab, setAdminActiveTab] = useState<'overview' | 'support'>('overview');

    // Support Queue states
    const [supportConversations, setSupportConversations] = useState<any[]>([]);
    const [loadingSupport, setLoadingSupport] = useState(false);
    const [supportFilter, setSupportFilter] = useState<'all' | 'pending' | 'resolved'>('all');
    const [supportSearchQuery, setSupportSearchQuery] = useState('');
    const [replyModalVisible, setReplyModalVisible] = useState(false);
    const [selectedSupportConv, setSelectedSupportConv] = useState<any | null>(null);
    const [replyText, setReplyText] = useState('');
    const [sendingReply, setSendingReply] = useState(false);
    const [resolvedTicketIds, setResolvedTicketIds] = useState<Record<string, boolean>>({});

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

    const fetchSupportConversations = async (silent = false) => {
        if (!silent) setLoadingSupport(true);
        try {
            const res = await chatAPI.getConversations('qiira_official_support');
            setSupportConversations(res.data?.conversations || []);
        } catch (err) {
            console.error('Error fetching support queue:', err);
        } finally {
            if (!silent) setLoadingSupport(false);
        }
    };

    useEffect(() => {
        fetchData();
        fetchSupportConversations(true);
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
        fetchSupportConversations(true);
    };

    const handleOpenSupportChat = (item: any) => {
        const otherId = (item.participants || []).find((p: string) => p !== 'qiira_official_support') || '';
        const otherName = item.participantNames?.[otherId] || 'User';
        const otherImage = item.participantImages?.[otherId] || '';
        const isVerified = Boolean(item.participantVerified?.[otherId]);

        navigation.navigate('Chat', {
            conversationId: item.id,
            otherUserId: otherId,
            otherUserName: otherName,
            otherUserImage: otherImage,
            isVerified,
            isSupport: true,
            senderAsSupport: true,
        });
    };

    const handleOpenQuickReplyModal = (item: any) => {
        setSelectedSupportConv(item);
        setReplyText('');
        setReplyModalVisible(true);
    };

    const handleSendQuickReply = async () => {
        if (!selectedSupportConv || !replyText.trim()) return;
        const otherId = (selectedSupportConv.participants || []).find((p: string) => p !== 'qiira_official_support') || '';
        if (!otherId) return;

        setSendingReply(true);
        try {
            await chatAPI.sendMessage({
                conversationId: selectedSupportConv.id,
                senderId: 'qiira_official_support',
                receiverId: otherId,
                text: replyText.trim(),
                receiverName: selectedSupportConv.participantNames?.[otherId] || 'User',
                receiverImage: selectedSupportConv.participantImages?.[otherId] || undefined,
            });
            Alert.alert('Sent', 'Official support response sent successfully.');
            setReplyModalVisible(false);
            setReplyText('');
            fetchSupportConversations(true);
        } catch (err: any) {
            console.error('Error sending support reply:', err);
            Alert.alert('Error', err.response?.data?.message || 'Failed to send response');
        } finally {
            setSendingReply(false);
        }
    };

    const handleResolveTicket = (item: any) => {
        const otherId = (item.participants || []).find((p: string) => p !== 'qiira_official_support') || '';
        const otherName = item.participantNames?.[otherId] || 'User';
        confirmAction(
            'Mark Ticket Resolved',
            `Are you sure you want to mark the support inquiry from ${otherName} as resolved? This will send an automated resolution notice.`,
            async () => {
                try {
                    await chatAPI.sendMessage({
                        conversationId: item.id,
                        senderId: 'qiira_official_support',
                        receiverId: otherId,
                        text: '✅ [Ticket Resolved]: Thank you for contacting Qiira Customer Support. Your inquiry has been marked as resolved. If you need any further help, simply reply to this chat!',
                        receiverName: otherName,
                        receiverImage: item.participantImages?.[otherId] || undefined,
                    });
                    setResolvedTicketIds((prev) => ({ ...prev, [item.id]: true }));
                    Alert.alert('Resolved', `Support inquiry for ${otherName} marked as resolved.`);
                    fetchSupportConversations(true);
                } catch (err) {
                    console.error('Error resolving support ticket:', err);
                    setResolvedTicketIds((prev) => ({ ...prev, [item.id]: true }));
                }
            }
        );
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

    const pendingInquiriesCount = supportConversations.filter(
        (c) => !resolvedTicketIds[c.id] && !c.lastMessage?.includes('[Ticket Resolved]')
    ).length;
    const resolvedInquiriesCount = supportConversations.length - pendingInquiriesCount;

    const filteredSupportConvs = supportConversations.filter((conv) => {
        const otherId = (conv.participants || []).find((p: string) => p !== 'qiira_official_support') || '';
        const name = conv.participantNames?.[otherId] || '';
        const msg = conv.lastMessage || '';
        const query = supportSearchQuery.toLowerCase();
        const matchesQuery = !query || name.toLowerCase().includes(query) || msg.toLowerCase().includes(query);
        if (!matchesQuery) return false;

        const isResolved = Boolean(resolvedTicketIds[conv.id] || msg.includes('[Ticket Resolved]'));
        if (supportFilter === 'pending') return !isResolved;
        if (supportFilter === 'resolved') return isResolved;
        return true;
    });

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

            {/* Top Admin Section Switcher: Overview vs Support Desk Queue */}
            <View style={styles.topSegmentBar}>
                <TouchableOpacity
                    style={[
                        styles.topSegmentBtn,
                        adminActiveTab === 'overview' && styles.topSegmentBtnActive,
                    ]}
                    onPress={() => setAdminActiveTab('overview')}
                    activeOpacity={0.8}
                >
                    <Ionicons
                        name="grid-outline"
                        size={16}
                        color={adminActiveTab === 'overview' ? colors.primary : colors.textSecondary}
                    />
                    <Text
                        style={[
                            styles.topSegmentText,
                            adminActiveTab === 'overview' && styles.topSegmentTextActive,
                        ]}
                    >
                        Overview & Approvals
                    </Text>
                    {pendingVendors.length > 0 && (
                        <View style={styles.segmentBadge}>
                            <Text style={styles.segmentBadgeText}>{pendingVendors.length}</Text>
                        </View>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.topSegmentBtn,
                        adminActiveTab === 'support' && styles.topSegmentBtnActive,
                    ]}
                    onPress={() => {
                        setAdminActiveTab('support');
                        fetchSupportConversations();
                    }}
                    activeOpacity={0.8}
                >
                    <Ionicons
                        name="headset"
                        size={16}
                        color={adminActiveTab === 'support' ? colors.primary : colors.textSecondary}
                    />
                    <Text
                        style={[
                            styles.topSegmentText,
                            adminActiveTab === 'support' && styles.topSegmentTextActive,
                        ]}
                    >
                        Support Queue
                    </Text>
                    {pendingInquiriesCount > 0 ? (
                        <View style={[styles.segmentBadge, { backgroundColor: '#F59E0B' }]}>
                            <Text style={styles.segmentBadgeText}>{pendingInquiriesCount}</Text>
                        </View>
                    ) : supportConversations.length > 0 ? (
                        <View style={[styles.segmentBadge, { backgroundColor: '#10B981' }]}>
                            <Text style={styles.segmentBadgeText}>{supportConversations.length}</Text>
                        </View>
                    ) : null}
                </TouchableOpacity>
            </View>

            {adminActiveTab === 'overview' ? (
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
            ) : (
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                    }
                >
                    {/* Support Desk Title & Actions */}
                    <View style={styles.supportHeaderRow}>
                        <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                                <Text style={styles.sectionTitle}>🎧 Support Desk Queue</Text>
                                <View style={styles.livePulseDot} />
                            </View>
                            <Text style={styles.supportSubText}>
                                Live customer desk. Answer inquiries, provide assistance, and resolve tickets.
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={styles.refreshQueueBtn}
                            onPress={() => fetchSupportConversations()}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="refresh" size={15} color={colors.primary} />
                            <Text style={[styles.refreshQueueBtnText, { color: colors.primary }]}>Refresh</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Support Metrics Cards */}
                    <View style={styles.supportStatsRow}>
                        <View style={[styles.supportStatCard, { borderLeftColor: colors.primary, borderLeftWidth: 4 }]}>
                            <Text style={styles.supportStatNumber}>{supportConversations.length}</Text>
                            <Text style={styles.supportStatLabel}>Total Inquiries</Text>
                        </View>
                        <View style={[styles.supportStatCard, { borderLeftColor: '#F59E0B', borderLeftWidth: 4 }]}>
                            <Text style={[styles.supportStatNumber, { color: '#F59E0B' }]}>{pendingInquiriesCount}</Text>
                            <Text style={styles.supportStatLabel}>Needs Action</Text>
                        </View>
                        <View style={[styles.supportStatCard, { borderLeftColor: '#10B981', borderLeftWidth: 4 }]}>
                            <Text style={[styles.supportStatNumber, { color: '#10B981' }]}>{resolvedInquiriesCount}</Text>
                            <Text style={styles.supportStatLabel}>Resolved</Text>
                        </View>
                    </View>

                    {/* Search and Filters */}
                    <View style={styles.supportSearchContainer}>
                        <Ionicons name="search" size={18} color={colors.textTertiary} style={{ marginRight: 8 }} />
                        <TextInput
                            style={styles.supportSearchInput}
                            placeholder="Search by user name or inquiry content..."
                            placeholderTextColor={colors.textTertiary}
                            value={supportSearchQuery}
                            onChangeText={setSupportSearchQuery}
                        />
                        {supportSearchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSupportSearchQuery('')}>
                                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Status Filter Chips */}
                    <View style={styles.supportFilterRow}>
                        {(['all', 'pending', 'resolved'] as const).map((filterKey) => (
                            <TouchableOpacity
                                key={filterKey}
                                style={[
                                    styles.supportFilterChip,
                                    supportFilter === filterKey && styles.supportFilterChipActive,
                                ]}
                                onPress={() => setSupportFilter(filterKey)}
                                activeOpacity={0.7}
                            >
                                <Text
                                    style={[
                                        styles.supportFilterChipText,
                                        supportFilter === filterKey && styles.supportFilterChipTextActive,
                                    ]}
                                >
                                    {filterKey === 'all'
                                        ? `All (${supportConversations.length})`
                                        : filterKey === 'pending'
                                        ? `Needs Action (${pendingInquiriesCount})`
                                        : `Resolved (${resolvedInquiriesCount})`}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Support Queue Cards */}
                    {loadingSupport ? (
                        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                            <ActivityIndicator size="large" color={colors.primary} />
                            <Text style={{ marginTop: 12, color: colors.textSecondary, fontSize: 13 }}>
                                Loading support queue...
                            </Text>
                        </View>
                    ) : filteredSupportConvs.length === 0 ? (
                        <View style={styles.emptySupportCard}>
                            <View style={styles.emptySupportIconBox}>
                                <Ionicons name="chatbubbles-outline" size={38} color={colors.textTertiary} />
                            </View>
                            <Text style={styles.emptySupportTitle}>No support tickets found</Text>
                            <Text style={styles.emptySupportSubtitle}>
                                {supportSearchQuery
                                    ? 'No conversations match your search filter.'
                                    : 'All client and vendor tickets have been attended to! 🎉'}
                            </Text>
                        </View>
                    ) : (
                        filteredSupportConvs.map((conv) => {
                            const otherId = (conv.participants || []).find((p: string) => p !== 'qiira_official_support') || '';
                            const otherName = conv.participantNames?.[otherId] || 'User';
                            const otherImage = conv.participantImages?.[otherId] || '';
                            const isVerified = Boolean(conv.participantVerified?.[otherId]);
                            const isResolved = Boolean(resolvedTicketIds[conv.id] || conv.lastMessage?.includes('[Ticket Resolved]'));
                            const lastMsg = conv.lastMessage || 'No message content';
                            const timeText = conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

                            // Detect issue tag in message
                            let detectedTag = '';
                            if (lastMsg.toLowerCase().includes('order') || lastMsg.toLowerCase().includes('deliver')) detectedTag = '📦 Order';
                            else if (lastMsg.toLowerCase().includes('verif') || lastMsg.toLowerCase().includes('badge')) detectedTag = '🛡️ Verification';
                            else if (lastMsg.toLowerCase().includes('pay') || lastMsg.toLowerCase().includes('escrow') || lastMsg.toLowerCase().includes('bill')) detectedTag = '💳 Payment';
                            else if (lastMsg.toLowerCase().includes('report') || lastMsg.toLowerCase().includes('scam') || lastMsg.toLowerCase().includes('suspicious')) detectedTag = '⚠️ Report Issue';
                            else if (lastMsg.toLowerCase().includes('feature') || lastMsg.toLowerCase().includes('suggest')) detectedTag = '💡 Feature Request';
                            else if (lastMsg.toLowerCase().includes('agent')) detectedTag = '🎧 Live Agent Desk';

                            return (
                                <View key={conv.id} style={styles.supportTicketCard}>
                                    <View style={styles.supportTicketHeader}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                            <Image
                                                source={otherImage ? { uri: otherImage } : { uri: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=500' }}
                                                style={styles.ticketAvatar}
                                            />
                                            <View style={{ marginLeft: 10, flex: 1 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                    <Text style={styles.ticketUserName} numberOfLines={1}>{otherName}</Text>
                                                    {isVerified && (
                                                        <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                                                    )}
                                                </View>
                                                <Text style={styles.ticketTimestamp}>{timeText}</Text>
                                            </View>
                                        </View>

                                        {/* Status Pill */}
                                        <View
                                            style={[
                                                styles.ticketStatusPill,
                                                isResolved
                                                    ? styles.ticketStatusResolved
                                                    : styles.ticketStatusPending,
                                            ]}
                                        >
                                            <View
                                                style={[
                                                    styles.ticketStatusDot,
                                                    { backgroundColor: isResolved ? '#10B981' : '#F59E0B' },
                                                ]}
                                            />
                                            <Text
                                                style={[
                                                    styles.ticketStatusText,
                                                    { color: isResolved ? '#10B981' : '#F59E0B' },
                                                ]}
                                            >
                                                {isResolved ? 'Resolved' : 'Needs Action'}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Issue Tag if present */}
                                    {detectedTag ? (
                                        <View style={styles.detectedTagPill}>
                                            <Text style={styles.detectedTagText}>{detectedTag}</Text>
                                        </View>
                                    ) : null}

                                    {/* Message snippet */}
                                    <View style={styles.ticketMessageContainer}>
                                        <Text style={styles.ticketMessageText} numberOfLines={3}>
                                            "{lastMsg}"
                                        </Text>
                                    </View>

                                    {/* Ticket Actions */}
                                    <View style={styles.ticketActionsRow}>
                                        <TouchableOpacity
                                            style={[styles.ticketActionBtn, styles.ticketActionBtnChat]}
                                            onPress={() => handleOpenSupportChat(conv)}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons name="chatbubble-ellipses" size={15} color="#fff" />
                                            <Text style={styles.ticketActionBtnChatText}>Live Chat</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[styles.ticketActionBtn, styles.ticketActionBtnReply]}
                                            onPress={() => handleOpenQuickReplyModal(conv)}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons name="flash-outline" size={15} color={colors.primary} />
                                            <Text style={[styles.ticketActionBtnReplyText, { color: colors.primary }]}>Quick Reply</Text>
                                        </TouchableOpacity>

                                        {!isResolved && (
                                            <TouchableOpacity
                                                style={[styles.ticketActionBtn, styles.ticketActionBtnResolve]}
                                                onPress={() => handleResolveTicket(conv)}
                                                activeOpacity={0.7}
                                            >
                                                <Ionicons name="checkmark-done" size={15} color="#10B981" />
                                                <Text style={styles.ticketActionBtnResolveText}>Resolve</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                            );
                        })
                    )}
                </ScrollView>
            )}

            {/* Floating Action Button (Only on Overview) */}
            {adminActiveTab === 'overview' && (
                <TouchableOpacity
                    style={styles.fab}
                    onPress={() => setModalVisible(true)}
                    activeOpacity={0.8}
                >
                    <Text style={styles.fabIcon}>+</Text>
                </TouchableOpacity>
            )}

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

            {/* Quick Reply Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={replyModalVisible}
                onRequestClose={() => setReplyModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.replyModalBackdrop}
                >
                    <View style={styles.replyModalCard}>
                        <View style={styles.replyModalHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                <View style={styles.supportHeadsetIcon}>
                                    <Ionicons name="headset" size={20} color="#10B981" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.replyModalTitle}>Support Quick Response</Text>
                                    <Text style={styles.replyModalSubtitle} numberOfLines={1}>
                                        Replying to {selectedSupportConv ? selectedSupportConv.participantNames?.[(selectedSupportConv.participants || []).find((p: string) => p !== 'qiira_official_support') || ''] || 'User' : 'User'}
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => setReplyModalVisible(false)} style={{ padding: 4 }}>
                                <Ionicons name="close" size={22} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {/* Fast Canned Templates */}
                        <Text style={styles.cannedHeader}>Choose Quick Response Template:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
                            {SUPPORT_QUICK_RESPONSES.map((tmpl, idx) => (
                                <TouchableOpacity
                                    key={idx}
                                    style={styles.cannedChip}
                                    onPress={() => setReplyText(tmpl)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.cannedChipText} numberOfLines={1}>{tmpl}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Reply Input */}
                        <Text style={[styles.modalLabel, { marginTop: 10 }]}>Response Message *</Text>
                        <TextInput
                            style={[styles.modalInput, styles.replyTextInput]}
                            placeholder="Type official support message..."
                            placeholderTextColor={colors.textTertiary}
                            value={replyText}
                            onChangeText={setReplyText}
                            multiline
                        />

                        {/* Send Action */}
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                            <TouchableOpacity
                                style={[styles.modalButton, { flex: 1, backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border }]}
                                onPress={() => setReplyModalVisible(false)}
                            >
                                <Text style={[styles.modalButtonText, { color: colors.textPrimary }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, { flex: 2, backgroundColor: '#10B981' }, (!replyText.trim() || sendingReply) && { opacity: 0.6 }]}
                                onPress={handleSendQuickReply}
                                disabled={!replyText.trim() || sendingReply}
                            >
                                {sendingReply ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text style={styles.modalButtonText}>Send Official Reply 🚀</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
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
    // Top Segment Bar
    topSegmentBar: {
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingHorizontal: SPACING.md,
        paddingVertical: 6,
        gap: 10,
    },
    topSegmentBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.md,
        paddingVertical: 8,
        borderRadius: BORDER_RADIUS.md,
        gap: 6,
        backgroundColor: 'transparent',
    },
    topSegmentBtnActive: {
        backgroundColor: `${colors.primary}18`,
    },
    topSegmentText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    topSegmentTextActive: {
        color: colors.primary,
        fontWeight: 'bold',
    },
    segmentBadge: {
        backgroundColor: colors.warning,
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 10,
    },
    segmentBadgeText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#fff',
    },
    // Support Desk Queue Styles
    supportHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: SPACING.md,
    },
    livePulseDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10B981',
    },
    supportSubText: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 3,
        maxWidth: '85%',
        lineHeight: 17,
    },
    refreshQueueBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.sm,
        backgroundColor: `${colors.primary}15`,
    },
    refreshQueueBtnText: {
        fontSize: 12,
        fontWeight: '600',
    },
    supportStatsRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: SPACING.md,
    },
    supportStatCard: {
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.sm + 2,
        ...SHADOWS.small,
    },
    supportStatNumber: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    supportStatLabel: {
        fontSize: 10,
        fontWeight: '600',
        color: colors.textSecondary,
        marginTop: 2,
        textTransform: 'uppercase',
    },
    supportSearchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.md,
        paddingHorizontal: SPACING.md,
        paddingVertical: Platform.OS === 'ios' ? 10 : 6,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: SPACING.sm,
    },
    supportSearchInput: {
        flex: 1,
        fontSize: FONT_SIZES.sm,
        color: colors.textPrimary,
    },
    supportFilterRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: SPACING.md,
        flexWrap: 'wrap',
    },
    supportFilterChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    supportFilterChipActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    supportFilterChipText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    supportFilterChipTextActive: {
        color: colors.textInverse,
    },
    emptySupportCard: {
        alignItems: 'center',
        paddingVertical: 45,
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 1,
        borderColor: colors.border,
    },
    emptySupportIconBox: {
        width: 68,
        height: 68,
        borderRadius: 34,
        backgroundColor: colors.surfaceLight,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: SPACING.md,
    },
    emptySupportTitle: {
        fontSize: FONT_SIZES.md,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: SPACING.xs,
    },
    emptySupportSubtitle: {
        fontSize: FONT_SIZES.xs,
        color: colors.textSecondary,
        textAlign: 'center',
        maxWidth: '75%',
    },
    // Ticket Card
    supportTicketCard: {
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.lg,
        padding: SPACING.md,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: colors.border,
        ...SHADOWS.small,
    },
    supportTicketHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    ticketAvatar: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: colors.surfaceLight,
    },
    ticketUserName: {
        fontSize: 14,
        fontWeight: 'bold',
        color: colors.textPrimary,
        maxWidth: 160,
    },
    ticketTimestamp: {
        fontSize: 10,
        color: colors.textTertiary,
        marginTop: 1,
    },
    ticketStatusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
    },
    ticketStatusPending: {
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
    },
    ticketStatusResolved: {
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
    },
    ticketStatusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    ticketStatusText: {
        fontSize: 10,
        fontWeight: '700',
    },
    detectedTagPill: {
        alignSelf: 'flex-start',
        backgroundColor: `${colors.primary}18`,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        marginBottom: 6,
    },
    detectedTagText: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.primary,
    },
    ticketMessageContainer: {
        backgroundColor: colors.surfaceLight,
        borderRadius: BORDER_RADIUS.sm,
        padding: SPACING.sm,
        marginBottom: 10,
    },
    ticketMessageText: {
        fontSize: 12,
        color: colors.textPrimary,
        lineHeight: 18,
    },
    ticketActionsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    ticketActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: BORDER_RADIUS.sm,
        gap: 4,
    },
    ticketActionBtnChat: {
        flex: 1,
        backgroundColor: colors.primary,
    },
    ticketActionBtnChatText: {
        color: colors.textInverse,
        fontSize: 12,
        fontWeight: 'bold',
    },
    ticketActionBtnReply: {
        flex: 1,
        backgroundColor: `${colors.primary}15`,
    },
    ticketActionBtnReplyText: {
        fontSize: 12,
        fontWeight: '600',
    },
    ticketActionBtnResolve: {
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
    },
    ticketActionBtnResolveText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#10B981',
    },
    // Quick Reply Modal Styles
    replyModalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        padding: SPACING.lg,
    },
    replyModalCard: {
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.xl,
        padding: SPACING.lg,
        ...SHADOWS.large,
    },
    replyModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.md,
        paddingBottom: SPACING.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    supportHeadsetIcon: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(16, 185, 129, 0.18)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    replyModalTitle: {
        fontSize: 15,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    replyModalSubtitle: {
        fontSize: 11,
        color: colors.textSecondary,
        marginTop: 1,
    },
    cannedHeader: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.textSecondary,
        marginBottom: 6,
    },
    cannedChip: {
        backgroundColor: colors.surfaceLight,
        borderRadius: BORDER_RADIUS.sm,
        paddingHorizontal: 10,
        paddingVertical: 5,
        maxWidth: 220,
        borderWidth: 1,
        borderColor: colors.border,
    },
    cannedChipText: {
        fontSize: 11,
        color: colors.textPrimary,
    },
    replyTextInput: {
        minHeight: 85,
        textAlignVertical: 'top',
    },
});
};
