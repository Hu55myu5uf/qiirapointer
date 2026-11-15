import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { authenticateUser, SUPPORT_UID } from '../utils/authMiddleware';
import { decodeUpload, saveUpload, UploadError } from '../utils/fileStorage';
import { getDisplayProfile, getDisplayProfiles } from '../utils/profiles';
import { messageLimiter, uploadLimiter } from '../utils/rateLimiter';

const router = Router();

const MAX_MESSAGE_LENGTH = 5000;
const MESSAGE_PAGE_SIZE = 200;
const MAX_CONVERSATIONS = 200;

/** Canonical conversation id for two users (stable regardless of who sends first). */
export function conversationIdFor(a: string, b: string) {
    return [a, b].sort().join('_');
}

/**
 * Work out the participants of a conversation. Prefers the stored document; otherwise derives them
 * from the canonical id using the caller's uid (uids may themselves contain "_", e.g. the Support id).
 */
async function getConversationParticipants(conversationId: string, callerUid: string): Promise<string[] | null> {
    const doc = await db.collection('conversations').doc(conversationId).get();
    if (doc.exists) {
        const list: string[] = doc.data()?.participants || [];
        if (list.length >= 2) return list;
    }
    for (const me of [callerUid, SUPPORT_UID]) {
        let other: string | null = null;
        if (conversationId.startsWith(`${me}_`)) other = conversationId.slice(me.length + 1);
        else if (conversationId.endsWith(`_${me}`)) other = conversationId.slice(0, -(me.length + 1));
        if (other && conversationIdFor(me, other) === conversationId) return [me, other];
    }
    return null;
}

/** Participants may access a conversation; admins only the shared Support conversations. */
function canAccessConversation(user: { uid: string; isAdmin: boolean }, participants: string[]) {
    if (participants.includes(user.uid)) return true;
    return user.isAdmin && participants.includes(SUPPORT_UID);
}

/** The identities a caller may act as in chat: themselves, or Support if they are an admin. */
function actingIdentities(user: { uid: string; isAdmin: boolean }) {
    return user.isAdmin ? [user.uid, SUPPORT_UID] : [user.uid];
}

/** Keep only the expected, small, JSON-safe fields of an object. */
function pick(obj: any, fields: Record<string, 'string' | 'number'>, maxString = 500) {
    if (!obj || typeof obj !== 'object') return null;
    const out: Record<string, any> = {};
    for (const [key, type] of Object.entries(fields)) {
        const v = obj[key];
        if (type === 'string' && typeof v === 'string') out[key] = v.slice(0, maxString);
        if (type === 'number' && typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    }
    return Object.keys(out).length ? out : null;
}

const SHARED_POST_FIELDS = { id: 'string', postId: 'string', title: 'string', caption: 'string', mediaUrl: 'string', thumbnailUrl: 'string', vendorId: 'string', vendorName: 'string', vendorImage: 'string', price: 'number', currency: 'string', type: 'string' } as const;
const REPLY_FIELDS = { id: 'string', text: 'string', senderId: 'string', senderName: 'string', mediaType: 'string' } as const;
const ORDER_FIELDS = { orderId: 'string', productId: 'string', productTitle: 'string', productImage: 'string', quantity: 'number', unitPrice: 'number', totalPrice: 'number', currency: 'string', notes: 'string', deliveryAddress: 'string', status: 'string' } as const;

/**
 * @route   GET /api/chats/conversations/:userId
 * @desc    Conversations of the caller (admins: also the Support inbox), newest first
 */
router.get('/conversations/:userId', authenticateUser, async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        if (!actingIdentities(req.user!).includes(userId)) {
            return res.status(403).json({ error: 'Forbidden', message: 'You can only view your own conversations.' });
        }

        const snap = await db.collection('conversations')
            .where('participants', 'array-contains', userId)
            .get();

        const raw = snap.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                participants: (d.participants || []) as string[],
                participantNames: d.participantNames || {},
                participantImages: d.participantImages || {},
                lastMessage: d.lastMessage || '',
                lastMessageAt: d.lastMessageAt || d.updatedAt || null,
                lastSenderId: d.lastSenderId || null,
            };
        })
            .sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime())
            .slice(0, MAX_CONVERSATIONS);

        // Live names / photos / badges (people change their profile after a chat starts)
        const profiles = await getDisplayProfiles(raw.flatMap(c => c.participants));
        const conversations = raw.map(conv => {
            const names: Record<string, string> = { ...conv.participantNames };
            const images: Record<string, string> = { ...conv.participantImages };
            const verified: Record<string, boolean> = {};
            const admin: Record<string, boolean> = {};
            for (const p of conv.participants) {
                const prof = profiles.get(p);
                if (!prof) continue;
                names[p] = prof.name;
                images[p] = prof.avatar;
                verified[p] = prof.isVerified;
                admin[p] = prof.isAdmin;
            }
            return { ...conv, participantNames: names, participantImages: images, participantVerified: verified, participantIsAdmin: admin };
        });

        res.status(200).json({ conversations });
    } catch (error: any) {
        console.error('Get conversations error:', error);
        res.status(500).json({ error: 'Failed to load conversations' });
    }
});

