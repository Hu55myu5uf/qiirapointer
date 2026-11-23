import { db } from '../config/firebase';
import { uidForUsername, normalizeUsername } from './usernames';
import { getDisplayProfile, DisplayProfile } from './profiles';
import { createNotification } from './notifications';
import { notifyUser } from './pushNotifications';

/**
 * @mentions in posts and comments.
 *
 * The text keeps the "@name" as typed; the server resolves the names to accounts when the post
 * or comment is created and stores them as `mentions: [{ uid, username }]`. At most 10 people
 * per post/comment. Nobody is mentioned (or notified) if either side has blocked the other, or
 * if their account is suspended. Mentioning yourself does nothing.
 */
export const MAX_MENTIONS = 10;

export type Mention = { uid: string; username: string };

/** "@ada.k hi @Bola_ and @ada.k" -> ["ada.k", "bola_"] (unique, in order, max 10) */
export function extractMentionNames(text: string): string[] {
    const out: string[] = [];
    const re = /(^|[^A-Za-z0-9_.@])@([A-Za-z0-9._]{3,31})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(String(text || ''))) && out.length < MAX_MENTIONS) {
        const name = normalizeUsername(m[2]).replace(/\.+$/, ''); // "@ada." at the end of a sentence
        if (name.length >= 3 && name.length <= 30 && !out.includes(name)) out.push(name);
    }
    return out;
}

/** Resolve the @names in `text` to accounts the author is allowed to mention. */
export async function resolveMentions(text: string, authorUid: string): Promise<Mention[]> {
    const names = extractMentionNames(text);
    if (!names.length) return [];
    const author = await getDisplayProfile(authorUid);
    const found = await Promise.all(names.map(async username => ({ username, uid: await uidForUsername(username) })));
    const result: Mention[] = [];
    for (const f of found) {
        if (!f.uid || f.uid === authorUid || result.some(r => r.uid === f.uid)) continue;
        const [person, userDoc] = await Promise.all([getDisplayProfile(f.uid), db.collection('users').doc(f.uid).get()]);
        if (!userDoc.exists || userDoc.data()?.isSuspended) continue;
        if (person.blockedUserIds.includes(authorUid) || author.blockedUserIds.includes(f.uid)) continue;
        result.push({ uid: f.uid, username: f.username });
    }
    return result;
}

/** Tell the mentioned people (Notifications page + push). One notification per person per post/comment. */
export async function notifyMentions(
    mentions: Mention[],
    author: DisplayProfile,
    ctx: { postId: string; commentId?: string; text: string },
): Promise<void> {
    const excerpt = ctx.text.length > 140 ? ctx.text.slice(0, 139) + '…' : ctx.text;
    const where = ctx.commentId ? 'in a comment' : 'in a post';
    await Promise.all(mentions.map(async m => {
        const id = `mention_${ctx.postId}_${ctx.commentId || 'post'}`;
        await createNotification(m.uid, {
            type: 'mention',
            title: `${author.name} mentioned you ${where}`,
            body: excerpt,
            actorId: author.uid,
            actorName: author.name,
            actorAvatar: author.avatar || null,
            data: { postId: ctx.postId, commentId: ctx.commentId || null },
        }, id);
        await notifyUser(m.uid, `${author.name} mentioned you`, excerpt, { type: 'mention', postId: ctx.postId }).catch(() => false);
    }));
}
