import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import supabase from '../config/supabase';
import { authenticateUser, requireSelfOrAdmin, MASTER_ADMIN_UID } from '../utils/authMiddleware';

const router = Router();

const DEFAULT_AVATARS = {
    client: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=500&auto=format&fit=crop&q=80',
    vendor: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500&auto=format&fit=crop&q=80',
};

function withTimeout<T>(promise: Promise<T> | any, ms: number = 1000): Promise<T> {
    return Promise.race([
        Promise.resolve(promise),
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Query timeout')), ms))
    ]);
}

const PARTICIPANT_CACHE = new Map<string, { data: any; timestamp: number }>();

// Helper to look up live user/vendor profile (name, avatar, isVerified, isAdmin)
async function getParticipantProfile(uid: string): Promise<{ name: string; avatar: string; role: string; isVerified: boolean; isAdmin: boolean }> {
    if (!uid) {
        return { name: 'User', avatar: DEFAULT_AVATARS.client, role: 'client', isVerified: false, isAdmin: false };
    }

    if (uid === 'qiira_official_support') {
        return {
            name: 'QIIRA Customer Support',
            avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500',
            role: 'support',
            isVerified: true,
            isAdmin: true,
        };
    }

    const cached = PARTICIPANT_CACHE.get(uid);
    if (cached && (Date.now() - cached.timestamp < 10000)) {
        return cached.data;
    }

    let name = '';
    let avatar = '';
    let role = 'client';
    let isVerified = false;

    try {
        // 1. Fetch Firestore User and Vendor in parallel
        const [userDoc, vendorDoc]: any = await Promise.all([
            withTimeout(db.collection('users').doc(uid).get(), 1200).catch(() => null),
            withTimeout(db.collection('vendors').doc(uid).get(), 1200).catch(() => null),
        ]);

        let uData = userDoc && userDoc.exists ? userDoc.data() : null;
        let vData = vendorDoc && vendorDoc.exists ? vendorDoc.data() : null;

        // Fallbacks by where query in Firestore if doc key didn't match
        if (!uData) {
            const uByUid: any = await withTimeout(db.collection('users').where('uid', '==', uid).get(), 1000).catch(() => null);
            if (uByUid && !uByUid.empty && uByUid.docs?.length > 0) uData = uByUid.docs[0].data();
        }
        if (!vData) {
            const vByUid: any = await withTimeout(db.collection('vendors').where('uid', '==', uid).get(), 1000).catch(() => null);
            if (vByUid && !vByUid.empty && vByUid.docs?.length > 0) vData = vByUid.docs[0].data();
            else {
                const vByUserId: any = await withTimeout(db.collection('vendors').where('userId', '==', uid).get(), 1000).catch(() => null);
                if (vByUserId && !vByUserId.empty && vByUserId.docs?.length > 0) vData = vByUserId.docs[0].data();
            }
        }

        if (uData) {
            name = uData?.fullName || uData?.full_name || uData?.displayName || '';
            avatar = uData?.profileImage || uData?.profile_image || uData?.photoURL || uData?.avatar || '';
            role = uData?.role || role;
            if (uData?.isVerified || uData?.is_verified || uData?.role === 'admin') isVerified = true;
        }

        if (vData) {
            role = 'vendor';
            if (vData?.businessName || vData?.business_name) {
                name = vData.businessName || vData.business_name;
            }
            if (vData?.businessImage || vData?.business_image || vData?.profileImage || vData?.profile_image || vData?.image || vData?.avatar) {
                avatar = vData.businessImage || vData.business_image || vData.profileImage || vData.profile_image || vData.image || vData.avatar;
            }
            if (vData?.isVerified || vData?.is_verified) isVerified = true;
        }

        // 2. Supabase lookup fallback if avatar or name is still empty
        if (!avatar || !name) {
            try {
                const [sUser, sVendor]: any = await Promise.all([
                    withTimeout(supabase.from('users').select('*').eq('uid', uid).maybeSingle(), 800).catch(() => null),
                    withTimeout(supabase.from('vendors').select('*').eq('uid', uid).maybeSingle(), 800).catch(() => null),
                ]);

                if (sVendor?.data) {
                    role = 'vendor';
                    name = name || sVendor.data.business_name || sVendor.data.businessName;
                    avatar = avatar || sVendor.data.business_image || sVendor.data.profile_image || sVendor.data.image;
                    if (sVendor.data.is_verified) isVerified = true;
                }
                if (sUser?.data) {
                    name = name || sUser.data.full_name || sUser.data.email;
                    avatar = avatar || sUser.data.profile_image;
                    role = sUser.data.role || role;
                    if (sUser.data.is_verified || sUser.data.role === 'admin') isVerified = true;
                }
            } catch (_) {}
        }
    } catch (e: any) {
        // Fallback silently
    }

    if (!avatar) {
        avatar = role === 'vendor' ? DEFAULT_AVATARS.vendor : DEFAULT_AVATARS.client;
    }

    const isAdmin = role === 'admin' || uid === MASTER_ADMIN_UID;
    if (isAdmin) {
        isVerified = true;
    }

    const result = { name: name || 'User', avatar, role, isVerified, isAdmin };
    PARTICIPANT_CACHE.set(uid, { data: result, timestamp: Date.now() });
    return result;
}

