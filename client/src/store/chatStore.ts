import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { subscribeToConversations, countUnread, ConversationSummary } from '../services/realtime';

const STORAGE_KEY = 'QIIRA_READ_CHATS';

/**
 * One app-wide, real-time subscription to the signed-in user's conversations.
 * The unread badge, the inbox and chat screens all read from here — no polling.
 */
interface ChatState {
    uid: string | null;
    conversations: ConversationSummary[];
    conversationsLoaded: boolean;
    unreadCount: number;
    readTimestamps: Record<string, string>; // conversationId -> lastReadAt ISO string
    start: (uid: string) => void;
    stop: () => void;
    loadReadTimestamps: () => Promise<void>;
    markAsRead: (conversationId: string) => Promise<void>;
    /** Kept for existing callers: recalculates the badge from live data (no network request). */
    refreshUnreadCount: (userId?: string) => Promise<void>;
}

let unsubscribe: (() => void) | null = null;

export const useChatStore = create<ChatState>((set, get) => ({
    uid: null,
    conversations: [],
    conversationsLoaded: false,
    unreadCount: 0,
    readTimestamps: {},

    start: (uid: string) => {
        if (get().uid === uid && unsubscribe) return;
        get().stop();
        set({ uid, conversations: [], conversationsLoaded: false, unreadCount: 0 });
        get().loadReadTimestamps();
        unsubscribe = subscribeToConversations(
            uid,
            conversations => set({
                conversations,
                conversationsLoaded: true,
                unreadCount: countUnread(conversations, uid, get().readTimestamps),
            }),
            error => {
                console.warn('Conversation listener error:', error.message);
                set({ conversationsLoaded: true });
            },
        );
    },

    stop: () => {
        unsubscribe?.();
        unsubscribe = null;
        set({ uid: null, conversations: [], conversationsLoaded: false, unreadCount: 0 });
    },

    loadReadTimestamps: async () => {
        try {
            const stored = await AsyncStorage.getItem(STORAGE_KEY);
            if (stored) {
                const readTimestamps = JSON.parse(stored);
                const { uid, conversations } = get();
                set({ readTimestamps, unreadCount: uid ? countUnread(conversations, uid, readTimestamps) : 0 });
            }
        } catch (e) {
            console.error('Error loading read timestamps:', e);
        }
    },

    markAsRead: async (conversationId: string) => {
        if (!conversationId) return;
        const readTimestamps = { ...get().readTimestamps, [conversationId]: new Date().toISOString() };
        const { uid, conversations } = get();
        set({ readTimestamps, unreadCount: uid ? countUnread(conversations, uid, readTimestamps) : 0 });
        try {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(readTimestamps));
        } catch (e) {
            console.error('Error saving read timestamps:', e);
        }
    },

    refreshUnreadCount: async () => {
        const { uid, conversations, readTimestamps } = get();
        if (uid) set({ unreadCount: countUnread(conversations, uid, readTimestamps) });
    },
}));
