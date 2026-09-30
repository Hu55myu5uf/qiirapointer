import fetch from 'node-fetch';

interface ExpoPushMessage {
    to: string;
    title: string;
    body: string;
    data?: Record<string, any>;
    sound?: 'default' | null;
    badge?: number;
}

/**
 * Send a push notification via Expo Push API
 */
export async function sendPushNotification(
    pushToken: string,
    title: string,
    body: string,
    data?: Record<string, any>
): Promise<boolean> {
    // Validate Expo push token format
    if (!pushToken.startsWith('ExponentPushToken[') && !pushToken.startsWith('ExpoPushToken[')) {
        console.error('Invalid Expo push token format:', pushToken);
        return false;
    }

    const message: ExpoPushMessage = {
        to: pushToken,
        title,
        body,
        sound: 'default',
        data: data || {},
    };

    try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });

        const result = await response.json();
        console.log('Push notification sent:', result);

        if (result.data?.status === 'error') {
            console.error('Push notification error:', result.data.message);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error sending push notification:', error);
        return false;
    }
}

/**
 * Send notification for vendor approval status change
 */
export async function notifyVendorApproval(
    pushToken: string,
    status: 'approved' | 'rejected',
    businessName: string,
    rejectionReason?: string
): Promise<boolean> {
    const title = status === 'approved'
        ? '🎉 Congratulations!'
        : '❌ Verification Update';

    const body = status === 'approved'
        ? `Your business "${businessName}" has been approved! You can now start receiving customers.`
        : `Your business "${businessName}" verification was not approved. ${rejectionReason || 'Please contact support for details.'}`;

    return sendPushNotification(pushToken, title, body, { type: 'vendor_approval', status });
}

/**
 * Send notification for new review
 */
export async function notifyNewReview(
    pushToken: string,
    reviewerName: string,
    rating: number,
    businessName: string
): Promise<boolean> {
    const stars = '⭐'.repeat(rating);
    const title = `New ${rating}-Star Review!`;
    const body = `${reviewerName} left a ${stars} review on ${businessName}`;

    return sendPushNotification(pushToken, title, body, { type: 'new_review', rating });
}
