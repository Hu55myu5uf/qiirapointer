import fetch from 'node-fetch';
import { db } from '../config/firebase';

/**
 * Push notifications via the Expo Push API (which delivers through Firebase Cloud Messaging on
 * Android and APNs on iOS). Every send is best-effort: failures are logged, never thrown, and
 * tokens Expo reports as dead (app uninstalled) are removed from the user's profile.
 */

interface ExpoPushMessage {
    to: string;
    title: string;
    body: string;
    data?: Record<string, any>;
    sound?: 'default' | null;
    priority?: 'default' | 'normal' | 'high';
    channelId?: string;
    ttl?: number;
}

const isExpoToken = (t: unknown): t is string =>
    typeof t === 'string' && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(t);

export async function sendPushNotification(
    pushToken: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    options: { priority?: 'default' | 'high'; channelId?: string; ttl?: number; uid?: string } = {},
): Promise<boolean> {
    if (!isExpoToken(pushToken)) return false;

    const message: ExpoPushMessage = {
        to: pushToken,
        title,
        body: body.length > 180 ? body.slice(0, 177) + '…' : body,
        sound: 'default',
        data: data || {},
        priority: options.priority || 'default',
        channelId: options.channelId || 'default',
        ...(options.ttl ? { ttl: options.ttl } : {}),
    };

    try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        });
        const result: any = await response.json();
        const ticket = Array.isArray(result?.data) ? result.data[0] : result?.data;

        if (ticket?.status === 'error') {
            // The app was uninstalled or the token expired: stop sending to it
            if (ticket?.details?.error === 'DeviceNotRegistered' && options.uid) {
                await db.collection('users').doc(options.uid).set({ pushToken: null }, { merge: true }).catch(() => {});
            }
            console.warn('Push not delivered:', ticket?.details?.error || ticket?.message);
            return false;
        }
        return true;
    } catch (error: any) {
        console.warn('Push send error:', error?.message);
        return false;
    }
}

/** Look up a user's push token and send (skips users without notifications). */
export async function notifyUser(
    uid: string,
    title: string,
    body: string,
    data: Record<string, any>,
    options: { priority?: 'default' | 'high'; channelId?: string; ttl?: number } = {},
): Promise<boolean> {
    try {
        const doc = await db.collection('users').doc(uid).get();
        const token = doc.data()?.pushToken;
        if (!isExpoToken(token)) return false;
        return sendPushNotification(token, title, body, data, { ...options, uid });
    } catch {
        return false;
    }
}

/** New chat message ("Sameer Lukman: Is this still available?") */
export function notifyNewMessage(receiverId: string, senderName: string, preview: string, conversationId: string, senderId: string) {
    return notifyUser(receiverId, senderName, preview || 'Sent you a message', {
        type: 'message', conversationId, senderId,
    }, { channelId: 'messages' });
}

/** Incoming in-app call: high priority, expires with the ring timeout */
export function notifyIncomingCall(receiverId: string, callerName: string, callType: 'voice' | 'video', callId: string) {
    return notifyUser(receiverId, `Incoming ${callType} call`, `${callerName} is calling you on Pointer`, {
        type: 'call', callId, callType,
    }, { priority: 'high', channelId: 'calls', ttl: 45 });
}

/** Verification approved / rejected */
export async function notifyVendorApproval(
    pushToken: string,
    status: 'approved' | 'rejected',
    businessName: string,
    rejectionReason?: string
): Promise<boolean> {
    const title = status === 'approved' ? '🎉 You are verified!' : 'Verification update';
    const body = status === 'approved'
        ? `"${businessName}" is now verified on Pointer.`
        : `"${businessName}" could not be verified. ${rejectionReason || 'Please check the app for details.'}`;
    return sendPushNotification(pushToken, title, body, { type: 'vendor_approval', status });
}

/** New review of a vendor's business */
export async function notifyNewReview(
    pushToken: string,
    reviewerName: string,
    rating: number,
    businessName: string
): Promise<boolean> {
    const stars = '⭐'.repeat(Math.max(1, Math.min(5, Math.round(rating))));
    return sendPushNotification(pushToken, `New ${rating}-star review`, `${reviewerName} left a ${stars} review on ${businessName}`, {
        type: 'new_review', rating,
    });
}
