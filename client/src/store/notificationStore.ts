import { create } from 'zustand';
import { AppState } from 'react-native';
import { notificationAPI } from '../services/api';
import { auth } from '../config/firebase';

/**
 * Unread count for the Notifications bell. Refreshed when the app opens or comes back to the
 * foreground, when a push notification arrives, every couple of minutes while in use, and after
 * the Notifications page marks things read.
 */
interface NotificationState {
    unreadCount: number;
    refresh: () => Promise<void>;
    setUnread: (n: number) => void;
    start: () => void;
    stop: () => void;
}

let timer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let inFlight = false;

export const useNotificationStore = create<NotificationState>((set, get) => ({
    unreadCount: 0,
    setUnread: (n) => set({ unreadCount: Math.max(0, n) }),
    refresh: async () => {
        if (inFlight || !auth.currentUser) return;
        inFlight = true;
        try {
            const res = await notificationAPI.unreadCount();
            set({ unreadCount: Number(res.data?.count) || 0 });
        } catch {
            // offline or signed out: keep the last known count
        } finally {
            inFlight = false;
        }
    },
    start: () => {
        get().stop();
        get().refresh();
        timer = setInterval(() => {
            if (AppState.currentState === 'active') get().refresh();
        }, 120_000);
        appStateSub = AppState.addEventListener('change', (s) => { if (s === 'active') get().refresh(); });
    },
    stop: () => {
        if (timer) clearInterval(timer);
        timer = null;
        appStateSub?.remove();
        appStateSub = null;
        set({ unreadCount: 0 });
    },
}));
