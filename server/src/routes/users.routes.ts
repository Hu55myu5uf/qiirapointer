import { Router, Request, Response } from 'express';
import { authenticateUser } from '../utils/authMiddleware';
import { writeLimiter, searchLimiter } from '../utils/rateLimiter';
import {
    claimUsername,
    normalizeUsername,
    usernameProblem,
    uidForUsername,
    searchUsernames,
    UsernameError,
} from '../utils/usernames';
import { getDisplayProfiles } from '../utils/profiles';
import { db } from '../config/firebase';

/** Usernames: check, change, look up, and suggest (for @mentions). */
const router = Router();

/** GET /api/users/username/check?u=name -> { available, reason? } */
router.get('/username/check', authenticateUser, searchLimiter, async (req: Request, res: Response) => {
    try {
        const name = normalizeUsername(req.query.u);
        const problem = usernameProblem(name);
        if (problem) return res.json({ available: false, reason: problem });
        const owner = await uidForUsername(name);
        const available = !owner || owner === req.user!.uid;
        res.json({ available, reason: available ? undefined : 'That username is taken.' });
    } catch (error: any) {
        console.error('Username check error:', error);
        res.status(500).json({ error: 'Failed to check username' });
    }
});

/** PUT /api/users/me/username { username } — change your own (once every 30 days) */
router.put('/me/username', authenticateUser, writeLimiter, async (req: Request, res: Response) => {
    try {
        const username = await claimUsername(req.user!.uid, req.body?.username);
        res.json({ username });
    } catch (error: any) {
        if (error instanceof UsernameError) {
            return res.status(error.status).json({ error: error.message, nextAllowedAt: error.nextAllowedAt });
        }
        console.error('Change username error:', error);
        res.status(500).json({ error: 'Failed to change username' });
    }
});

/**
 * GET /api/users/search?q=ad -> people whose username starts with "ad" (max 8), for the @mention
 * suggestions. Suspended accounts and people who blocked you (or you them) are left out.
 */
router.get('/search', authenticateUser, searchLimiter, async (req: Request, res: Response) => {
    try {
        const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 30) : '';
        const hits = await searchUsernames(q, 12);
        const profiles = await getDisplayProfiles([req.user!.uid, ...hits.map(h => h.uid)]);
        const me = profiles.get(req.user!.uid);
        const suspended = new Set<string>();
        await Promise.all(hits.map(async h => {
            const u = await db.collection('users').doc(h.uid).get();
            if (!u.exists || u.data()?.isSuspended) suspended.add(h.uid);
        }));
        const users = hits
            .filter(h => !suspended.has(h.uid))
            .filter(h => {
                const p = profiles.get(h.uid);
                return p && !p.blockedUserIds.includes(req.user!.uid) && !(me?.blockedUserIds || []).includes(h.uid);
            })
            .slice(0, 8)
            .map(h => {
                const p = profiles.get(h.uid)!;
                return { uid: h.uid, username: h.username, name: p.name, avatar: p.avatar, role: p.role, isVerified: p.isVerified };
            });
        res.json({ users });
    } catch (error: any) {
        console.error('User search error:', error);
        res.status(500).json({ error: 'Failed to search users' });
    }
});

/** GET /api/users/by-username/:username -> { uid, username, role } (to open a profile from an @mention) */
router.get('/by-username/:username', async (req: Request, res: Response) => {
    try {
        const uid = await uidForUsername(req.params.username);
        if (!uid) return res.status(404).json({ error: 'User not found' });
        const p = (await getDisplayProfiles([uid])).get(uid)!;
        const u = await db.collection('users').doc(uid).get();
        if (!u.exists || u.data()?.isSuspended) return res.status(404).json({ error: 'User not found' });
        res.json({ uid, username: normalizeUsername(req.params.username), role: p.role, name: p.name });
    } catch (error: any) {
        console.error('Username lookup error:', error);
        res.status(500).json({ error: 'Failed to find user' });
    }
});

export default router;
