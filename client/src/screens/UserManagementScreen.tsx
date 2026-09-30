import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    RefreshControl,
    TextInput,
    TouchableOpacity,
    Alert,
    Platform,
    StatusBar,
} from 'react-native';
import { adminAPI } from '../services/api';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { VerificationBadgeInline } from '../components/VerificationBadge';
import { confirmAction } from '../utils/alert';
import { auth } from '../config/firebase';

export default function UserManagementScreen({ route }: any) {
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [users, setUsers] = useState<any[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterRole, setFilterRole] = useState<'all' | 'client' | 'vendor' | 'admin'>(route?.params?.role || 'all');

    useEffect(() => {
        fetchUsers();
    }, []);

    useEffect(() => {
        if (route?.params?.role) {
            setFilterRole(route.params.role);
        }
    }, [route?.params?.role]);

    useEffect(() => {
        filterUsers();
    }, [users, searchQuery, filterRole]);

    const fetchUsers = async () => {
        try {
            const response = await adminAPI.getUsers();
            setUsers(response.data.users || []);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const filterUsers = () => {
        let filtered = users;

        // Filter by role
        if (filterRole !== 'all') {
            filtered = filtered.filter(user => user.role === filterRole);
        }

        // Filter by search query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(user => {
                const name = (user.fullName || user.full_name || user.businessName || user.displayName || '').toLowerCase();
                const email = (user.email || '').toLowerCase();
                const phone = (user.phoneNumber || user.phone_number || '').toLowerCase();
                return name.includes(query) || email.includes(query) || phone.includes(query);
            });
        }

        setFilteredUsers(filtered);
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchUsers();
    };

    const handleSuspendUser = async (userId: string, currentlySuspended: boolean, userName: string) => {
        const action = currentlySuspended ? 'Unsuspend' : 'Suspend';
        confirmAction(
            `${action} User`,
            `Are you sure you want to ${action.toLowerCase()} ${userName}?`,
            async () => {
                try {
                    await adminAPI.suspendUser(userId, !currentlySuspended);
                    const msg = `User ${currentlySuspended ? 'unsuspended' : 'suspended'} successfully`;
                    Alert.alert('Success', msg);
                    fetchUsers();
                } catch (error: any) {
                    const msg = error.response?.data?.message || 'Failed to update user status';
                    Alert.alert('Error', msg);
                }
            },
            action
        );
    };

    const handleDeleteUser = async (userId: string, userName: string) => {
        confirmAction(
            'Delete User',
            `Are you sure you want to permanently delete ${userName}? This action cannot be undone.`,
            async () => {
                try {
                    await adminAPI.deleteUser(userId);
                    const msg = 'User deleted successfully';
                    Alert.alert('Success', msg);
                    fetchUsers();
                } catch (error: any) {
                    const msg = error.response?.data?.message || 'Failed to delete user';
                    Alert.alert('Error', msg);
                }
            },
            'Delete'
        );
    };

    const handleToggleVerified = (userId: string, isCurrentlyVerified: boolean, userName: string) => {
        const action = isCurrentlyVerified ? 'Revoke Verified Badge' : 'Grant Verified Badge';
        confirmAction(
            action,
            `Are you sure you want to ${isCurrentlyVerified ? 'remove the verified badge from' : 'grant a verified badge (QIIRA Gold) to'} ${userName}?`,
            async () => {
                try {
                    await adminAPI.setUserVerified(userId, !isCurrentlyVerified);
                    const msg = `Verified badge ${isCurrentlyVerified ? 'revoked' : 'granted'} successfully`;
                    Alert.alert('Success', msg);
                    fetchUsers();
                } catch (e: any) {
                    const msg = e.response?.data?.message || 'Failed to update verified status';
                    Alert.alert('Error', msg);
                }
            },
            isCurrentlyVerified ? 'Revoke' : 'Grant Badge'
        );
    };

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case 'admin':
                return colors.error;
            case 'vendor':
                return colors.primary;
            case 'client':
                return colors.success;
            default:
                return colors.textSecondary;
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return 'Recent';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Recent';
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const renderUser = ({ item }: { item: any }) => {
        const displayName = item.fullName || item.full_name || item.businessName || item.displayName || (item.email ? item.email.split('@')[0] : 'User');
        const secondaryInfo = item.businessName && item.businessName !== displayName ? `🏢 ${item.businessName}` : null;
        const isAdmin = Boolean(item.role === 'admin' || item.id === 'v8MwaOet0ISfZAWXIDAPAGcg1td2' || item.uid === 'v8MwaOet0ISfZAWXIDAPAGcg1td2' || item.email?.includes('admin'));
        const isVerified = Boolean(item.isVerified || item.is_verified || isAdmin);

        return (
            <View style={styles.userCard}>
                <View style={styles.userHeader}>
                    <View style={styles.userInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={styles.userName}>{displayName}</Text>
                            <VerificationBadgeInline isVerified={isVerified} isAdmin={isAdmin} size={16} />
                        </View>
                        {secondaryInfo ? (
                            <Text style={styles.businessNameText}>{secondaryInfo}</Text>
                        ) : null}
                        <Text style={styles.userEmail}>{item.email}</Text>
                    </View>
                    <View style={styles.badges}>
                        <View style={[styles.roleBadge, { backgroundColor: getRoleBadgeColor(item.role) }]}>
                            <Text style={styles.roleText}>{item.role?.toUpperCase()}</Text>
                        </View>
                        {item.isSuspended && (
                            <View style={[styles.roleBadge, { backgroundColor: colors.warning }]}>
                                <Text style={styles.roleText}>SUSPENDED</Text>
                            </View>
                        )}
                    </View>
                </View>
                <View style={styles.userDetails}>
                    <Text style={styles.detailText}>📞 {item.phoneNumber || item.phone_number || 'N/A'}</Text>
                    <Text style={styles.detailText}>📅 Joined {formatDate(item.createdAt || item.created_at)}</Text>
                </View>

                {/* Action Buttons - Hide for admin users */}
                {item.role !== 'admin' && (
                    <View style={styles.actionButtons}>
                        <TouchableOpacity
                            style={[
                                styles.actionButton,
                                {
                                    backgroundColor: isVerified ? '#B28A4520' : colors.surfaceLight,
                                    borderColor: '#B28A45',
                                    borderWidth: 1
                                }
                            ]}
                            onPress={() => handleToggleVerified(item.id || item.uid, isVerified, displayName)}
                        >
                            <Text style={[styles.actionButtonText, { color: '#B28A45', fontWeight: 'bold' }]}>
                                {isVerified ? '✓ Verified' : '🎖️ Grant Badge'}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionButton, item.isSuspended ? styles.unsuspendButton : styles.suspendButton]}
                            onPress={() => handleSuspendUser(item.id || item.uid, item.isSuspended, displayName)}
                        >
                            <Text style={styles.actionButtonText}>
                                {item.isSuspended ? '✓ Unsuspend' : '⊘ Suspend'}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.deleteButton]}
                            onPress={() => handleDeleteUser(item.id || item.uid, displayName)}
                        >
                            <Text style={styles.actionButtonText}>🗑️ Delete</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    const renderFilterButton = (role: 'all' | 'client' | 'vendor' | 'admin', label: string) => (
        <TouchableOpacity
            style={[
                styles.filterButton,
                filterRole === role && styles.filterButtonActive
            ]}
            onPress={() => setFilterRole(role)}
        >
            <Text style={[
                styles.filterButtonText,
                filterRole === role && styles.filterButtonTextActive
            ]}>
                {label}
            </Text>
        </TouchableOpacity>
    );

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
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>User Management</Text>
                    <Text style={styles.headerSubtitle}>{filteredUsers.length} users</Text>
                </View>
                <TouchableOpacity
                    style={styles.headerButton}
                    onPress={() => confirmAction('Logout', 'Are you sure you want to logout?', () => auth.signOut(), 'Logout')}
                >
                    <Text style={styles.headerButtonText}>🚪 Logout</Text>
                </TouchableOpacity>
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name, business, or email..."
                    placeholderTextColor={colors.textTertiary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
            </View>

            {/* Filter Buttons */}
            <View style={styles.filterContainer}>
                {renderFilterButton('all', 'All')}
                {renderFilterButton('client', 'Clients')}
                {renderFilterButton('vendor', 'Vendors')}
                {renderFilterButton('admin', 'Admins')}
            </View>

            {/* Users List */}
            <FlatList
                data={filteredUsers}
                keyExtractor={(item) => item.id || item.uid || Math.random().toString()}
                renderItem={renderUser}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No users found</Text>
                    </View>
                }
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
    headerButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        paddingHorizontal: SPACING.md,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.sm,
    },
    headerButtonText: {
        color: colors.textInverse,
        fontWeight: 'bold',
        fontSize: FONT_SIZES.xs,
    },
    headerTitle: {
        fontSize: FONT_SIZES.xxl,
        fontWeight: 'bold',
        color: colors.textInverse,
    },
    headerSubtitle: {
        fontSize: FONT_SIZES.sm,
        color: colors.textInverse,
        opacity: 0.8,
        marginTop: 4,
    },
    searchContainer: {
        padding: SPACING.md,
        backgroundColor: colors.surface,
    },
    searchInput: {
        backgroundColor: colors.surfaceLight,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        fontSize: FONT_SIZES.md,
        borderWidth: 1,
        borderColor: colors.border,
        color: colors.textPrimary,
    },
    filterContainer: {
        flexDirection: 'row',
        padding: SPACING.md,
        paddingTop: 0,
        gap: SPACING.sm,
    },
    filterButton: {
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        borderRadius: BORDER_RADIUS.round,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    filterButtonActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    filterButtonText: {
        fontSize: FONT_SIZES.sm,
        color: colors.textSecondary,
        fontWeight: '600',
    },
    filterButtonTextActive: {
        color: colors.textInverse,
    },
    listContent: {
        padding: SPACING.md,
    },
    userCard: {
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.lg,
        padding: SPACING.md,
        marginBottom: SPACING.md,
        ...SHADOWS.small,
    },
    userHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: SPACING.sm,
    },
    userInfo: {
        flex: 1,
        marginRight: SPACING.sm,
    },
    userName: {
        fontSize: FONT_SIZES.lg,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: 2,
    },
    businessNameText: {
        fontSize: FONT_SIZES.sm,
        color: colors.primary,
        fontWeight: '600',
        marginBottom: 2,
    },
    userEmail: {
        fontSize: FONT_SIZES.sm,
        color: colors.textSecondary,
    },
    roleBadge: {
        paddingHorizontal: SPACING.sm,
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.sm,
    },
    roleText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: colors.textInverse,
    },
    userDetails: {
        flexDirection: 'row',
        gap: SPACING.md,
        marginTop: SPACING.xs,
        marginBottom: SPACING.sm,
    },
    badges: {
        flexDirection: 'row',
        gap: SPACING.xs,
    },
    detailText: {
        fontSize: FONT_SIZES.xs,
        color: colors.textSecondary,
    },
    emptyContainer: {
        padding: SPACING.xl,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: FONT_SIZES.md,
        color: colors.textTertiary,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: SPACING.sm,
        marginTop: SPACING.sm,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: SPACING.sm,
    },
    actionButton: {
        flex: 1,
        paddingVertical: SPACING.sm,
        paddingHorizontal: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        alignItems: 'center',
    },
    suspendButton: {
        backgroundColor: colors.warning,
    },
    unsuspendButton: {
        backgroundColor: colors.success,
    },
    deleteButton: {
        backgroundColor: colors.error,
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontSize: FONT_SIZES.sm,
        fontWeight: 'bold',
    },
});
};
