import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { authAPI } from './api';

// Detect if running inside Expo Go (push notifications not supported from SDK 53+)
const isExpoGo = Constants.appOwnership === 'expo';

// Conditionally load expo-notifications only outside Expo Go.
// The module registers internal push-token listeners on import,
// which throws in Expo Go since SDK 53.
let Notifications: typeof import('expo-notifications') | null = null;

if (!isExpoGo) {
    try {
        Notifications = require('expo-notifications');
    } catch (e) {
        console.warn('expo-notifications could not be loaded:', e);
    }
}

// Configure how notifications appear when app is in foreground
if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
    try {
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: true,
                shouldShowBanner: true,
                shouldShowList: true,
            }),
        });
    } catch (e) {
        console.warn('Failed to set notification handler:', e);
    }
}

/**
 * Register for push notifications and get the Expo push token
 */
export async function registerForPushNotifications(): Promise<string | null> {
    if (!Notifications) {
        console.log('Running in Expo Go – push notifications skipped. Use a development build for full support.');
        return null;
    }

    // Must be on a physical device
    if (!Device.isDevice) {
        console.log('Push notifications require a physical device');
        return null;
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not granted
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        console.log('Push notification permissions not granted');
        return null;
    }

    // Get Expo push token
    let token: string | null = null;
    try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId
            ?? Constants.easConfig?.projectId;

        const tokenResponse = await Notifications.getExpoPushTokenAsync({
            projectId,
        });
        token = tokenResponse.data;
        console.log('Expo push token:', token);
    } catch (error) {
        console.error('Error getting push token:', error);
    }

    // Android-specific channel setup
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#6B4CE6',
        });
    }

    return token;
}

/**
 * Save push token to database for a user
 */
export async function savePushToken(userId: string, token: string): Promise<void> {
    try {
        await authAPI.updateProfile(userId, { pushToken: token });
        console.log('Push token saved to database');
    } catch (error) {
        console.error('Error saving push token:', error);
    }
}

/**
 * Get push token for a user from database
 */
export async function getUserPushToken(userId: string): Promise<string | null> {
    try {
        const response = await authAPI.getUser(userId);
        return response.data?.user?.pushToken || null;
    } catch (error) {
        console.error('Error getting push token:', error);
        return null;
    }
}

/**
 * Add notification listeners
 */
export function addNotificationListeners(
    onNotificationReceived?: (notification: any) => void,
    onNotificationResponse?: (response: any) => void
) {
    if (!Notifications) {
        console.log('Running in Expo Go – notification listeners skipped.');
        return () => {};
    }

    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
        console.log('Notification received:', notification);
        onNotificationReceived?.(notification);
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
        console.log('Notification response:', response);
        onNotificationResponse?.(response);
    });

    return () => {
        receivedSubscription.remove();
        responseSubscription.remove();
    };
}

/**
 * Schedule a local notification (for testing)
 */
export async function scheduleLocalNotification(title: string, body: string): Promise<void> {
    if (!Notifications) {
        console.log('Running in Expo Go – local notifications skipped.');
        return;
    }

    await Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            sound: true,
        },
        trigger: null, // Immediate
    });
}