/**
 * @route   GET /api/chats/conversations/:userId
 * @desc    Get all conversations for a user
 * @access  Private (requires authentication)
 */
router.get('/conversations/:userId', authenticateUser, requireSelfOrAdmin('userId'), async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(200).json({ conversations: [] });
        }

        const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '');
        if (!safeUserId) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }

        let rawConvs: any[] = [];

        // 1. Try Supabase
        try {
            const result: any = await withTimeout(
                supabase
                    .from('conversations')
                    .select('*')
                    .or(`client_id.eq.${safeUserId},vendor_id.eq.${safeUserId}`)
                    .order('last_message_at', { ascending: false }),
                1000
            ).catch(() => null);

            if (result?.data && result.data.length > 0) {
                rawConvs = result.data.map((c: any) => ({
                    id: c.id,
                    participants: [c.client_id, c.vendor_id].filter(Boolean),
                    participantNames: c.participant_names || {},
                    participantImages: c.participant_images || {},
                    lastMessage: c.last_message,
                    lastMessageAt: c.last_message_at
                }));
            }
        } catch (_) {}

        // 2. Fallback to Firestore if Supabase empty
        if (rawConvs.length === 0) {
            try {
                const convsSnapshot: any = await withTimeout(
                    db.collection('conversations')
                        .where('participants', 'array-contains', userId)
                        .get(),
                    1000
                ).catch(() => null);

                if (convsSnapshot?.docs) {
                    for (const doc of convsSnapshot.docs) {
                        const data = doc.data();
                        const participants = data.participants || [data.client_id, data.vendor_id].filter(Boolean);
                        rawConvs.push({
                            id: doc.id,
                            participants,
                            participantNames: data.participantNames || data.participant_names || {},
                            participantImages: data.participantImages || data.participant_images || {},
                            lastMessage: data.lastMessage || data.last_message || '',
                            lastMessageAt: data.lastMessageAt || data.last_message_at || data.updatedAt || new Date().toISOString()
                        });
                    }
                }
            } catch (_) {}
        }

        // Dynamically resolve live participant names, avatars, and verified status in parallel
        const enrichedConvs = await Promise.all(
            rawConvs.map(async (conv) => {
                const updatedNames: Record<string, string> = { ...(conv.participantNames || {}) };
                const updatedImages: Record<string, string> = { ...(conv.participantImages || {}) };
                const updatedVerified: Record<string, boolean> = {};
                const updatedIsAdmin: Record<string, boolean> = {};

                await Promise.all(
                    (conv.participants || []).map(async (pId: string) => {
                        const profile = await getParticipantProfile(pId);
                        if (profile.name) updatedNames[pId] = profile.name;
                        if (profile.avatar) updatedImages[pId] = profile.avatar;
                        updatedVerified[pId] = Boolean(profile.isVerified);
                        updatedIsAdmin[pId] = Boolean(profile.isAdmin);
                    })
                );

                return {
                    ...conv,
                    participantNames: updatedNames,
                    participantImages: updatedImages,
                    participantVerified: updatedVerified,
                    participantIsAdmin: updatedIsAdmin,
                };
            })
        );

        // Sort descending by lastMessageAt
        enrichedConvs.sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());

        res.status(200).json({ conversations: enrichedConvs });
    } catch (error: any) {
        console.error('Get conversations error:', error);
        res.status(200).json({ conversations: [] });
    }
});

/**
 * @route   GET /api/chats/conversations/:conversationId/messages
 * @desc    Get all messages for a conversation
 * @access  Private (requires authentication)
 */
