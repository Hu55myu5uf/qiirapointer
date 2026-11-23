import { Router, Request, Response } from 'express';
import { authenticateUser } from '../utils/authMiddleware';
import { writeLimiter } from '../utils/rateLimiter';
import { notificationsOf } from '../utils/notifications';
import { db } from '../config/firebase';

/**
 * The signed-in user's own notifications. There is no way to read or change anyone else's:
 * every route works on the caller's uid from their verified token.
 */
const router = Router();
router.use(authenticateUser);

const PAGE_SIZE = 30;

/**
 * GET /api/notifications?before=<ISO date>
 * Newest first, 30 at a time; pass the last item's createdAt as `before` for the next page.
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const uid = req.user!.uid;
        let q = notificationsOf(uid).orderBy('createdAt', 'desc');
        const before = typeof req.query.before === 'string' ? req.query.before : '';
        if (before && !isNaN(Date.parse(before))) q = q.startAfter(before);
        const snap = await q.limit(PAGE_SIZE).get();
        const notifications = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        res.json({
            notifications,
            nextBefore: notifications.length === PAGE_SIZE ? notifications[notifications.length - 1].createdAt : null,
        });
    } catch (error: any) {
        console.error('Get notifications error:', error);
        res.status(500).json({ error: 'Failed to load notifications' });
    }
});

/** GET /api/notifications/unread-count */
router.get('/unread-count', async (req: Request, res: Response) => {
    try {
        const snap = await notificationsOf(req.user!.uid).where('read', '==', false).count().get();
        res.json({ count: snap.data().count });
    } catch (error: any) {
        console.error('Unread notifications error:', error);
        res.status(500).json({ error: 'Failed to count notifications' });
    }
});

/**
 * POST /api/notifications/read   body: { ids?: string[] }
 * Marks the given notifications (or all unread ones) as read.
 */
router.post('/read', writeLimiter, async (req: Request, res: Response) => {
    try {
        const col = notificationsOf(req.user!.uid);
        const ids: unknown = req.body?.ids;
        let refs;
        if (Array.isArray(ids)) {
            const clean = ids.filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x)).slice(0, 200);
            refs = clean.map(id => col.doc(id));
        } else {
            refs = (await col.where('read', '==', false).limit(500).get()).docs.map(d => d.ref);
        }
        if (refs.length) {
            const batch = db.batch();
            // merge: an id that doesn't exist is ignored rather than creating a stray document
            const existing = await Promise.all(refs.map(r => r.get()));
            existing.filter(d => d.exists).forEach(d => batch.set(d.ref, { read: true }, { merge: true }));
            await batch.commit();
        }
        res.json({ success: true });
    } catch (error: any) {
        console.error('Mark notifications read error:', error);
        res.status(500).json({ error: 'Failed to update notifications' });
    }
});

/** DELETE /api/notifications/:id — remove one of your own notifications */
router.delete('/:id', writeLimiter, async (req: Request, res: Response) => {
    try {
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
        await notificationsOf(req.user!.uid).doc(req.params.id).delete();
        res.json({ success: true });
    } catch (error: any) {
        console.error('Delete notification error:', error);
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

export default router;
