import { authAPI } from './api';

/**
 * Push notifications service (safe universal stub for standalone builds without FCM).
 */

export async function registerForPushNotifications(): Promise<string | null> {
    // Return null safely without crashing when FCM/expo-notifications native service is omitted
    return null;
}

export async function savePushToken(userId: string, token: string): Promise<void> {
    try {
        if (!token) return;
        await authAPI.updateProfile(userId, { pushToken: token });
        console.log('Push token saved to database');
    } catch (error) {
        console.error('Error saving push token:', error);
    }
}

export async function getUserPushToken(userId: string): Promise<string | null> {
    try {
        const response = await authAPI.getUser(userId);
        return response.data?.user?.pushToken || null;
    } catch (error) {
        console.error('Error getting push token:', error);
        return null;
    }
}

export function addNotificationListeners(
    onNotificationReceived?: (notification: any) => void,
    onNotificationResponse?: (response: any) => void
) {
    return () => {};
}

export async function scheduleLocalNotification(title: string, body: string): Promise<void> {
    console.log('[Notification]', title, body);
}
