import React, { useState, useCallback, useEffect } from 'react';
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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import supabase from '../config/supabase';
import { chatAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { PLACEHOLDER_AVATARS } from '../assets';
import { VerificationBadgeInline, AvatarVerificationBadge } from '../components/VerificationBadge';

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

export default function ConversationsScreen({ navigation }: any) {
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const { user } = useAuthStore();
    const { readTimestamps, markAsRead, refreshUnreadCount, loadReadTimestamps } = useChatStore();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

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

    const renderConversation = ({ item }: { item: Conversation }) => {
        const { otherId, otherName, otherImage, isVerified, isAdmin } = getOtherParticipant(item);
        const unread = isConversationUnread(item);

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
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Messages</Text>
            </View>

            {conversations.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>💬</Text>
                    <Text style={styles.emptyText}>No conversations yet</Text>
                    <Text style={styles.emptySubtext}>
                        Start chatting with vendors from their profile page
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={conversations}
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
