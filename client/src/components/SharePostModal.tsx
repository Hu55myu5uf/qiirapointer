import React, { useState, useEffect } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TouchableWithoutFeedback,
    TextInput,
    FlatList,
    Image,
    ActivityIndicator,
    Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../store/authStore';
import { chatAPI } from '../services/api';
import { sharePost } from '../services/shareService';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { PLACEHOLDER_AVATARS } from '../assets';
import { VerificationBadgeInline } from './VerificationBadge';

interface SharePostModalProps {
    visible: boolean;
    onClose: () => void;
    post: {
        id: string;
        vendorName: string;
        caption?: string;
        price?: number;
        currency?: string;
        mediaUrl?: string;
        vendorId?: string;
    } | null;
}

export default function SharePostModal({ visible, onClose, post }: SharePostModalProps) {
    const { colors } = useTheme();
    const styles = getStyles(colors);
    const { user } = useAuthStore();

    const [conversations, setConversations] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [sendingMap, setSendingMap] = useState<Record<string, boolean>>({});
    const [sentMap, setSentMap] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (visible && user?.uid) {
            loadConversations();
            setSentMap({});
            setSearchQuery('');
        }
    }, [visible, user?.uid]);

    const loadConversations = async () => {
        if (!user?.uid) return;
        setLoading(true);
        try {
            const res = await chatAPI.getConversations(user.uid);
            const list = res.data.conversations || [];
            setConversations(list);
        } catch (error) {
            console.error('Failed to load conversations for sharing:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSendToChat = async (conv: any) => {
        if (!user || !post) return;

        const convId = conv.id;
        const otherUserId = conv.participants?.find((p: string) => p !== user.uid) || conv.otherUserId;
        const recipientName = conv.otherUserName || conv.participantNames?.[otherUserId] || 'User';
        const recipientImage = conv.otherUserImage || conv.participantImages?.[otherUserId] || '';

        setSendingMap((prev) => ({ ...prev, [convId]: true }));

        try {
            const postSummary = `🛍️ Shared Post from ${post.vendorName}${post.caption ? `: "${post.caption.slice(0, 60)}..."` : ''}`;

            await chatAPI.sendMessage({
                conversationId: convId,
                senderId: user.uid,
                receiverId: otherUserId,
                receiverName: recipientName,
                receiverImage: recipientImage,
                senderImage: user.photoURL || undefined,
                text: postSummary,
                sharedPost: {
                    id: post.id,
                    vendorName: post.vendorName,
                    vendorId: post.vendorId,
                    caption: post.caption,
                    price: post.price,
                    currency: post.currency,
                    mediaUrl: post.mediaUrl,
                },
            });

            setSentMap((prev) => ({ ...prev, [convId]: true }));
        } catch (error: any) {
            console.error('Error sharing post to chat:', error);
            Alert.alert('Error', 'Could not share post to this chat.');
        } finally {
            setSendingMap((prev) => ({ ...prev, [convId]: false }));
        }
    };

    const handleShareExternal = async () => {
        if (!post) return;
        onClose();
        await sharePost({
            postId: post.id,
            vendorName: post.vendorName,
            caption: post.caption,
            price: post.price,
            currency: post.currency,
            mediaUrl: post.mediaUrl,
        });
    };

    const filteredConversations = conversations.filter((c) => {
        const otherUserId = c.participants?.find((p: string) => p !== user?.uid) || '';
        const name = (c.otherUserName || c.participantNames?.[otherUserId] || '').toLowerCase();
        return name.includes(searchQuery.toLowerCase());
    });

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.overlay}>
                    <TouchableWithoutFeedback>
                        <View style={styles.container}>
                            <View style={styles.dragHandle} />
                            
                            <View style={styles.header}>
                                <Text style={styles.title}>Share Post</Text>
                                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                    <Ionicons name="close" size={24} color={colors.textSecondary} />
                                </TouchableOpacity>
                            </View>

                            {/* Post Preview Snippet */}
                            {post && (
                                <View style={styles.postSnippet}>
                                    {post.mediaUrl ? (
                                        <Image source={{ uri: post.mediaUrl }} style={styles.snippetImage} />
                                    ) : (
                                        <View style={[styles.snippetImage, styles.snippetPlaceholder]}>
                                            <Ionicons name="image-outline" size={20} color={colors.textTertiary} />
                                        </View>
                                    )}
                                    <View style={styles.snippetInfo}>
                                        <Text style={styles.snippetVendor} numberOfLines={1}>{post.vendorName}</Text>
                                        <Text style={styles.snippetCaption} numberOfLines={1}>
                                            {post.caption || 'Product or Service'}
                                        </Text>
                                        {post.price ? (
                                            <Text style={styles.snippetPrice}>
                                                {post.currency === 'NGN' ? '₦' : '$'}{post.price.toLocaleString()}
                                            </Text>
                                        ) : null}
                                    </View>
                                </View>
                            )}

                            {/* Search Chats */}
                            <View style={styles.searchBar}>
                                <Ionicons name="search" size={18} color={colors.textTertiary} />
                                <TextInput
                                    style={styles.searchInput}
                                    placeholder="Search people or chats..."
                                    placeholderTextColor={colors.textTertiary}
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                />
                                {searchQuery.length > 0 && (
                                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                                        <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* Direct Message List */}
                            <Text style={styles.sectionHeading}>Send in Direct Message</Text>

                            {loading ? (
                                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: SPACING.lg }} />
                            ) : filteredConversations.length === 0 ? (
                                <View style={styles.emptyChats}>
                                    <Text style={styles.emptyChatsText}>
                                        {searchQuery ? 'No matching chats found' : 'No recent conversations'}
                                    </Text>
                                </View>
                            ) : (
                                <FlatList
                                    data={filteredConversations}
                                    keyExtractor={(item) => item.id}
                                    style={styles.chatList}
                                    keyboardShouldPersistTaps="handled"
                                    renderItem={({ item }) => {
                                        const otherUserId = item.participants?.find((p: string) => p !== user?.uid) || '';
                                        const name = item.otherUserName || item.participantNames?.[otherUserId] || 'User';
                                        const avatar = item.otherUserImage || item.participantImages?.[otherUserId];
                                        const isSent = Boolean(sentMap[item.id]);
                                        const isSending = Boolean(sendingMap[item.id]);

                                        return (
                                            <View style={styles.chatRow}>
                                                <Image
                                                    source={avatar ? { uri: avatar } : PLACEHOLDER_AVATARS.client}
                                                    style={styles.chatAvatar}
                                                />
                                                <View style={styles.chatInfo}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                        <Text style={styles.chatName} numberOfLines={1}>{name}</Text>
                                                        {item.otherUserIsVerified && (
                                                            <View style={{ marginLeft: 4 }}>
                                                                <VerificationBadgeInline isVerified={true} size={13} />
                                                            </View>
                                                        )}
                                                    </View>
                                                    <Text style={styles.chatSub} numberOfLines={1}>
                                                        {item.lastMessage || 'Active chat'}
                                                    </Text>
                                                </View>

                                                <TouchableOpacity
                                                    style={[
                                                        styles.sendBtn,
                                                        isSent && styles.sendBtnSent,
                                                        isSending && styles.sendBtnDisabled,
                                                    ]}
                                                    onPress={() => handleSendToChat(item)}
                                                    disabled={isSent || isSending}
                                                >
                                                    {isSending ? (
                                                        <ActivityIndicator size="small" color={colors.textInverse} />
                                                    ) : isSent ? (
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                                            <Ionicons name="checkmark" size={14} color={colors.textInverse} />
                                                            <Text style={styles.sendBtnText}>Sent</Text>
                                                        </View>
                                                    ) : (
                                                        <Text style={styles.sendBtnText}>Send</Text>
                                                    )}
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    }}
                                />
                            )}

                            {/* External Share Option */}
                            <TouchableOpacity
                                style={styles.externalShareBtn}
                                onPress={handleShareExternal}
                                activeOpacity={0.8}
                            >
                                <Ionicons name="share-social-outline" size={20} color={colors.textPrimary} />
                                <Text style={styles.externalShareText}>Share to Other Apps (WhatsApp, Copy Link...)</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

const getStyles = (colors: any) =>
    StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            justifyContent: 'flex-end',
        },
        container: {
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '80%',
            paddingHorizontal: SPACING.lg,
            paddingTop: SPACING.md,
            paddingBottom: SPACING.xl,
            borderWidth: 1,
            borderColor: colors.border,
        },
        dragHandle: {
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.border,
            alignSelf: 'center',
            marginBottom: SPACING.sm,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: SPACING.md,
        },
        title: {
            fontSize: FONT_SIZES.lg,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        postSnippet: {
            flexDirection: 'row',
            backgroundColor: colors.background,
            borderRadius: BORDER_RADIUS.md,
            padding: SPACING.sm,
            alignItems: 'center',
            marginBottom: SPACING.md,
            borderWidth: 1,
            borderColor: colors.border,
        },
        snippetImage: {
            width: 46,
            height: 46,
            borderRadius: BORDER_RADIUS.sm,
            backgroundColor: colors.surface,
        },
        snippetPlaceholder: {
            justifyContent: 'center',
            alignItems: 'center',
        },
        snippetInfo: {
            flex: 1,
            marginLeft: SPACING.sm,
        },
        snippetVendor: {
            fontSize: FONT_SIZES.xs,
            fontWeight: '700',
            color: colors.primary,
        },
        snippetCaption: {
            fontSize: FONT_SIZES.xs,
            color: colors.textPrimary,
            marginVertical: 1,
        },
        snippetPrice: {
            fontSize: FONT_SIZES.xs,
            fontWeight: '700',
            color: colors.success || '#10B981',
        },
        searchBar: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.background,
            borderRadius: BORDER_RADIUS.md,
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.xs,
            marginBottom: SPACING.sm,
            borderWidth: 1,
            borderColor: colors.border,
        },
        searchInput: {
            flex: 1,
            fontSize: FONT_SIZES.sm,
            color: colors.textPrimary,
            marginLeft: SPACING.sm,
            paddingVertical: 6,
        },
        sectionHeading: {
            fontSize: FONT_SIZES.xs,
            fontWeight: '700',
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginVertical: SPACING.xs,
        },
        chatList: {
            maxHeight: 220,
        },
        chatRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: SPACING.sm,
            borderBottomWidth: 0.5,
            borderBottomColor: colors.border,
        },
        chatAvatar: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.border,
        },
        chatInfo: {
            flex: 1,
            marginLeft: SPACING.sm,
        },
        chatName: {
            fontSize: FONT_SIZES.sm,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        chatSub: {
            fontSize: FONT_SIZES.xs,
            color: colors.textTertiary,
            marginTop: 2,
        },
        sendBtn: {
            backgroundColor: colors.primary,
            paddingHorizontal: SPACING.md,
            paddingVertical: 6,
            borderRadius: BORDER_RADIUS.round,
            minWidth: 64,
            alignItems: 'center',
        },
        sendBtnSent: {
            backgroundColor: '#10B981',
        },
        sendBtnDisabled: {
            opacity: 0.7,
        },
        sendBtnText: {
            color: colors.textInverse,
            fontSize: FONT_SIZES.xs,
            fontWeight: '700',
        },
        emptyChats: {
            paddingVertical: SPACING.lg,
            alignItems: 'center',
        },
        emptyChatsText: {
            fontSize: FONT_SIZES.xs,
            color: colors.textTertiary,
        },
        externalShareBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.background,
            borderRadius: BORDER_RADIUS.md,
            paddingVertical: SPACING.md,
            marginTop: SPACING.md,
            borderWidth: 1,
            borderColor: colors.border,
            gap: SPACING.sm,
        },
        externalShareText: {
            fontSize: FONT_SIZES.xs,
            fontWeight: '600',
            color: colors.textPrimary,
        },
    });