/**
 * @route   GET /api/chats/conversations/:conversationId/messages
 * @desc    The latest messages of a conversation (participants only), oldest first
 */
router.get('/conversations/:conversationId/messages', authenticateUser, async (req: Request, res: Response) => {
    try {
        const { conversationId } = req.params;
        const participants = await getConversationParticipants(conversationId, req.user!.uid);
        if (!participants || !canAccessConversation(req.user!, participants)) {
            // Same response whether the chat exists or not, so ids can't be probed
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const snap = await db.collection('conversations').doc(conversationId)
            .collection('messages')
            .orderBy('createdAt', 'desc')
            .limit(MESSAGE_PAGE_SIZE)
            .get();

        const messages = snap.docs.reverse().map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                senderId: d.senderId,
                text: d.text || '',
                createdAt: d.createdAt,
                mediaUrl: d.mediaUrl || null,
                mediaType: d.mediaType || null,
                fileName: d.fileName || null,
                replyTo: d.replyTo || null,
                sharedPost: d.sharedPost || null,
                messageType: d.messageType || 'text',
                orderData: d.orderData || null,
            };
        });

        res.status(200).json({ messages });
    } catch (error: any) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to retrieve messages' });
    }
});

/**
 * @route   POST /api/chats/upload-attachment
 * @desc    Upload a chat attachment (photo, video, PDF or Word document)
 */
router.post('/upload-attachment', authenticateUser, uploadLimiter, async (req: Request, res: Response) => {
    try {
        const { fileData, fileName } = req.body;
        const uid = req.user!.uid;
        if (req.body.userId && req.body.userId !== uid && !req.user!.isAdmin) {
            return res.status(403).json({ error: 'Forbidden: You can only upload attachments for your own messages' });
        }

        const file = decodeUpload(fileData, ['image', 'video', 'pdf', 'word']);
        const baseName = String(fileName || 'attachment').replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'attachment';
        const saved = await saveUpload({ folder: ['chats', uid], namePrefix: baseName, file, visibility: 'public' });

        res.status(200).json({
            url: saved.url,
            fileName: `${baseName}${file.ext}`,
            fileType: saved.contentType,
            mediaType: file.kind === 'image' ? 'image' : file.kind === 'video' ? 'video' : 'document',
            fileSize: saved.size,
        });
    } catch (error: any) {
        if (error instanceof UploadError) return res.status(error.status).json({ error: error.message });
        console.error('Upload chat attachment error:', error);
        res.status(500).json({ error: 'Failed to upload chat attachment' });
    }
});

/**
 * @route   POST /api/chats/messages
 * @desc    Send a message (creates the conversation if needed)
 */