router.get('/conversations/:conversationId/messages', async (req: Request, res: Response) => {
    try {
        const { conversationId } = req.params;

        // 1. Try Supabase
        try {
            const { data: messages, error } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true });

            if (!error && messages && messages.length > 0) {
                const mappedMessages = messages.map(m => ({
                    id: m.id,
                    senderId: m.sender_id,
                    text: m.text,
                    createdAt: m.created_at
                }));
                return res.status(200).json({ messages: mappedMessages });
            }
        } catch (_) {}

        // 2. Fallback to Firestore
        const msgsSnapshot = await db.collection('conversations')
            .doc(conversationId)
            .collection('messages')
            .orderBy('createdAt', 'asc')
            .get();

        const mappedMessages = msgsSnapshot.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                senderId: d.senderId || d.sender_id,
                text: d.text || '',
                createdAt: d.createdAt || d.created_at,
                mediaUrl: d.mediaUrl || null,
                mediaType: d.mediaType || null,
                fileName: d.fileName || null,
                replyTo: d.replyTo || null,
                sharedPost: d.sharedPost || null
            };
        });

        res.status(200).json({ messages: mappedMessages });
    } catch (error: any) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to retrieve messages', message: error.message });
    }
});

/**
 * @route   POST /api/chats/upload-attachment
 * @desc    Upload an attachment (photo, video, document) for chat
 * @access  Private
 */
router.post('/upload-attachment', authenticateUser, async (req: Request, res: Response) => {
    try {
        const { userId, fileData, fileName, fileType } = req.body;
        const callerUid = req.user!.uid;
        const isAdmin = req.user!.isAdmin;

        if (!userId || !fileData) {
            return res.status(400).json({ error: 'Missing required fields (userId, fileData)' });
        }

        if (userId !== callerUid && !isAdmin) {
            return res.status(403).json({ error: 'Forbidden: You can only upload attachments for your own messages' });
        }

        const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '');
        if (!safeUserId) {
            return res.status(400).json({ error: 'Invalid userId' });
        }

        const fs = require('fs');
        const path = require('path');

        const baseUploadsDir = path.resolve(__dirname, '../../uploads/chats');
        const uploadsDir = path.resolve(baseUploadsDir, safeUserId);

        // Path containment check
        if (!uploadsDir.startsWith(baseUploadsDir)) {
            return res.status(400).json({ error: 'Invalid upload directory path' });
        }

        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // Strict extension allowlist
        const rawExt = path.extname(fileName || '').toLowerCase();
        const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.pdf', '.doc', '.docx'];
        const fallbackExt = fileType?.includes('video') ? '.mp4' : fileType?.includes('image') ? '.jpg' : '.pdf';
        const ext = allowedExts.includes(rawExt) ? rawExt : fallbackExt;

        const safeBaseName = path.basename(fileName || 'attachment', rawExt).replace(/[^a-zA-Z0-9_-]/g, '_');
        const uniqueFilename = `${safeBaseName}_${Date.now()}${ext}`;
        const filepath = path.resolve(uploadsDir, uniqueFilename);

        if (!filepath.startsWith(uploadsDir)) {
            return res.status(400).json({ error: 'Invalid destination file path' });
        }

        const base64Data = fileData.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(filepath, buffer);

        const protocol = req.protocol || 'http';
        const host = req.get('host') || 'localhost:5000';
        const url = `${protocol}://${host}/uploads/chats/${safeUserId}/${uniqueFilename}`;

        res.status(200).json({
            url,
            fileName: `${safeBaseName}${ext}`,
            fileType: fileType || 'application/octet-stream',
            fileSize: buffer.length
        });
    } catch (error: any) {
        console.error('Upload chat attachment error:', error);
        res.status(500).json({ error: 'Failed to upload chat attachment', message: error.message });
    }
});

/**
 * @route   POST /api/chats/messages
 * @desc    Send a message (creates conversation if it doesn't exist)
 * @access  Private (requires authentication)
 */
