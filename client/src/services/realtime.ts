/**
 * Real-time listeners (Firestore, read-only). These replace the old 3–5 second polling.
 * Security rules only let a signed-in user read conversations they take part in; every write
 * (sending messages etc.) still goes through the QIIRA API so blocks and limits are enforced.
 */
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { firestore } from '../config/firebase';

export interface ConversationSummary {
    id: string;
    participants: string[];
    participantNames: Record<string, string>;
    participantImages: Record<string, string>;
    lastMessage: string;
    lastMessageAt: string | null;
    lastSenderId: string | null;
}

export interface ChatMessage {
    id: string;
    senderId: string;
    text: string;
    createdAt: string;
    mediaUrl?: string | null;
    mediaType?: string | null;
    fileName?: string | null;
    replyTo?: any;
    sharedPost?: any;
    messageType?: string;
    orderData?: any;
}

type Unsubscribe = () => void;

/** All conversations of `uid`, newest first. */
export function subscribeToConversations(
    uid: string,
    onChange: (conversations: ConversationSummary[]) => void,
    onError?: (e: Error) => void,
): Unsubscribe {
    const q = query(collection(firestore, 'conversations'), where('participants', 'array-contains', uid));
    return onSnapshot(q, snap => {
        const list = snap.docs.map(d => {
            const x: any = d.data();
            return {
                id: d.id,
                participants: x.participants || [],
                participantNames: x.participantNames || {},
                participantImages: x.participantImages || {},
                lastMessage: x.lastMessage || '',
                lastMessageAt: x.lastMessageAt || x.updatedAt || null,
                lastSenderId: x.lastSenderId || null,
            };
        }).sort((a, b) => String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || '')));
        onChange(list);
    }, err => onError?.(err));
}

/** The latest 200 messages of a conversation, oldest first. */
export function subscribeToMessages(
    conversationId: string,
    onChange: (messages: ChatMessage[]) => void,
    onError?: (e: Error) => void,
): Unsubscribe {
    const q = query(
        collection(firestore, 'conversations', conversationId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(200),
    );
    return onSnapshot(q, snap => {
        const msgs = snap.docs.map(d => {
            const x: any = d.data();
            return {
                id: d.id,
                senderId: x.senderId,
                text: x.text || '',
                createdAt: x.createdAt,
                mediaUrl: x.mediaUrl || null,
                mediaType: x.mediaType || null,
                fileName: x.fileName || null,
                replyTo: x.replyTo || null,
                sharedPost: x.sharedPost || null,
                messageType: x.messageType || 'text',
                orderData: x.orderData || null,
            };
        }).reverse();
        onChange(msgs);
    }, err => onError?.(err));
}

const RING_TIMEOUT_MS = 45_000;

/** The newest call ringing for `uid` (or null). Fires instantly when someone calls. */
export function subscribeToIncomingCalls(
    uid: string,
    onChange: (call: any | null) => void,
    onError?: (e: Error) => void,
): Unsubscribe {
    // Equality filter only (status is checked here), so no composite index is needed
    const q = query(collection(firestore, 'calls'), where('receiverId', '==', uid));
    return onSnapshot(q, snap => {
        const now = Date.now();
        const ringing = snap.docs
            .map(d => ({ id: d.id, ...(d.data() as any) }))
            .filter(c => c.status === 'ringing' && now - new Date(c.createdAt).getTime() <= RING_TIMEOUT_MS)
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        onChange(ringing[0] || null);
    }, err => onError?.(err));
}

/** Live status of one call (connected / ended / rejected / missed). */
export function subscribeToCall(
    callId: string,
    onChange: (call: any | null) => void,
    onError?: (e: Error) => void,
): Unsubscribe {
    return onSnapshot(doc(firestore, 'calls', callId), snap => {
        onChange(snap.exists() ? { id: snap.id, ...(snap.data() as any) } : null);
    }, err => onError?.(err));
}

/** Count conversations with a message from someone else that arrived after we last read it. */
export function countUnread(conversations: ConversationSummary[], uid: string, readTimestamps: Record<string, string>): number {
    let count = 0;
    for (const c of conversations) {
        if (!c.lastMessageAt) continue;
        if (c.lastSenderId && c.lastSenderId === uid) continue; // our own message is never "unread"
        const lastRead = readTimestamps[c.id];
        if (!lastRead || new Date(c.lastMessageAt).getTime() > new Date(lastRead).getTime() + 1000) count++;
    }
    return count;
}

export { doc };