router.post('/messages', authenticateUser, messageLimiter, async (req: Request, res: Response) => {
    try {
        let { conversationId, receiverId } = req.body;
        const { text, mediaUrl, mediaType, fileName } = req.body;

        // The sender is ALWAYS the authenticated user. Admins may instead reply as Support.
        const requestedSender = req.body.senderId;
        if (requestedSender && !actingIdentities(req.user!).includes(requestedSender)) {
            return res.status(403).json({ error: 'Forbidden', message: 'You can only send messages as yourself.' });
        }
        const senderId: string = requestedSender || req.user!.uid;

        if (text !== undefined && text !== null && typeof text !== 'string') {
            return res.status(400).json({ error: 'Invalid message text' });
        }
        const effectiveText = (text || '').trim();
        if (effectiveText.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({ error: `Messages can be at most ${MAX_MESSAGE_LENGTH} characters` });
        }
        if (mediaUrl !== undefined && mediaUrl !== null && (typeof mediaUrl !== 'string' || !/^https:\/\//i.test(mediaUrl) || mediaUrl.length > 2048)) {
            return res.status(400).json({ error: 'Invalid media URL' });
        }
        if (mediaType !== undefined && mediaType !== null && !['image', 'video', 'file', 'document'].includes(mediaType)) {
            return res.status(400).json({ error: 'Invalid media type' });
        }
        if (fileName !== undefined && fileName !== null && (typeof fileName !== 'string' || fileName.length > 200)) {
            return res.status(400).json({ error: 'Invalid file name' });
        }
        const sharedPost = pick(req.body.sharedPost, SHARED_POST_FIELDS);
        const replyTo = pick(req.body.replyTo, REPLY_FIELDS);
        const isOrder = req.body.messageType === 'order';
        const orderData = isOrder ? pick(req.body.orderData || req.body.orderDetails, ORDER_FIELDS) : null;

        if (!effectiveText && !mediaUrl && !sharedPost && !orderData) {
            return res.status(400).json({ error: 'Missing message content, media, or shared post' });
        }

        // Resolve the receiver; an explicit conversationId must really belong to the sender
        if (conversationId) {
            if (typeof conversationId !== 'string') return res.status(400).json({ error: 'Invalid conversationId' });
            const participants = await getConversationParticipants(conversationId, senderId);
            if (!participants || !participants.includes(senderId)) {
                return res.status(403).json({ error: 'Forbidden', message: 'You are not part of this conversation.' });
            }
            const other = participants.find(p => p !== senderId);
            if (receiverId && receiverId !== other) {
                return res.status(400).json({ error: 'receiverId does not match the conversation' });
            }
            receiverId = other;
        }
        if (!receiverId || typeof receiverId !== 'string') {
            return res.status(400).json({ error: 'Missing required field: receiverId' });
        }
        if (receiverId === senderId) {
            return res.status(400).json({ error: 'You cannot message yourself' });
        }

        const [sender, receiver] = await Promise.all([getDisplayProfile(senderId), getDisplayProfile(receiverId)]);
        if (!receiver.exists) {
            return res.status(404).json({ error: 'Recipient not found' });
        }
        // Blocking (Apple & Google user-generated-content requirement)
        if (receiver.blockedUserIds.includes(senderId)) {
            return res.status(403).json({ error: 'Cannot Send Message', message: 'You cannot send messages to this user.' });
        }
        if (sender.blockedUserIds.includes(receiverId)) {
            return res.status(403).json({ error: 'Cannot Send Message', message: 'You have blocked this user. Unblock them in Settings to send a message.' });
        }

        const convId = conversationId || conversationIdFor(senderId, receiverId);
        const now = new Date().toISOString();

        let preview = effectiveText;
        if (!preview) {
            if (orderData) preview = `🛒 Order: ${orderData.productTitle || 'item'}`;
            else if (mediaType === 'image') preview = '📷 Photo';
            else if (mediaType === 'video') preview = '🎥 Video';
            else if (fileName) preview = `📎 ${fileName}`;
            else if (sharedPost) preview = `🛍️ ${sharedPost.title || sharedPost.vendorName || 'Shared Post'}`;
            else preview = 'Shared an attachment';
        }

        const message: Record<string, any> = {
            senderId,
            receiverId,
            text: effectiveText,
            createdAt: now,
            messageType: orderData ? 'order' : 'text',
        };
        if (mediaUrl) message.mediaUrl = mediaUrl;
        if (mediaType) message.mediaType = mediaType;
        if (fileName) message.fileName = fileName;
        if (replyTo) message.replyTo = replyTo;
        if (sharedPost) message.sharedPost = sharedPost;
        if (orderData) message.orderData = orderData;

        const convRef = db.collection('conversations').doc(convId);
        const msgRef = convRef.collection('messages').doc();
        const batch = db.batch();
        batch.set(convRef, {
            id: convId,
            participants: [senderId, receiverId].sort(),
            participantNames: { [senderId]: sender.name, [receiverId]: receiver.name },
            participantImages: { [senderId]: sender.avatar, [receiverId]: receiver.avatar },
            lastMessage: preview.slice(0, 200),
            lastMessageAt: now,
            lastSenderId: senderId,
            updatedAt: now,
        }, { merge: true });
        batch.set(msgRef, message);
        await batch.commit();

        res.status(201).json({
            message: 'Message sent successfully',
            data: { id: msgRef.id, ...message },
            conversationId: convId,
        });
    } catch (error: any) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

export default router;