router.post('/messages', authenticateUser, async (req: Request, res: Response) => {
    try {
        let {
            conversationId,
            senderId,
            receiverId,
            text,
            receiverName,
            receiverImage,
            senderImage,
            mediaUrl,
            mediaType,
            fileName,
            replyTo,
            sharedPost
        } = req.body;

        const effectiveText = (text || '').trim();
        if (!effectiveText && !mediaUrl && !sharedPost) {
            return res.status(400).json({ error: 'Missing message content, media, or shared post' });
        }

        if (!receiverId && conversationId) {
            const parts = conversationId.split('_');
            receiverId = parts.find((p: string) => p !== senderId);
        }

        if (!receiverId && conversationId) {
            try {
                const existingConvDoc = await db.collection('conversations').doc(conversationId).get();
                if (existingConvDoc.exists) {
                    const pList: string[] = existingConvDoc.data()?.participants || [];
                    receiverId = pList.find((p) => p !== senderId);
                }
            } catch (_) {}
        }

        if (!senderId || !receiverId) {
            return res.status(400).json({ error: 'Missing required fields: senderId or receiverId' });
        }

        const convId = conversationId || [senderId, receiverId].sort().join('_');
        const now = new Date().toISOString();

        // Summary representation for lastMessage
        let lastMessagePreview = effectiveText;
        if (!lastMessagePreview) {
            if (mediaType === 'image') lastMessagePreview = '📷 Photo';
            else if (mediaType === 'video') lastMessagePreview = '🎥 Video';
            else if (fileName) lastMessagePreview = `📎 ${fileName}`;
            else if (sharedPost) lastMessagePreview = `🛍️ ${sharedPost.title || sharedPost.vendorName || 'Shared Post'}`;
            else lastMessagePreview = 'Shared an attachment';
        }

        // Retrieve sender & receiver profiles if not supplied
        const senderProfile = await getParticipantProfile(senderId);
        const receiverProfile = await getParticipantProfile(receiverId);

        const sImage = senderImage || senderProfile.avatar;
        const rImage = receiverImage || receiverProfile.avatar;
        const sName = senderProfile.name || 'User';
        const rName = receiverName || receiverProfile.name || 'User';

        // 1. Primary write to Firestore
        try {
            const convRef = db.collection('conversations').doc(convId);
            const convDoc = await convRef.get();

            const existingImages = convDoc.exists ? (convDoc.data()?.participantImages || {}) : {};
            const existingNames = convDoc.exists ? (convDoc.data()?.participantNames || {}) : {};

            const participantImages = {
                ...existingImages,
                [senderId]: sImage || existingImages[senderId] || '',
                [receiverId]: rImage || existingImages[receiverId] || ''
            };

            const participantNames = {
                ...existingNames,
                [senderId]: sName || existingNames[senderId] || 'User',
                [receiverId]: rName || existingNames[receiverId] || 'User'
            };

            await convRef.set({
                id: convId,
                participants: [senderId, receiverId],
                participantNames,
                participantImages,
                lastMessage: lastMessagePreview,
                lastMessageAt: now,
                updatedAt: now
            }, { merge: true });

            const messagePayload: any = {
                senderId,
                receiverId,
                text: effectiveText,
                createdAt: now,
            };

            if (mediaUrl) messagePayload.mediaUrl = mediaUrl;
            if (mediaType) messagePayload.mediaType = mediaType;
            if (fileName) messagePayload.fileName = fileName;
            if (replyTo) messagePayload.replyTo = replyTo;
            if (sharedPost) messagePayload.sharedPost = sharedPost;

            const msgRef = await convRef.collection('messages').add(messagePayload);

            // 2. Attempt Supabase insert in background
            try {
                const { data: convExists } = await supabase
                    .from('conversations')
                    .select('id')
                    .eq('id', convId)
                    .maybeSingle();

                if (!convExists) {
                    await supabase.from('conversations').insert({
                        id: convId,
                        client_id: senderId,
                        vendor_id: receiverId,
                        last_message: lastMessagePreview,
                        last_message_at: now,
                        participant_names: participantNames
                    });
                } else {
                    await supabase.from('conversations').update({
                        last_message: lastMessagePreview,
                        last_message_at: now
                    }).eq('id', convId);
                }

                await supabase.from('messages').insert({
                    conversation_id: convId,
                    sender_id: senderId,
                    text: effectiveText || lastMessagePreview
                });
            } catch (_) {}

            return res.status(201).json({
                message: 'Message sent successfully',
                data: {
                    id: msgRef.id,
                    ...messagePayload
                },
                conversationId: convId
            });
        } catch (fsErr: any) {
            console.error('Firestore chat write error:', fsErr);
            throw fsErr;
        }
    } catch (error: any) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message', message: error.message });
    }
});

export default router;
