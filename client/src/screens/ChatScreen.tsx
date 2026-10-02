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
    Animated,
    PanResponder,
    Alert,
    Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
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
import MediaAttachmentModal, { SelectedAttachment } from '../components/MediaAttachmentModal';

interface Message {
    id: string;
    senderId: string;
    text: string;
    createdAt: any;
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'file' | 'document';
    fileName?: string;
    replyTo?: {
        id: string;
        text: string;
        senderName?: string;
        senderId?: string;
    };
    sharedPost?: {
        id: string;
        vendorName: string;
        vendorId?: string;
        caption?: string;
        price?: number;
        currency?: string;
        mediaUrl?: string;
    };
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

// WhatsApp-style Swipe to Reply message component
function SwipeableMessageRow({
    children,
    onReply,
    colors,
}: {
    children: React.ReactNode;
    onReply: () => void;
    colors: any;
}) {
    const panX = useRef(new Animated.Value(0)).current;

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return gestureState.dx > 12 && Math.abs(gestureState.dy) < 14;
            },
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dx > 0) {
                    const translation = Math.min(65, gestureState.dx * 0.7);
                    panX.setValue(translation);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dx > 42) {
                    onReply();
                }
                Animated.spring(panX, {
                    toValue: 0,
                    friction: 7,
                    tension: 50,
                    useNativeDriver: true,
                }).start();
            },
            onPanResponderTerminate: () => {
                Animated.spring(panX, {
                    toValue: 0,
                    friction: 7,
                    tension: 50,
                    useNativeDriver: true,
                }).start();
            },
        })
    ).current;

    const replyIconOpacity = panX.interpolate({
        inputRange: [0, 20, 45],
        outputRange: [0, 0.5, 1],
        extrapolate: 'clamp',
    });

    const replyIconScale = panX.interpolate({
        inputRange: [0, 42, 65],
        outputRange: [0.6, 1, 1.2],
        extrapolate: 'clamp',
    });

    return (
        <View style={{ position: 'relative', width: '100%', justifyContent: 'center' }}>
            {/* WhatsApp reply arrow indicator behind bubble */}
            <Animated.View
                style={{
                    position: 'absolute',
                    left: 10,
                    opacity: replyIconOpacity,
                    transform: [{ scale: replyIconScale }],
                    zIndex: 0,
                }}
            >
                <View
                    style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: colors.primary,
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}
                >
                    <Ionicons name="arrow-undo" size={17} color={colors.textInverse} />
                </View>
            </Animated.View>

            <Animated.View
                {...panResponder.panHandlers}
                style={{
                    transform: [{ translateX: panX }],
                    zIndex: 1,
                }}
            >
                {children}
            </Animated.View>
        </View>
    );
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

    // Reply & Attachment states
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [attachmentModalVisible, setAttachmentModalVisible] = useState(false);
    const [pendingAttachment, setPendingAttachment] = useState<SelectedAttachment | null>(null);

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
            .then((res: any) => {
                const v = res.data?.vendor || res.data;
                if (v?.businessName) {
                    setOtherUserName(v.businessName);
                }
                const img = v?.businessImage || v?.profile_image || v?.image;
                if (img) {
                    setOtherUserImage(img);
                }
                if (v?.isVerified || v?.is_verified) {
                    setOtherUserIsVerified(true);
                }
            })
            .catch(() => {
                authAPI
                    .getUser(otherUserId)
                    .then((res: any) => {
                        const u = res.data?.user || res.data;
                        const img = u?.profileImage || u?.photoURL || u?.avatar;
                        if (img) {
                            setOtherUserImage(img);
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 16 }}>
                    {/* Quick review action directly from chat */}
                    {otherUserId && (
                        <TouchableOpacity
                            onPress={() => navigation.navigate('WriteReview', {
                                vendorId: otherUserId,
                                businessName: otherUserName,
                                isVerified: otherUserIsVerified,
                            })}
                            style={{ padding: 4 }}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="star" size={20} color="#F59E0B" />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        onPress={() => handleInitiateCall('voice')}
                        style={{ padding: 4 }}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="call-outline" size={21} color={colors.textInverse} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => handleInitiateCall('video')}
                        style={{ padding: 4 }}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="videocam-outline" size={23} color={colors.textInverse} />
                    </TouchableOpacity>
                </View>
            ),
        });
    }, [navigation, otherUserId, otherUserName, otherUserImage, headerAvatarSource, colors, user, otherUserIsVerified, otherUserIsAdmin]);

    const fetchMessages = useCallback(async (convId: string, showSpinner = false) => {
        if (!convId) return;
        if (showSpinner) setLoading(true);
        try {
            const response = await chatAPI.getMessages(convId);
            const serverMsgs: Message[] = (response.data.messages || []).map((m: any) => ({
                id: m.id,
                senderId: m.senderId || m.sender_id,
                text: m.text || '',
                createdAt: m.createdAt || m.created_at,
                mediaUrl: m.mediaUrl || m.media_url,
                mediaType: m.mediaType || m.media_type,
                fileName: m.fileName || m.file_name,
                replyTo: m.replyTo || m.reply_to,
                sharedPost: m.sharedPost || m.shared_post,
            }));

            setMessages((prev) => {
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

        // Polling fallback
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
                        mediaUrl: payload.new.media_url,
                        mediaType: payload.new.media_type,
                        fileName: payload.new.file_name,
                        replyTo: payload.new.reply_to,
                        sharedPost: payload.new.shared_post,
                    };
                    setMessages((prev) => {
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
    }, [user, existingConvId, otherUserId, fetchMessages, markAsRead, refreshUnreadCount]);

    const handleDirectCameraSnap = async () => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Required', 'Camera permission is required to snap photos.');
                return;
            }
            const res = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images', 'videos'],
                quality: 0.8,
            });
            if (!res.canceled && res.assets && res.assets.length > 0) {
                const asset = res.assets[0];
                const isVideo = asset.type === 'video' || asset.mimeType?.startsWith('video');
                setPendingAttachment({
                    uri: asset.uri,
                    type: isVideo ? 'video' : 'image',
                    name: asset.fileName || (isVideo ? `video_${Date.now()}.mp4` : `photo_${Date.now()}.jpg`),
                    mimeType: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
                    size: asset.fileSize,
                });
            }
        } catch (e) {
            console.error('Camera snap error:', e);
            Alert.alert('Error', 'Could not open camera.');
        }
    };

    const sendMessage = async () => {
        const text = newMessage.trim();
        if ((!text && !pendingAttachment) || !user || sending) return;

        setSending(true);
        const tempId = `temp-${Date.now()}`;
        const convId = conversationId || (otherUserId ? [user.uid, otherUserId].sort().join('_') : '');

        let uploadedMediaUrl: string | undefined = undefined;
        let attachmentType = pendingAttachment?.type;
        let attachmentName = pendingAttachment?.name;

        const activeReply = replyingTo;
        const activeAttachment = pendingAttachment;

        // Optimistic message
        const optimisticMsg: Message = {
            id: tempId,
            senderId: user.uid,
            text,
            createdAt: new Date().toISOString(),
            mediaUrl: activeAttachment?.uri,
            mediaType: attachmentType,
            fileName: attachmentName,
            replyTo: activeReply ? {
                id: activeReply.id,
                text: activeReply.text || (activeReply.mediaType === 'image' ? 'Photo' : 'Attachment'),
                senderName: activeReply.senderId === user.uid ? 'You' : otherUserName,
                senderId: activeReply.senderId,
            } : undefined,
        };

        setMessages((prev) => [...prev, optimisticMsg]);
        setNewMessage('');
        setReplyingTo(null);
        setPendingAttachment(null);

        try {
            // Upload attachment if present
            if (activeAttachment) {
                try {
                    let base64 = '';
                    if (activeAttachment.uri.startsWith('data:')) {
                        base64 = activeAttachment.uri;
                    } else {
                        base64 = await FileSystem.readAsStringAsync(activeAttachment.uri, {
                            encoding: FileSystem.EncodingType.Base64,
                        });
                        base64 = `data:${activeAttachment.mimeType || 'application/octet-stream'};base64,${base64}`;
                    }

                    const uploadRes = await chatAPI.uploadAttachment({
                        userId: user.uid,
                        fileData: base64,
                        fileName: activeAttachment.name || `file_${Date.now()}`,
                        fileType: activeAttachment.mimeType,
                    });

                    uploadedMediaUrl = uploadRes.data.url;
                } catch (upErr) {
                    console.error('Attachment upload note:', upErr);
                    uploadedMediaUrl = activeAttachment.uri;
                }
            }

            const response = await chatAPI.sendMessage({
                conversationId: convId,
                senderId: user.uid,
                receiverId: otherUserId,
                text,
                receiverName: otherUserName,
                receiverImage: otherUserImage,
                senderImage: user.photoURL || undefined,
                mediaUrl: uploadedMediaUrl,
                mediaType: attachmentType,
                fileName: attachmentName,
                replyTo: activeReply ? {
                    id: activeReply.id,
                    text: activeReply.text || (activeReply.mediaType === 'image' ? 'Photo' : 'Attachment'),
                    senderName: activeReply.senderId === user.uid ? 'You' : otherUserName,
                    senderId: activeReply.senderId,
                } : undefined,
            });

            if (response?.data?.data) {
                const savedMsg = response.data.data;
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === tempId ? { ...savedMsg, id: savedMsg.id } : m
                    )
                );
            }
            markAsRead(convId);
        } catch (error) {
            console.error('Error sending message:', error);
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
            setNewMessage(text);
            setReplyingTo(activeReply);
            setPendingAttachment(activeAttachment);
            Alert.alert('Error', 'Failed to send message');
        } finally {
            setSending(false);
        }
    };

    const renderMessage = ({ item }: { item: Message }) => {
        const isOwnMessage = item.senderId === user?.uid;

        return (
            <SwipeableMessageRow onReply={() => setReplyingTo(item)} colors={colors}>
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
                        {/* WhatsApp-style Quoted Reply Preview */}
                        {item.replyTo && (
                            <View
                                style={[
                                    styles.quotedReplyBox,
                                    isOwnMessage ? styles.quotedReplyBoxOwn : styles.quotedReplyBoxOther,
                                ]}
                            >
                                <View style={[styles.quotedReplyBar, { backgroundColor: isOwnMessage ? colors.textInverse : colors.primary }]} />
                                <View style={{ flex: 1, paddingVertical: 2 }}>
                                    <Text
                                        style={[
                                            styles.quotedReplySender,
                                            { color: isOwnMessage ? colors.textInverse : colors.primary },
                                        ]}
                                    >
                                        {item.replyTo.senderName || 'Replied Message'}
                                    </Text>
                                    <Text
                                        style={[
                                            styles.quotedReplySnippet,
                                            { color: isOwnMessage ? 'rgba(255,255,255,0.85)' : colors.textSecondary },
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {item.replyTo.text}
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* Shared Post Card in Chat */}
                        {item.sharedPost && (
                            <TouchableOpacity
                                style={styles.sharedPostCard}
                                onPress={() => {
                                    if (item.sharedPost?.vendorId) {
                                        navigation.navigate('VendorDetails', { vendorId: item.sharedPost.vendorId });
                                    } else {
                                        navigation.navigate('Explore');
                                    }
                                }}
                                activeOpacity={0.8}
                            >
                                {item.sharedPost.mediaUrl ? (
                                    <Image source={{ uri: item.sharedPost.mediaUrl }} style={styles.sharedPostImage} />
                                ) : (
                                    <View style={[styles.sharedPostImage, { backgroundColor: '#10B98120', justifyContent: 'center', alignItems: 'center' }]}>
                                        <Ionicons name="bag-handle" size={24} color="#10B981" />
                                    </View>
                                )}
                                <View style={styles.sharedPostDetails}>
                                    <Text style={styles.sharedPostVendor} numberOfLines={1}>{item.sharedPost.vendorName}</Text>
                                    <Text style={styles.sharedPostCaption} numberOfLines={2}>
                                        {item.sharedPost.caption || 'Vendor Product / Showcase'}
                                    </Text>
                                    {item.sharedPost.price ? (
                                        <Text style={styles.sharedPostPrice}>
                                            {item.sharedPost.currency === 'NGN' ? '₦' : '$'}{item.sharedPost.price.toLocaleString()}
                                        </Text>
                                    ) : null}
                                    <View style={styles.viewPostBtn}>
                                        <Text style={styles.viewPostBtnText}>View Post ↗</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        )}

                        {/* Image Media Attachment */}
                        {item.mediaUrl && (item.mediaType === 'image' || (!item.mediaType && !item.mediaUrl.endsWith('.pdf'))) && (
                            <TouchableOpacity
                                onPress={() => {
                                    if (item.mediaUrl) Linking.openURL(item.mediaUrl).catch(() => {});
                                }}
                                activeOpacity={0.9}
                            >
                                <Image source={{ uri: item.mediaUrl }} style={styles.chatImageMedia} />
                            </TouchableOpacity>
                        )}

                        {/* Video Media Attachment */}
                        {item.mediaUrl && item.mediaType === 'video' && (
                            <TouchableOpacity
                                style={styles.chatVideoContainer}
                                onPress={() => {
                                    if (item.mediaUrl) Linking.openURL(item.mediaUrl).catch(() => {});
                                }}
                                activeOpacity={0.9}
                            >
                                <View style={styles.videoPlayOverlay}>
                                    <Ionicons name="play" size={24} color="#fff" />
                                    <Text style={styles.videoPlayText}>Play Video</Text>
                                </View>
                            </TouchableOpacity>
                        )}

                        {/* Document File Attachment */}
                        {item.mediaUrl && (item.mediaType === 'file' || item.fileName) && (
                            <TouchableOpacity
                                style={styles.chatDocumentCard}
                                onPress={() => {
                                    if (item.mediaUrl) Linking.openURL(item.mediaUrl).catch(() => {});
                                }}
                                activeOpacity={0.8}
                            >
                                <Ionicons name="document-text" size={24} color={isOwnMessage ? colors.textInverse : colors.primary} />
                                <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                                    <Text
                                        style={[
                                            styles.documentName,
                                            isOwnMessage ? { color: colors.textInverse } : { color: colors.textPrimary },
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {item.fileName || 'Document File'}
                                    </Text>
                                    <Text style={[styles.documentAction, isOwnMessage ? { color: 'rgba(255,255,255,0.8)' } : { color: colors.textTertiary }]}>
                                        Tap to open ↗
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        )}

                        {/* Message Text */}
                        {item.text ? (
                            <Text
                                style={[
                                    styles.messageText,
                                    isOwnMessage ? styles.ownMessageText : styles.otherMessageText,
                                    (item.mediaUrl || item.sharedPost) && { marginTop: SPACING.xs },
                                ]}
                            >
                                {item.text}
                            </Text>
                        ) : null}
                    </View>
                </View>
            </SwipeableMessageRow>
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
                        <Text style={styles.emptySubtext}>Swipe right on any message to reply!</Text>
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

                {/* WhatsApp-style Docked Reply Banner */}
                {replyingTo && (
                    <View style={styles.replyBanner}>
                        <View style={styles.replyBannerLeftBar} />
                        <View style={{ flex: 1, paddingLeft: SPACING.sm }}>
                            <Text style={styles.replyBannerSender}>
                                {replyingTo.senderId === user?.uid ? 'Replying to yourself' : `Replying to ${otherUserName}`}
                            </Text>
                            <Text style={styles.replyBannerText} numberOfLines={1}>
                                {replyingTo.text || (replyingTo.mediaType === 'image' ? '📷 Photo' : replyingTo.mediaType === 'video' ? '🎥 Video' : replyingTo.fileName ? `📎 ${replyingTo.fileName}` : 'Attachment')}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setReplyingTo(null)}
                            style={styles.replyBannerClose}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Ionicons name="close" size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                )}

                {/* Pending Attachment Preview Banner */}
                {pendingAttachment && (
                    <View style={styles.attachmentPreviewBanner}>
                        {pendingAttachment.type === 'image' ? (
                            <Image source={{ uri: pendingAttachment.uri }} style={styles.attachmentThumb} />
                        ) : pendingAttachment.type === 'video' ? (
                            <View style={[styles.attachmentThumb, { backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center' }]}>
                                <Ionicons name="videocam" size={20} color="#fff" />
                            </View>
                        ) : (
                            <View style={[styles.attachmentThumb, { backgroundColor: '#F59E0B25', justifyContent: 'center', alignItems: 'center' }]}>
                                <Ionicons name="document-text" size={20} color="#F59E0B" />
                            </View>
                        )}
                        <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                            <Text style={styles.attachmentName} numberOfLines={1}>
                                {pendingAttachment.name || (pendingAttachment.type === 'image' ? 'Photo attached' : pendingAttachment.type === 'video' ? 'Video attached' : 'Document attached')}
                            </Text>
                            <Text style={styles.attachmentType}>
                                {pendingAttachment.type.toUpperCase()} · Ready to send
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setPendingAttachment(null)}
                            style={styles.replyBannerClose}
                        >
                            <Ionicons name="close-circle" size={22} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                )}

                {/* Message Input with Camera, Attachment, and Send */}
                <View style={styles.inputContainer}>
                    {/* Attachment Option Sheet Button (+) */}
                    <TouchableOpacity
                        style={styles.inputActionButton}
                        onPress={() => setAttachmentModalVisible(true)}
                        disabled={sending}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="attach-outline" size={24} color={colors.textSecondary} />
                    </TouchableOpacity>

                    {/* Quick Camera Snap Button */}
                    <TouchableOpacity
                        style={styles.inputActionButton}
                        onPress={handleDirectCameraSnap}
                        disabled={sending}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="camera-outline" size={22} color={colors.primary} />
                    </TouchableOpacity>

                    <TextInput
                        style={styles.textInput}
                        value={newMessage}
                        onChangeText={setNewMessage}
                        placeholder={pendingAttachment ? 'Add a caption...' : 'Type a message...'}
                        placeholderTextColor={colors.textTertiary}
                        multiline
                        maxLength={500}
                        editable={!sending}
                    />

                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            (!newMessage.trim() && !pendingAttachment) || sending ? styles.sendButtonDisabled : null,
                        ]}
                        onPress={sendMessage}
                        disabled={(!newMessage.trim() && !pendingAttachment) || sending}
                    >
                        {sending ? (
                            <ActivityIndicator size="small" color={colors.textInverse} />
                        ) : (
                            <Ionicons name="send" size={17} color={colors.textInverse} />
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>

            {/* Media Attachment Modal for Camera / Gallery / Documents */}
            <MediaAttachmentModal
                visible={attachmentModalVisible}
                onClose={() => setAttachmentModalVisible(false)}
                onSelect={(attachment) => setPendingAttachment(attachment)}
                title="Send in Chat"
                allowVideo={true}
                allowDocuments={true}
            />
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
            maxWidth: '78%',
            padding: SPACING.sm + 2,
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
            lineHeight: 20,
        },
        ownMessageText: {
            color: colors.textInverse,
        },
        otherMessageText: {
            color: colors.textPrimary,
        },
        // Quoted Reply in Bubble
        quotedReplyBox: {
            flexDirection: 'row',
            borderRadius: BORDER_RADIUS.sm,
            padding: 4,
            marginBottom: 6,
            overflow: 'hidden',
        },
        quotedReplyBoxOwn: {
            backgroundColor: 'rgba(0, 0, 0, 0.18)',
        },
        quotedReplyBoxOther: {
            backgroundColor: colors.surfaceLight,
        },
        quotedReplyBar: {
            width: 3,
            borderRadius: 2,
            marginRight: 6,
        },
        quotedReplySender: {
            fontSize: 11,
            fontWeight: 'bold',
        },
        quotedReplySnippet: {
            fontSize: 12,
        },
        // Shared Post Card in Chat
        sharedPostCard: {
            backgroundColor: colors.background,
            borderRadius: BORDER_RADIUS.md,
            overflow: 'hidden',
            marginBottom: 6,
            borderWidth: 1,
            borderColor: colors.border,
        },
        sharedPostImage: {
            width: '100%',
            height: 120,
            resizeMode: 'cover',
        },
        sharedPostDetails: {
            padding: SPACING.xs + 2,
        },
        sharedPostVendor: {
            fontSize: 11,
            fontWeight: 'bold',
            color: colors.primary,
        },
        sharedPostCaption: {
            fontSize: 12,
            color: colors.textPrimary,
            marginVertical: 2,
        },
        sharedPostPrice: {
            fontSize: 12,
            fontWeight: 'bold',
            color: colors.success || '#10B981',
        },
        viewPostBtn: {
            alignSelf: 'flex-end',
            backgroundColor: colors.primary,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: BORDER_RADIUS.sm,
            marginTop: 4,
        },
        viewPostBtnText: {
            color: colors.textInverse,
            fontSize: 10,
            fontWeight: 'bold',
        },
        // Media in Bubble
        chatImageMedia: {
            width: 220,
            height: 160,
            borderRadius: BORDER_RADIUS.md,
            backgroundColor: colors.surfaceLight,
            marginBottom: 4,
        },
        chatVideoContainer: {
            width: 220,
            height: 140,
            borderRadius: BORDER_RADIUS.md,
            backgroundColor: '#0F172A',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 4,
        },
        videoPlayOverlay: {
            alignItems: 'center',
            gap: 4,
        },
        videoPlayText: {
            color: '#FFFFFF',
            fontSize: 11,
            fontWeight: 'bold',
        },
        chatDocumentCard: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: SPACING.xs + 4,
            borderRadius: BORDER_RADIUS.sm,
            backgroundColor: 'rgba(0,0,0,0.1)',
            marginBottom: 4,
        },
        documentName: {
            fontSize: 12,
            fontWeight: '600',
        },
        documentAction: {
            fontSize: 10,
            marginTop: 1,
        },
        // Docked Reply Banner
        replyBanner: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.xs + 2,
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
        replyBannerLeftBar: {
            width: 4,
            height: '80%',
            backgroundColor: colors.primary,
            borderRadius: 2,
        },
        replyBannerSender: {
            fontSize: 12,
            fontWeight: 'bold',
            color: colors.primary,
        },
        replyBannerText: {
            fontSize: 12,
            color: colors.textSecondary,
            marginTop: 1,
        },
        replyBannerClose: {
            padding: SPACING.xs,
        },
        // Docked Attachment Preview
        attachmentPreviewBanner: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.xs + 2,
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
        attachmentThumb: {
            width: 38,
            height: 38,
            borderRadius: BORDER_RADIUS.sm,
        },
        attachmentName: {
            fontSize: 12,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        attachmentType: {
            fontSize: 10,
            color: colors.textTertiary,
            marginTop: 1,
        },
        // Input Bar
        inputContainer: {
            flexDirection: 'row',
            paddingHorizontal: SPACING.sm,
            paddingVertical: SPACING.sm,
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            alignItems: 'center',
            gap: 6,
        },
        inputActionButton: {
            width: 38,
            height: 38,
            borderRadius: 19,
            justifyContent: 'center',
            alignItems: 'center',
        },
        textInput: {
            flex: 1,
            backgroundColor: colors.background,
            borderRadius: BORDER_RADIUS.round,
            paddingHorizontal: SPACING.md,
            paddingVertical: Platform.OS === 'ios' ? SPACING.sm : 6,
            fontSize: FONT_SIZES.md,
            color: colors.textPrimary,
            maxHeight: 90,
            borderWidth: 1,
            borderColor: colors.border,
        },
        sendButton: {
            backgroundColor: colors.primary,
            width: 40,
            height: 40,
            borderRadius: 20,
            justifyContent: 'center',
            alignItems: 'center',
        },
        sendButtonDisabled: {
            backgroundColor: colors.border,
            opacity: 0.6,
        },
    });
