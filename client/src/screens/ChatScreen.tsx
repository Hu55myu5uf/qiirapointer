import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import supabase from '../config/supabase';
import { chatAPI, vendorAPI, authAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { PLACEHOLDER_AVATARS } from '../assets';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallStore } from '../store/callStore';
import { VerificationBadgeInline, AvatarVerificationBadge } from '../components/VerificationBadge';

interface Message {
    id: string;
    senderId: string;
    text: string;
    createdAt: any;
}

interface ChatScreenParams {
    conversationId?: string;
    otherUserId?: string;
    receiverId?: string;
    userId?: string;
    vendorId?: string;
    targetUserId?: string;
    otherUserName?: string;
    receiverName?: string;
    userName?: string;
    businessName?: string;
    otherUserImage?: string;
    receiverImage?: string;
    userImage?: string;
    businessImage?: string;
    initialMessage?: string;
    isVerified?: boolean;
    isAdmin?: boolean;
}

export default function ChatScreen({ route, navigation }: any) {
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const { user } = useAuthStore();
    const params = ((route && route.params) || {}) as any;
    const existingConvId = params.conversationId || '';
    const rawOtherUserId = params.otherUserId || params.receiverId || params.userId || params.vendorId || params.targetUserId || '';
    const otherUserId = rawOtherUserId || (existingConvId && user ? existingConvId.split('_').find((id: string) => id !== user.uid) : '') || '';
    const initialOtherUserName = params.otherUserName || params.receiverName || params.userName || params.businessName || '';
    const initialOtherUserImage = params.otherUserImage || params.receiverImage || params.userImage || params.businessImage || '';
    const initialIsVerified = Boolean(params.isVerified || params.is_verified);
    const initialIsAdmin = Boolean(params.isAdmin || params.role === 'admin' || otherUserId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2');
    const { markAsRead, refreshUnreadCount } = useChatStore();
    const { startCall } = useCallStore();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState(params.initialMessage || '');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [conversationId, setConversationId] = useState(existingConvId || '');
    const isActuallyAdmin = Boolean(initialIsAdmin || otherUserId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2' || initialOtherUserName?.toLowerCase().includes('admin'));
    const [otherUserName, setOtherUserName] = useState(initialOtherUserName || 'Chat');
    const [otherUserImage, setOtherUserImage] = useState(initialOtherUserImage || '');
    const [otherUserIsVerified, setOtherUserIsVerified] = useState(Boolean(initialIsVerified || isActuallyAdmin));
    const [otherUserIsAdmin, setOtherUserIsAdmin] = useState(isActuallyAdmin);
    const [headerImageError, setHeaderImageError] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    const handleInitiateCall = async (callType: 'voice' | 'video') => {
        if (!user || !otherUserId) return;
        try {
            const call = await startCall({
                callerId: user.uid,
                callerName: user.displayName || user.email?.split('@')[0] || 'User',
                callerAvatar: user.photoURL || '',
                receiverId: otherUserId,
                receiverName: otherUserName,
                receiverAvatar: otherUserImage,
                callType,
            });
            navigation.navigate('CallScreen', {
                callId: call.id,
                callType,
                otherUserId,
                otherUserName,
                otherUserAvatar: otherUserImage,
                isVerified: otherUserIsVerified,
                isAdmin: otherUserIsAdmin,
                isIncoming: false,
            });
        } catch (error) {
            console.error('Error starting call:', error);
        }
    };

    // Reset state and fetch latest live name and avatar when target user changes
    useEffect(() => {
        if (!otherUserId) return;

        setOtherUserName(initialOtherUserName || 'Chat');
        setOtherUserImage(initialOtherUserImage || '');
        setOtherUserIsVerified(Boolean(initialIsVerified || isActuallyAdmin));
        setOtherUserIsAdmin(isActuallyAdmin);
        setMessages([]);
        setLoading(true);

        if (otherUserId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2') {
            setOtherUserIsAdmin(true);
            setOtherUserIsVerified(true);
        }
        setHeaderImageError(false);
        vendorAPI
            .getById(otherUserId)
            .then((res) => {
                const v = res.data?.vendor;
                if (v?.businessImage || v?.business_image) {
                    setOtherUserImage(v.businessImage || v.business_image);
                }
                if (v?.businessName || v?.business_name) {
                    setOtherUserName(v.businessName || v.business_name);
                }
                if (v?.isVerified || v?.is_verified || v?.userInfo?.isVerified || v?.isAdmin || v?.role === 'admin' || otherUserId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2') {
                    setOtherUserIsVerified(true);
                }
                if (v?.isAdmin || v?.userInfo?.role === 'admin' || v?.role === 'admin' || otherUserId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2') {
                    setOtherUserIsAdmin(true);
                }
            })
            .catch(() => {
                authAPI
                    .getUser(otherUserId)
                    .then((res) => {
                        const u = res.data?.user;
                        if (u?.profileImage || u?.profile_image) {
                            setOtherUserImage(u.profileImage || u.profile_image);
                        }
                        const name = u?.fullName || u?.full_name || u?.displayName;
                        if (name) {
                            setOtherUserName(name);
                        }
                        if (u?.isVerified || u?.is_verified || u?.role === 'admin' || u?.isAdmin || otherUserId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2') {
                            setOtherUserIsVerified(true);
                        }
                        if (u?.role === 'admin' || u?.isAdmin || otherUserId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2') {
                            setOtherUserIsAdmin(true);
                        }
                    })
                    .catch(() => {});
            });
    }, [otherUserId]);

    const headerAvatarSource =
        otherUserImage && !headerImageError ? { uri: otherUserImage } : PLACEHOLDER_AVATARS.vendor;

    useEffect(() => {
        navigation.setOptions({
            headerTitle: () => (
                <TouchableOpacity
                    onPress={() => {
                        if (otherUserId) {
                            navigation.navigate('UserProfileView', {
                                userId: otherUserId,
                                userName: otherUserName,
                                userImage: otherUserImage,
                            });
                        }
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center' }}
                    activeOpacity={0.7}
                >
                    <View style={{ position: 'relative', marginRight: 10 }}>
                        <Image
                            source={headerAvatarSource}
                            onError={() => setHeaderImageError(true)}
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 18,
                                backgroundColor: 'rgba(255,255,255,0.2)',
                            }}
                        />
                        <AvatarVerificationBadge isVerified={otherUserIsVerified} isAdmin={otherUserIsAdmin} size={14} />
                    </View>
                    <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text
                                style={{
                                    color: colors.textInverse,
                                    fontWeight: 'bold',
                                    fontSize: 16,
                                }}
                                numberOfLines={1}
                            >
                                {otherUserName || 'Chat'}
                            </Text>
                            <VerificationBadgeInline isVerified={otherUserIsVerified} isAdmin={otherUserIsAdmin} size={16} />
                        </View>
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                            Tap to view profile ↗
                        </Text>
                    </View>
                </TouchableOpacity>
            ),
            headerRight: () => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginRight: 16 }}>
                    <TouchableOpacity
                        onPress={() => handleInitiateCall('voice')}
                        style={{ padding: 6 }}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="call-outline" size={22} color={colors.textInverse} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => handleInitiateCall('video')}
                        style={{ padding: 6 }}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="videocam-outline" size={24} color={colors.textInverse} />
                    </TouchableOpacity>
                </View>
            ),
        });
    }, [navigation, otherUserId, otherUserName, otherUserImage, headerAvatarSource, colors, user]);

    const fetchMessages = useCallback(async (convId: string, showSpinner = false) => {
        if (!convId) return;
        if (showSpinner) setLoading(true);
        try {
            const response = await chatAPI.getMessages(convId);
            const serverMsgs: Message[] = response.data.messages || [];

            setMessages((prev) => {
                // Keep any optimistic messages that haven't appeared in server response yet
                const pendingOptimistic = prev.filter(
                    (p) => p.id.startsWith('temp-') && !serverMsgs.some((s) => s.text === p.text && s.senderId === p.senderId)
                );
                return [...serverMsgs, ...pendingOptimistic];
            });
        } catch (error) {
            console.error('Error fetching messages:', error);
        } finally {
            if (showSpinner) setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!user) return;

        const convId = existingConvId || (otherUserId ? [user.uid, otherUserId].sort().join('_') : '');
        if (!convId) {
            setLoading(false);
            return;
        }

        setConversationId(convId);

        markAsRead(convId);
        refreshUnreadCount(user.uid);

        fetchMessages(convId, true);

        // Polling fallback every 3 seconds for instant updates even without websockets in Expo Go
        const pollInterval = setInterval(() => {
            fetchMessages(convId, false);
            markAsRead(convId);
        }, 3000);

        // Realtime subscription
        const channel = supabase
            .channel(`messages-${convId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `conversation_id=eq.${convId}`,
                },
                (payload) => {
                    const newMsg: Message = {
                        id: payload.new.id,
                        senderId: payload.new.sender_id,
                        text: payload.new.text,
                        createdAt: payload.new.created_at,
                    };
                    setMessages((prev) => {
                        // If this matches an optimistic message, replace it cleanly
                        const hasTemp = prev.some((m) => m.id.startsWith('temp-') && m.text === newMsg.text && m.senderId === newMsg.senderId);
                        if (hasTemp) {
                            return prev.map((m) =>
                                m.id.startsWith('temp-') && m.text === newMsg.text && m.senderId === newMsg.senderId ? newMsg : m
                            );
                        }
                        if (prev.some((m) => m.id === newMsg.id)) return prev;
                        return [...prev, newMsg];
                    });
                    markAsRead(convId);
                }
            )
            .subscribe();

        return () => {
            clearInterval(pollInterval);
            supabase.removeChannel(channel);
            if (user) {
                refreshUnreadCount(user.uid);
            }
        };
    }, [user, otherUserId, existingConvId, fetchMessages, markAsRead, refreshUnreadCount]);

    const sendMessage = async () => {
        if (!newMessage.trim() || !user || sending) return;

        const text = newMessage.trim();
        const effectiveReceiverId = otherUserId || (conversationId && user ? conversationId.split('_').find((id: string) => id !== user.uid) : '') || '';
        const convId = conversationId || [user.uid, effectiveReceiverId].sort().join('_');
        setNewMessage('');
        setSending(true);

        // Optimistic local message update so it shows instantly without delay
        const tempId = 'temp-' + Date.now();
        const optimisticMsg: Message = {
            id: tempId,
            senderId: user.uid,
            text,
            createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, optimisticMsg]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

        try {
            const response = await chatAPI.sendMessage({
                conversationId: convId,
                senderId: user.uid,
                receiverId: effectiveReceiverId,
                text,
                receiverName: otherUserName,
                receiverImage: otherUserImage,
                senderImage: user.photoURL || undefined,
            });

            if (response?.data?.data) {
                const savedMsg = response.data.data;
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === tempId
                            ? {
                                  id: savedMsg.id,
                                  senderId: savedMsg.senderId,
                                  text: savedMsg.text,
                                  createdAt: savedMsg.createdAt,
                              }
                            : m
                    )
                );
            }
            markAsRead(convId);
        } catch (error) {
            console.error('Error sending message:', error);
            // Revert optimistic message on error
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
            setNewMessage(text);
        } finally {
            setSending(false);
        }
    };

    const renderMessage = ({ item }: { item: Message }) => {
        const isOwnMessage = item.senderId === user?.uid;
        return (
            <View
                style={[
                    styles.messageRow,
                    isOwnMessage ? styles.ownMessageRow : styles.otherMessageRow,
                ]}
            >
                {!isOwnMessage && (
                    <TouchableOpacity
                        onPress={() => {
                            if (otherUserId) {
                                navigation.navigate('UserProfileView', {
                                    userId: otherUserId,
                                    userName: otherUserName,
                                    userImage: otherUserImage,
                                });
                            }
                        }}
                        activeOpacity={0.7}
                    >
                        <Image
                            source={headerAvatarSource}
                            style={styles.messageAvatar}
                        />
                    </TouchableOpacity>
                )}
                <View
                    style={[
                        styles.messageBubble,
                        isOwnMessage ? styles.ownMessage : styles.otherMessage,
                    ]}
                >
                    <Text
                        style={[
                            styles.messageText,
                            isOwnMessage ? styles.ownMessageText : styles.otherMessageText,
                        ]}
                    >
                        {item.text}
                    </Text>
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
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <KeyboardAvoidingView
                style={styles.keyboardView}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                {messages.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No messages yet</Text>
                        <Text style={styles.emptySubtext}>Start the conversation!</Text>
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        keyExtractor={(item) => item.id}
                        renderItem={renderMessage}
                        contentContainerStyle={styles.messagesList}
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                        keyboardShouldPersistTaps="handled"
                    />
                )}

                {/* Message Input */}
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.textInput}
                        value={newMessage}
                        onChangeText={setNewMessage}
                        placeholder="Type a message..."
                        placeholderTextColor={colors.textTertiary}
                        multiline
                        maxLength={500}
                        editable={!sending}
                    />
                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            (!newMessage.trim() || sending) && styles.sendButtonDisabled,
                        ]}
                        onPress={sendMessage}
                        disabled={!newMessage.trim() || sending}
                    >
                        {sending ? (
                            <ActivityIndicator size="small" color={colors.textInverse} />
                        ) : (
                            <Text style={styles.sendButtonText}>➤</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const getStyles = (colors: any) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        keyboardView: {
            flex: 1,
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
        },
        emptyText: {
            fontSize: FONT_SIZES.lg,
            color: colors.textSecondary,
        },
        emptySubtext: {
            fontSize: FONT_SIZES.sm,
            color: colors.textTertiary,
            marginTop: SPACING.xs,
        },
        messagesList: {
            padding: SPACING.md,
            flexGrow: 1,
        },
        messageRow: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            marginBottom: SPACING.sm,
        },
        ownMessageRow: {
            justifyContent: 'flex-end',
        },
        otherMessageRow: {
            justifyContent: 'flex-start',
        },
        messageAvatar: {
            width: 32,
            height: 32,
            borderRadius: 16,
            marginRight: 8,
            marginBottom: 2,
            backgroundColor: colors.surfaceLight,
        },
        messageBubble: {
            maxWidth: '75%',
            padding: SPACING.md,
            borderRadius: BORDER_RADIUS.lg,
        },
        ownMessage: {
            alignSelf: 'flex-end',
            backgroundColor: colors.primary,
            borderBottomRightRadius: SPACING.xs,
        },
        otherMessage: {
            alignSelf: 'flex-start',
            backgroundColor: colors.surface,
            borderBottomLeftRadius: SPACING.xs,
            borderWidth: 1,
            borderColor: colors.border,
        },
        messageText: {
            fontSize: FONT_SIZES.md,
        },
        ownMessageText: {
            color: colors.textInverse,
        },
        otherMessageText: {
            color: colors.textPrimary,
        },
        inputContainer: {
            flexDirection: 'row',
            padding: SPACING.md,
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            alignItems: 'center',
        },
        textInput: {
            flex: 1,
            backgroundColor: colors.background,
            borderRadius: BORDER_RADIUS.round,
            paddingHorizontal: SPACING.md,
            paddingVertical: Platform.OS === 'ios' ? SPACING.sm : 8,
            fontSize: FONT_SIZES.md,
            color: colors.textPrimary,
            maxHeight: 100,
            marginRight: SPACING.sm,
            borderWidth: 1,
            borderColor: colors.border,
        },
        sendButton: {
            backgroundColor: colors.primary,
            width: 44,
            height: 44,
            borderRadius: 22,
            justifyContent: 'center',
            alignItems: 'center',
        },
        sendButtonDisabled: {
            backgroundColor: colors.textTertiary,
        },
        sendButtonText: {
            color: colors.textInverse,
            fontSize: FONT_SIZES.lg,
        },
    });
