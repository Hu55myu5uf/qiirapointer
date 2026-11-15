import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { authAPI } from './api';

/**
 * Push notifications (new messages, incoming calls, verification results, reviews).
 *
 * Android delivers through Firebase Cloud Messaging, which needs google-services.json in the
 * build. Until that is configured, set EXPO_PUBLIC_PUSH_ENABLED to anything but "true" and this
 * module does nothing (requesting a push token without FCM configured fails on Android).
 */
const PUSH_ENABLED = process.env.EXPO_PUBLIC_PUSH_ENABLED === 'true';

// Show notifications while the app is open too (as a banner, without interrupting)
try {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
        }),
    });
} catch {
    // not available on this platform (e.g. web)
}

async function ensureAndroidChannels() {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync('default', {
        name: 'General',
        importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
    });
    await Notifications.setNotificationChannelAsync('calls', {
        name: 'Incoming calls',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 300, 400],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
}

/** Ask permission and return this device's Expo push token (null if unavailable or declined). */
export async function registerForPushNotifications(): Promise<string | null> {
    if (!PUSH_ENABLED || Platform.OS === 'web' || !Device.isDevice) return null;
    try {
        await ensureAndroidChannels();

        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== 'granted') {
            status = (await Notifications.requestPermissionsAsync()).status;
        }
        if (status !== 'granted') return null;

        const projectId = Constants.expoConfig?.extra?.eas?.projectId || (Constants as any).easConfig?.projectId;
        if (!projectId) return null;
        const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
        return data || null;
    } catch (error: any) {
        console.warn('Push registration skipped:', error?.message);
        return null;
    }
}

export async function savePushToken(userId: string, token: string): Promise<void> {
    try {
        if (!token) return;
        await authAPI.updateProfile(userId, { pushToken: token });
    } catch (error: any) {
        console.warn('Saving push token failed:', error?.message);
    }
}

export type NotificationTarget =
    | { type: 'message'; conversationId: string; senderId?: string }
    | { type: 'call'; callId: string }
    | { type: 'vendor_approval' }
    | { type: 'new_review' };

/**
 * Listen for notification taps (including the one that opened the app).
 * Returns an unsubscribe function.
 */
export function addNotificationListeners(onOpen: (target: NotificationTarget) => void): () => void {
    if (Platform.OS === 'web') return () => {};
    const handle = (response: Notifications.NotificationResponse | null) => {
        const data: any = response?.notification?.request?.content?.data;
        if (data?.type) onOpen(data as NotificationTarget);
    };
    // App opened by tapping a notification
    Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
}
