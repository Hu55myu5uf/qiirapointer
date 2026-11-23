import { db } from '../config/firebase';

/**
 * In-app notifications (the Notifications page). Each user's live in users/{uid}/notifications,
 * newest first. Only the server writes them; users read and mark their own through the API.
 * Writing one is best-effort: a failure is logged and never breaks the action that caused it.
 *
 * Push notifications (utils/pushNotifications) are separate: they alert the phone, these are
 * the history the user can scroll back through.
 */
export type NotificationType =
    | 'missed_call'
    | 'review'
    | 'verification_approved'
    | 'verification_rejected'
    | 'listing_rejected'
    | 'mention'
    | 'system';

export interface NotificationInput {
    type: NotificationType;
    title: string;
    body: string;
    actorId?: string | null;
    actorName?: string | null;
    actorAvatar?: string | null;
    /** Where tapping it leads (ids only, never secrets) */
    data?: Record<string, string | number | boolean | null>;
}

export const MAX_TITLE = 120;
export const MAX_BODY = 300;

const clip = (s: unknown, n: number) => {
    const t = String(s ?? '').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

export const notificationsOf = (uid: string) => db.collection('users').doc(uid).collection('notifications');

/** Add a notification for `uid`. Returns its id, or null if it couldn't be written. */
export async function createNotification(uid: string, n: NotificationInput, id?: string): Promise<string | null> {
    if (!uid) return null;
    try {
        const ref = id ? notificationsOf(uid).doc(id) : notificationsOf(uid).doc();
        const batch = db.batch();
        batch.set(ref, {
            type: n.type,
            title: clip(n.title, MAX_TITLE),
            body: clip(n.body, MAX_BODY),
            actorId: n.actorId || null,
            actorName: n.actorName ? clip(n.actorName, 80) : null,
            actorAvatar: n.actorAvatar || null,
            data: n.data || {},
            read: false,
            createdAt: new Date().toISOString(),
        });
        // Notifications name the person who caused them. A link kept under that person lets
        // their account deletion remove these too (without a cross-user database index).
        if (n.actorId && n.actorId !== uid) {
            batch.set(db.collection('users').doc(n.actorId).collection('notification_links').doc(`${uid}__${ref.id}`), { path: ref.path });
        }
        await batch.commit();
        return ref.id;
    } catch (e: any) {
        console.warn('Notification not saved:', e?.message);
        return null;
    }
}
