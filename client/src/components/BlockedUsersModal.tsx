import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
    Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { moderationAPI } from '../services/api';

interface BlockedUsersModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function BlockedUsersModal({ visible, onClose }: BlockedUsersModalProps) {
    const { colors } = useTheme();
    const [blockedList, setBlockedList] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    const fetchBlocked = async () => {
        setLoading(true);
        try {
            const res = await moderationAPI.getBlockedUsers();
            setBlockedList(res.data?.blocked || []);
        } catch (e: any) {
            console.error('Fetch blocked users error:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (visible) {
            fetchBlocked();
        }
    }, [visible]);

    const handleUnblock = (user: any) => {
        Alert.alert(
            'Unblock User',
            `Are you sure you want to unblock ${user.blockedUserName || 'this user'}? You will be able to see their content and receive messages again.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Unblock',
                    onPress: async () => {
                        const targetId = user.blockedUserId || user.id;
                        setActionLoadingId(targetId);
                        try {
                            await moderationAPI.unblockUser(targetId);
                            setBlockedList(prev => prev.filter(item => (item.blockedUserId || item.id) !== targetId));
                            Alert.alert('Unblocked', `${user.blockedUserName || 'User'} has been unblocked.`);
                        } catch (err: any) {
                            Alert.alert('Error', err.response?.data?.message || 'Failed to unblock user.');
                        } finally {
                            setActionLoadingId(null);
                        }
                    }
                }
            ]
        );
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={[styles.container, { backgroundColor: colors.surface }]}>
                    <View style={[styles.header, { borderBottomColor: colors.border }]}>
                        <View style={styles.titleRow}>
                            <Ionicons name="ban-outline" size={22} color="#B28A45" style={{ marginRight: 8 }} />
                            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                                Blocked Users
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close" size={24} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {loading ? (
                        <View style={styles.centered}>
                            <ActivityIndicator size="small" color="#B28A45" />
                        </View>
                    ) : blockedList.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <Ionicons name="checkmark-circle-outline" size={48} color={colors.textTertiary} />
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                You haven't blocked any users.
                            </Text>
                        </View>
                    ) : (
                        <FlatList
                            data={blockedList}
                            keyExtractor={(item) => item.blockedUserId || item.id || String(Math.random())}
                            contentContainerStyle={styles.list}
                            renderItem={({ item }) => (
                                <View style={[styles.userRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                                    <View style={styles.userInfo}>
                                        <View style={[styles.avatarPlaceholder, { backgroundColor: '#B28A45' }]}>
                                            <Ionicons name="person" size={16} color="#FFFFFF" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.userName, { color: colors.textPrimary }]} numberOfLines={1}>
                                                {item.blockedUserName || 'Blocked User'}
                                            </Text>
                                            <Text style={[styles.userSub, { color: colors.textTertiary }]}>
                                                ID: {(item.blockedUserId || item.id || '').slice(0, 12)}...
                                            </Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity
                                        style={[styles.unblockBtn, { borderColor: colors.border }]}
                                        onPress={() => handleUnblock(item)}
                                        disabled={actionLoadingId === (item.blockedUserId || item.id)}
                                    >
                                        {actionLoadingId === (item.blockedUserId || item.id) ? (
                                            <ActivityIndicator size="small" color="#B28A45" />
                                        ) : (
                                            <Text style={[styles.unblockBtnText, { color: '#B28A45' }]}>Unblock</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            )}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    container: {
        maxHeight: '75%',
        minHeight: '40%',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 24,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.md,
        borderBottomWidth: 1,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: FONT_SIZES.lg,
        fontWeight: 'bold',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: SPACING.xl,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACING.xl,
        gap: SPACING.sm,
    },
    emptyText: {
        fontSize: FONT_SIZES.sm,
        textAlign: 'center',
    },
    list: {
        padding: SPACING.lg,
        gap: SPACING.sm,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: SPACING.sm,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        marginBottom: 8,
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: SPACING.sm,
    },
    avatarPlaceholder: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: SPACING.sm,
    },
    userName: {
        fontSize: FONT_SIZES.sm,
        fontWeight: '600',
    },
    userSub: {
        fontSize: FONT_SIZES.xs,
        marginTop: 2,
    },
    unblockBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.sm,
        borderWidth: 1,
    },
    unblockBtnText: {
        fontSize: FONT_SIZES.xs,
        fontWeight: 'bold',
    },
});
