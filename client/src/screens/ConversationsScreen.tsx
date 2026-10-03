import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
    Image,
    Platform,
    StatusBar,
    ScrollView,
    Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import supabase from '../config/supabase';
import { chatAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { PLACEHOLDER_AVATARS } from '../assets';
import { VerificationBadgeInline, AvatarVerificationBadge } from '../components/VerificationBadge';
import TabSwipeHandler from '../components/TabSwipeHandler';
import Ionicons from '@expo/vector-icons/Ionicons';

interface Conversation {
    id: string;
    participants: string[];
    participantNames: Record<string, string>;
    participantImages?: Record<string, string>;
    participantVerified?: Record<string, boolean>;
    participantIsAdmin?: Record<string, boolean>;
    lastMessage: string;
    lastMessageAt: any;
}

type ChatCategory = 'all' | 'unread' | 'read' | 'archived';

export default function ConversationsScreen({ navigation }: any) {
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const { user } = useAuthStore();
    const { readTimestamps, markAsRead, refreshUnreadCount, loadReadTimestamps } = useChatStore();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeCategory, setActiveCategory] = useState<ChatCategory>('all');
    const [archivedIds, setArchivedIds] = useState<string[]>([]);

    useEffect(() => {
        if (!user?.uid) return;
        AsyncStorage.getItem(`@qiira_archived_chats_${user.uid}`).then((stored) => {
            if (stored) {
                try {
                    setArchivedIds(JSON.parse(stored));
                } catch (_) {}
            }
        });
    }, [user?.uid]);

    const toggleArchive = async (convId: string) => {
        if (!user?.uid) return;
        const isArchived = archivedIds.includes(convId);
        const next = isArchived ? archivedIds.filter((id) => id !== convId) : [...archivedIds, convId];
        setArchivedIds(next);
        await AsyncStorage.setItem(`@qiira_archived_chats_${user.uid}`, JSON.stringify(next));
    };

    useEffect(() => {
        loadReadTimestamps();
    }, [loadReadTimestamps]);

    const fetchConversations = useCallback(async (showLoading = false) => {
        if (!user) return;
        if (showLoading) setLoading(true);
        try {
            const response = await chatAPI.getConversations(user.uid);
            const convs = response.data.conversations || [];
            setConversations(convs);
            refreshUnreadCount(user.uid);
        } catch (error) {
            console.error('Error fetching conversations:', error);
        } finally {
            if (showLoading) setLoading(false);
            setRefreshing(false);
        }
    }, [user, refreshUnreadCount]);

    // Refetch conversations every time the Messages tab is focused
    useFocusEffect(
        useCallback(() => {
            fetchConversations(conversations.length === 0);

            const interval = setInterval(() => {
                fetchConversations(false);
            }, 5000);

            // Subscribe to changes on conversations for the active user
            const channel = supabase
                .channel('conversations-channel')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'conversations',
                    },
                    () => {
                        fetchConversations(false);
                    }
                )
                .subscribe();

            return () => {
                clearInterval(interval);
                supabase.removeChannel(channel);
            };
        }, [fetchConversations, conversations.length])
    );

    const onRefresh = () => {
        setRefreshing(true);
        fetchConversations(false);
    };

    const [avatarErrors, setAvatarErrors] = useState<Record<string, boolean>>({});

    const getOtherParticipant = (conv: Conversation) => {
        let otherId = conv.participants?.find((p) => p && p !== user?.uid) || '';
        if (!otherId && conv.id) {
            otherId = conv.id.split('_').find((p) => p && p !== user?.uid) || '';
        }
        let otherName = conv.participantNames?.[otherId];
        let otherImage = conv.participantImages?.[otherId];
        let isVerified = Boolean(conv.participantVerified?.[otherId]);
        let isAdmin = Boolean(conv.participantIsAdmin?.[otherId]);
        
        if (!otherName) {
            const otherKey = Object.keys(conv.participantNames || {}).find(k => k !== user?.uid);
            otherName = otherKey ? conv.participantNames[otherKey] : 'User';
            if (!otherImage && otherKey) otherImage = conv.participantImages?.[otherKey];
            if (otherKey) {
                isVerified = Boolean(conv.participantVerified?.[otherKey]);
                isAdmin = Boolean(conv.participantIsAdmin?.[otherKey]);
            }
        }

        if (!otherImage) {
            const otherImgKey = Object.keys(conv.participantImages || {}).find(k => k !== user?.uid);
            if (otherImgKey) otherImage = conv.participantImages?.[otherImgKey];
        }

        if (otherId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2' || otherName?.toLowerCase().includes('admin')) {
            isAdmin = true;
            isVerified = true;
        }

        return { otherId, otherName: otherName || 'User', otherImage: otherImage || '', isVerified, isAdmin };
    };

    const isConversationUnread = (conv: Conversation) => {
        if (!conv.lastMessageAt) return false;
        const lastRead = readTimestamps[conv.id];
        if (!lastRead) return true;
        const lastMsgTime = new Date(conv.lastMessageAt).getTime();
        const readTime = new Date(lastRead).getTime();
        return lastMsgTime > readTime + 1000;
    };

    const formatTime = (timestamp: any) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return '';
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return date.toLocaleDateString([], { weekday: 'short' });
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const archivedSet = useMemo(() => new Set(archivedIds), [archivedIds]);
    const activeChats = useMemo(() => conversations.filter((c) => !archivedSet.has(c.id)), [conversations, archivedSet]);
    const archivedChats = useMemo(() => conversations.filter((c) => archivedSet.has(c.id)), [conversations, archivedSet]);
    const unreadChats = useMemo(() => activeChats.filter((c) => isConversationUnread(c)), [activeChats, readTimestamps]);
    const readChats = useMemo(() => activeChats.filter((c) => !isConversationUnread(c)), [activeChats, readTimestamps]);

    const displayConversations = useMemo(() => {
        if (activeCategory === 'archived') return archivedChats;
        if (activeCategory === 'unread') return unreadChats;
        if (activeCategory === 'read') return readChats;
        return activeChats;
    }, [activeCategory, archivedChats, unreadChats, readChats, activeChats]);

    const renderConversation = ({ item }: { item: Conversation }) => {
        const { otherId, otherName, otherImage, isVerified, isAdmin } = getOtherParticipant(item);
        const unread = isConversationUnread(item);
        const isArchived = archivedSet.has(item.id);

        return (
            <TouchableOpacity
                style={[styles.conversationItem, unread && styles.conversationItemUnread]}
                onPress={() => {
                    markAsRead(item.id);
                    navigation.navigate('Chat', {
                        conversationId: item.id,
                        otherUserId: otherId,
                        otherUserName: otherName,
                        otherUserImage: otherImage,
                        isVerified,
                        isAdmin,
                    });
                }}
                onLongPress={() => {
                    Alert.alert(
                        otherName,
                        'Manage Conversation',
                        [
                            {
                                text: isArchived ? '📥 Unarchive Chat' : '📦 Archive Chat',
                                onPress: () => toggleArchive(item.id),
                            },
                            {
                                text: unread ? '✓ Mark as Read' : '✉ Mark as Unread',
                                onPress: () => {
                                    if (unread) {
                                        markAsRead(item.id);
                                    } else {
                                        useChatStore.setState((state) => {
                                            const updated = { ...state.readTimestamps };
                                            delete updated[item.id];
                                            return { readTimestamps: updated };
                                        });
                                    }
                                },
                            },
                            { text: 'Cancel', style: 'cancel' },
                        ]
                    );
                }}
                activeOpacity={0.7}
            >
                <View style={{ position: 'relative', marginRight: SPACING.md }}>
                    <View style={styles.avatarContainer}>
                        <Image
                            source={otherImage && !avatarErrors[item.id] ? { uri: otherImage } : PLACEHOLDER_AVATARS.vendor}
                            style={styles.avatarImage}
                            onError={() => setAvatarErrors((prev) => ({ ...prev, [item.id]: true }))}
                        />
                    </View>
                    <AvatarVerificationBadge isVerified={isVerified} isAdmin={isAdmin} size={16} />
                    {unread && <View style={styles.unreadDot} />}
                </View>
                <View style={styles.conversationContent}>
                    <View style={styles.conversationHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                            <Text style={[styles.participantName, unread && styles.participantNameUnread]} numberOfLines={1}>
                                {otherName}
                            </Text>
                            <VerificationBadgeInline isVerified={isVerified} isAdmin={isAdmin} size={16} />
                        </View>
                        <Text style={[styles.timeText, unread && styles.timeTextUnread]}>
                            {formatTime(item.lastMessageAt)}
                        </Text>
                    </View>
                    <Text style={[styles.lastMessage, unread && styles.lastMessageUnread]} numberOfLines={1}>
                        {item.lastMessage || 'No messages yet'}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    if (loading && conversations.length === 0) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <TabSwipeHandler currentTab="Messages" navigation={navigation}>
            <View style={styles.container}>
                <View style={styles.header}>
                <Text style={styles.headerTitle}>Messages</Text>
            </View>

            {/* Top Category Tabs: All chats, Unread, Read, Archived */}
            <View style={styles.categoryBar}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryContent}>
                    {[
                        { key: 'all', label: 'All chats', count: activeChats.length },
                        { key: 'unread', label: 'Unread', count: unreadChats.length },
                        { key: 'read', label: 'Read', count: readChats.length },
                        { key: 'archived', label: 'Archived', count: archivedChats.length },
                    ].map((tab) => {
                        const isActive = activeCategory === tab.key;
                        return (
                            <TouchableOpacity
                                key={tab.key}
                                style={[styles.categoryPill, isActive && styles.categoryPillActive]}
                                onPress={() => setActiveCategory(tab.key as ChatCategory)}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.categoryPillText, isActive && styles.categoryPillTextActive]}>
                                    {tab.label}
                                </Text>
                                {tab.count > 0 ? (
                                    <View style={[styles.categoryBadge, isActive && styles.categoryBadgeActive]}>
                                        <Text style={[styles.categoryBadgeText, isActive && styles.categoryBadgeTextActive]}>
                                            {tab.count}
                                        </Text>
                                    </View>
                                ) : null}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* Pinned Official Support Tile */}
            {activeCategory === 'all' && (
                <TouchableOpacity
                    style={styles.pinnedSupportCard}
                    onPress={() =>
                        navigation.navigate('Chat', {
                            otherUserId: 'qiira_official_support',
                            otherUserName: 'QIIRA Customer Support',
                            otherUserImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500',
                            receiverId: 'qiira_official_support',
                            receiverName: 'QIIRA Customer Support',
                            receiverImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500',
                            isSupport: true,
                        })
                    }
                    activeOpacity={0.8}
                >
                    <View style={styles.pinnedSupportAvatarContainer}>
                        <Image
                            source={{ uri: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500' }}
                            style={styles.pinnedSupportAvatar}
                        />
                        <View style={styles.pinnedSupportBadge}>
                            <Ionicons name="headset" size={10} color="#FFFFFF" />
                        </View>
                    </View>

                    <View style={styles.pinnedSupportTextContainer}>
                        <View style={styles.pinnedSupportHeaderRow}>
                            <Text style={styles.pinnedSupportTitle}>QIIRA Customer Support</Text>
                            <View style={styles.officialPill}>
                                <Text style={styles.officialPillText}>OFFICIAL</Text>
                            </View>
                        </View>
                        <Text style={styles.pinnedSupportSubtitle} numberOfLines={1}>
                            Need assistance? Chat 24/7 with QIIRA Care
                        </Text>
                    </View>

                    <View style={styles.pinnedSupportAction}>
                        <Ionicons name="chatbubble-ellipses" size={20} color={colors.primary} />
                    </View>
                </TouchableOpacity>
            )}

            {displayConversations.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>
                        {activeCategory === 'archived' ? '📦' : activeCategory === 'unread' ? '✉️' : '💬'}
                    </Text>
                    <Text style={styles.emptyText}>
                        {activeCategory === 'archived' ? 'No archived chats' : activeCategory === 'unread' ? 'No unread messages' : activeCategory === 'read' ? 'No read messages' : 'No conversations yet'}
                    </Text>
                    <Text style={styles.emptySubtext}>
                        {activeCategory === 'archived' ? 'Long press any conversation to archive it' : 'Start chatting with vendors and clients'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={displayConversations}
                    keyExtractor={(item) => item.id}
                    renderItem={renderConversation}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            colors={[colors.primary]}
                            tintColor={colors.primary}
                        />
                    }
                />
            )}
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
        header: {
            padding: SPACING.lg,
            paddingTop: statusBarHeight + SPACING.sm,
            backgroundColor: colors.primary,
        },
        headerTitle: {
            fontSize: FONT_SIZES.xxl,
            fontWeight: 'bold',
            color: colors.textInverse,
        },
        categoryBar: {
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingVertical: SPACING.sm,
        },
        categoryContent: {
            paddingHorizontal: SPACING.md,
            gap: SPACING.sm,
            flexDirection: 'row',
            alignItems: 'center',
        },
        categoryPill: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 7,
            paddingHorizontal: SPACING.md,
            borderRadius: BORDER_RADIUS.round,
            backgroundColor: colors.surfaceLight,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 6,
        },
        categoryPillActive: {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
        },
        pinnedSupportCard: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            marginHorizontal: SPACING.md,
            marginTop: SPACING.sm,
            marginBottom: SPACING.xs,
            padding: SPACING.md,
            borderRadius: BORDER_RADIUS.lg,
            borderWidth: 1.5,
            borderColor: colors.primary,
            ...SHADOWS.small,
        },
        pinnedSupportAvatarContainer: {
            position: 'relative',
            marginRight: SPACING.md,
        },
        pinnedSupportAvatar: {
            width: 46,
            height: 46,
            borderRadius: 23,
            borderWidth: 2,
            borderColor: colors.primary,
        },
        pinnedSupportBadge: {
            position: 'absolute',
            bottom: -2,
            right: -2,
            backgroundColor: colors.primary,
            width: 18,
            height: 18,
            borderRadius: 9,
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 1.5,
            borderColor: colors.surface,
        },
        pinnedSupportTextContainer: {
            flex: 1,
        },
        pinnedSupportHeaderRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 2,
        },
        pinnedSupportTitle: {
            fontSize: FONT_SIZES.sm,
            fontWeight: '800',
            color: colors.textPrimary,
        },
        officialPill: {
            backgroundColor: 'rgba(178, 138, 69, 0.18)',
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderRadius: BORDER_RADIUS.round,
        },
        officialPillText: {
            fontSize: 9,
            fontWeight: '800',
            color: colors.primary,
            letterSpacing: 0.5,
        },
        pinnedSupportSubtitle: {
            fontSize: FONT_SIZES.xs,
            color: colors.textSecondary,
        },
        pinnedSupportAction: {
            padding: SPACING.xs,
        },
        categoryPillText: {
            fontSize: FONT_SIZES.sm,
            fontWeight: '600',
            color: colors.textSecondary,
        },
        categoryPillTextActive: {
            color: colors.textInverse,
            fontWeight: 'bold',
        },
        categoryBadge: {
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderRadius: 10,
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
        },
        categoryBadgeActive: {
            backgroundColor: colors.textInverse,
        },
        categoryBadgeText: {
            fontSize: 10,
            fontWeight: '700',
            color: colors.textSecondary,
        },
        categoryBadgeTextActive: {
            color: colors.primary,
        },
        loadingContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
        emptyContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: SPACING.xl,
        },
        emptyIcon: {
            fontSize: 48,
            marginBottom: SPACING.md,
        },
        emptyText: {
            fontSize: FONT_SIZES.lg,
            fontWeight: '600',
            color: colors.textSecondary,
        },
        emptySubtext: {
            fontSize: FONT_SIZES.sm,
            color: colors.textTertiary,
            textAlign: 'center',
            marginTop: SPACING.xs,
        },
        listContent: {
            padding: SPACING.md,
        },
        conversationItem: {
            flexDirection: 'row',
            padding: SPACING.md,
            backgroundColor: colors.surface,
            borderRadius: BORDER_RADIUS.md,
            marginBottom: SPACING.sm,
            ...SHADOWS.small,
        },
        avatarContainer: {
            width: 50,
            height: 50,
            borderRadius: 25,
            backgroundColor: colors.primaryLight,
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'hidden',
        },
        avatarImage: {
            width: 50,
            height: 50,
            borderRadius: 25,
        },
        avatarText: {
            color: colors.textInverse,
            fontSize: FONT_SIZES.lg,
            fontWeight: 'bold',
        },
        conversationContent: {
            flex: 1,
            justifyContent: 'center',
        },
        conversationHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: SPACING.xs,
        },
        participantName: {
            fontSize: FONT_SIZES.md,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        participantNameUnread: {
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        timeText: {
            fontSize: FONT_SIZES.xs,
            color: colors.textTertiary,
        },
        timeTextUnread: {
            color: colors.primary,
            fontWeight: 'bold',
        },
        lastMessage: {
            fontSize: FONT_SIZES.sm,
            color: colors.textSecondary,
        },
        lastMessageUnread: {
            color: colors.textPrimary,
            fontWeight: '600',
        },
        conversationItemUnread: {
            borderLeftWidth: 3,
            borderLeftColor: colors.primary,
        },
        unreadDot: {
            position: 'absolute',
            top: 0,
            right: 0,
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: colors.surface,
        },
    });
};
