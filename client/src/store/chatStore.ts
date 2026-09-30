import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { chatAPI } from '../services/api';

const STORAGE_KEY = 'QIIRA_READ_CHATS';

interface ChatState {
    unreadCount: number;
    readTimestamps: Record<string, string>; // conversationId -> lastReadAt ISO string
    loadReadTimestamps: () => Promise<void>;
    markAsRead: (conversationId: string) => Promise<void>;
    refreshUnreadCount: (userId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
    unreadCount: 0,
    readTimestamps: {},

    loadReadTimestamps: async () => {
        try {
            const stored = await AsyncStorage.getItem(STORAGE_KEY);
            if (stored) {
                set({ readTimestamps: JSON.parse(stored) });
            }
        } catch (e) {
            console.error('Error loading read timestamps:', e);
        }
    },

    markAsRead: async (conversationId: string) => {
        if (!conversationId) return;
        const now = new Date().toISOString();
        const updated = { ...get().readTimestamps, [conversationId]: now };
        set({ readTimestamps: updated });
        try {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
            console.error('Error saving read timestamps:', e);
        }
    },

    refreshUnreadCount: async (userId: string) => {
        if (!userId) {
            set({ unreadCount: 0 });
            return;
        }

        try {
            const res = await chatAPI.getConversations(userId);
            const conversations: any[] = res.data.conversations || [];
            const readMap = get().readTimestamps;

            let count = 0;
            for (const conv of conversations) {
                if (!conv.lastMessageAt) continue;
                const lastRead = readMap[conv.id];
                if (!lastRead) {
                    // Never opened
                    count++;
                } else {
                    const lastMsgTime = new Date(conv.lastMessageAt).getTime();
                    const readTime = new Date(lastRead).getTime();
                    if (lastMsgTime > readTime + 1000) {
                        count++;
                    }
                }
            }

            set({ unreadCount: count });
        } catch (e) {
            // Silently handle background refresh error
        }
    },
}));
