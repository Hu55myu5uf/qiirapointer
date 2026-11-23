import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db, FieldValue } from '../config/firebase';
import { authenticateUser, optionalAuthenticateUser, requireAdmin } from '../utils/authMiddleware';
import { writeLimiter } from '../utils/rateLimiter';
import { getDisplayProfile, getDisplayProfiles, usableImage } from '../utils/profiles';
import { createNotification } from '../utils/notifications';
import { uidForUsername } from '../utils/usernames';

/**
 * Vendor communities.
 *
 *   communities/{id}                 name, description, category (main category), image, ownerId,
 *                                    status pending|verified|rejected, memberCount, followerCount
 *   communities/{id}/members/{uid}   role owner|member         (vendors of the same category only)
 *   communities/{id}/requests/{uid}  join requests, approved or declined by the owner
 *   communities/{id}/invites/{uid}   owner's invitations, valid for 7 days
 *   communities/{id}/followers/{uid} anyone signed in (customers can follow, never join)
 *   users/{uid}/community_links/{id}__{kind}  kind member|follower|invite|request — "my communities"
 *                                    and account deletion, without extra database indexes
 *
 * New communities show as unverified until an admin verifies them; a rejected one is hidden.
 * Only the server writes; the app reads everything through these routes.
 */
const router = Router();

const MAX_OWNED = 3;
const INVITE_DAYS = 7;
const NAME_MIN = 3;
const NAME_MAX = 60;
const DESC_MAX = 500;

const mainCategory = (c: unknown) => String(c ?? '').split(' - ')[0].trim();
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isHttps = (v: unknown) => typeof v === 'string' && /^https:\/\/[^\s]+$/i.test(v) && v.length <= 2048;
const communityRef = (id: string) => db.collection('communities').doc(id);
type LinkKind = 'member' | 'follower' | 'invite' | 'request';
const linkRef = (uid: string, id: string, kind: LinkKind) =>
    db.collection('users').doc(uid).collection('community_links').doc(`${id}__${kind}`);
const SUB_KIND: Record<string, LinkKind> = { members: 'member', followers: 'follower', invites: 'invite', requests: 'request' };
const validId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

async function vendorCategory(uid: string): Promise<string> {
    const [u, v] = await Promise.all([db.collection('users').doc(uid).get(), db.collection('vendors').doc(uid).get()]);
    if (!u.exists || u.data()?.isSuspended || u.data()?.role !== 'vendor') return '';
    return mainCategory(v.data()?.category);
}

function present(c: any, owner?: any) {
    return {
        id: c.id,
        name: c.name,
        description: c.description || '',
        category: c.category,
        image: usableImage(c.image) || '',
        status: c.status,
        isVerified: c.status === 'verified',
        memberCount: Math.max(0, Number(c.memberCount) || 0),
        followerCount: Math.max(0, Number(c.followerCount) || 0),
        ownerId: c.ownerId,
        ownerName: owner?.name || null,
        createdAt: c.createdAt,
    };
}

async function loadCommunity(id: string) {
    if (!validId(id)) return null;
    const snap = await communityRef(id).get();
    return snap.exists ? { id: snap.id, ...(snap.data() as any) } : null;
}

/** Visible to the public unless an admin rejected it (members, owner and admins still see it) */
function canSee(c: any, uid?: string, isAdmin?: boolean, isMember?: boolean) {
    return c.status !== 'rejected' || isAdmin || c.ownerId === uid || isMember;
}

async function addMember(c: any, uid: string, role: 'owner' | 'member') {
    const now = new Date().toISOString();
    const batch = db.batch();
    batch.set(communityRef(c.id).collection('members').doc(uid), { uid, role, joinedAt: now });
    batch.delete(communityRef(c.id).collection('requests').doc(uid));
    batch.delete(communityRef(c.id).collection('invites').doc(uid));
    batch.set(linkRef(uid, c.id, 'member'), { communityId: c.id, kind: 'member', role, at: now });
    batch.delete(linkRef(uid, c.id, 'request'));
    batch.delete(linkRef(uid, c.id, 'invite'));
    batch.update(communityRef(c.id), { memberCount: FieldValue.increment(1), updatedAt: now });
    await batch.commit();
}

// ─── Browse ──────────────────────────────────────────────────────────────────

/** GET /api/communities?category=Food&q=bak  — verified first, then by size; rejected hidden */
router.get('/', optionalAuthenticateUser, async (req: Request, res: Response) => {
    try {
        const category = mainCategory(req.query.category);
        const q = String(req.query.q || '').trim().toLowerCase().slice(0, 60);
        let query: FirebaseFirestore.Query = db.collection('communities');
        if (category && category !== 'All') query = query.where('category', '==', category);
        const snap = await query.limit(300).get();
        let list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).filter(c => c.status !== 'rejected');
        if (q) list = list.filter(c => String(c.nameLower || c.name || '').includes(q) || String(c.description || '').toLowerCase().includes(q));
        list.sort((a, b) => Number(b.status === 'verified') - Number(a.status === 'verified') || (b.memberCount || 0) - (a.memberCount || 0));
        const owners = await getDisplayProfiles(list.slice(0, 100).map(c => c.ownerId));
        res.json({ communities: list.slice(0, 100).map(c => present(c, owners.get(c.ownerId))) });
    } catch (error: any) {
        console.error('List communities error:', error);
        res.status(500).json({ error: 'Failed to load communities' });
    }
});

/** GET /api/communities/mine -> { member: [...], following: [...], invites: [...] } */
router.get('/mine', authenticateUser, async (req: Request, res: Response) => {
    try {
        const uid = req.user!.uid;
        const links = await db.collection('users').doc(uid).collection('community_links').get();
        const items = await Promise.all(links.docs.map(async l => ({ link: l.data(), c: await loadCommunity(String(l.data().communityId || '')) })));
        const owners = await getDisplayProfiles(items.filter(i => i.c).map(i => i.c!.ownerId));
        const now = Date.now();
        const out = { member: [] as any[], following: [] as any[], invites: [] as any[] };
        for (const { link, c } of items) {
            if (!c) continue;
            const entry = present(c, owners.get(c.ownerId));
            if (link.kind === 'member') out.member.push({ ...entry, role: link.role });
            else if (link.kind === 'follower' && c.status !== 'rejected') out.following.push(entry);
            else if (link.kind === 'invite' && c.status !== 'rejected' && new Date(link.expiresAt).getTime() > now) out.invites.push(entry);
        }
        res.json(out);
    } catch (error: any) {
        console.error('My communities error:', error);
        res.status(500).json({ error: 'Failed to load your communities' });
    }
});

/** GET /api/communities/:id — details, members, and what the viewer can do */
router.get('/:id', optionalAuthenticateUser, async (req: Request, res: Response) => {
    try {
        const c = await loadCommunity(req.params.id);
        if (!c) return res.status(404).json({ error: 'Community not found' });
        const uid = req.user?.uid;
        const [membersSnap, mine, follow, request, invite] = await Promise.all([
            communityRef(c.id).collection('members').limit(500).get(),
            uid ? communityRef(c.id).collection('members').doc(uid).get() : null,
            uid ? communityRef(c.id).collection('followers').doc(uid).get() : null,
            uid ? communityRef(c.id).collection('requests').doc(uid).get() : null,
            uid ? communityRef(c.id).collection('invites').doc(uid).get() : null,
        ]);
        const isMember = Boolean(mine?.exists);
        if (!canSee(c, uid, req.user?.isAdmin, isMember)) return res.status(404).json({ error: 'Community not found' });

        const memberDocs = membersSnap.docs.map(d => d.data());
        const people = await getDisplayProfiles([c.ownerId, ...memberDocs.map(m => m.uid)]);
        const members = memberDocs
            .map(m => {
                const p = people.get(m.uid);
                return { uid: m.uid, role: m.role, name: p?.name || 'Vendor', avatar: p?.avatar || '', username: p?.username || null, isVerified: Boolean(p?.isVerified), joinedAt: m.joinedAt };
            })
            .sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner') || String(a.joinedAt).localeCompare(String(b.joinedAt)));

        const isOwner = uid === c.ownerId;
        let requests: any[] = [];
        if (isOwner || req.user?.isAdmin) {
            const rs = await communityRef(c.id).collection('requests').get();
            const rp = await getDisplayProfiles(rs.docs.map(d => d.id));
            requests = rs.docs.map(d => {
                const p = rp.get(d.id);
                return { uid: d.id, name: p?.name || 'Vendor', avatar: p?.avatar || '', username: p?.username || null, createdAt: d.data().createdAt };
            });
        }
        const inviteValid = Boolean(invite?.exists && new Date(invite.data()!.expiresAt).getTime() > Date.now());

        let canJoin = false;
        if (uid && !isMember && c.status !== 'rejected' && req.user?.role === 'vendor') {
            canJoin = (await vendorCategory(uid)) === c.category;
        }

        res.json({
            community: present(c, people.get(c.ownerId)),
            rejectionReason: (isOwner || req.user?.isAdmin) ? (c.rejectionReason || null) : undefined,
            members,
            requests,
            viewer: {
                isMember,
                isOwner,
                isFollowing: Boolean(follow?.exists),
                hasRequested: Boolean(request?.exists),
                hasInvite: inviteValid,
                canJoin,
                isAdmin: Boolean(req.user?.isAdmin),
            },
        });
    } catch (error: any) {
        console.error('Get community error:', error);
        res.status(500).json({ error: 'Failed to load community' });
    }
});

/** GET /api/communities/:id/posts — newest posts by the members */
router.get('/:id/posts', optionalAuthenticateUser, async (req: Request, res: Response) => {
    try {
        const c = await loadCommunity(req.params.id);
        if (!c || c.status === 'rejected') return res.status(404).json({ error: 'Community not found' });
        const ids = (await communityRef(c.id).collection('members').limit(300).get()).docs.map(d => d.id);
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
        const snaps = await Promise.all(chunks.map(ch => db.collection('posts').where('authorId', 'in', ch).limit(60).get()));
        const posts = snaps.flatMap(s => s.docs.map(d => ({ id: d.id, ...(d.data() as any) })))
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
            .slice(0, 40);
        const people = await getDisplayProfiles(posts.map(p => p.authorId || p.vendorId));
        res.json({
            posts: posts.map(p => {
                const a = people.get(p.authorId || p.vendorId);
                const { likedBy, ...rest } = p;
                return {
                    ...rest,
                    vendorName: a?.name || p.vendorName,
                    vendorImage: a?.avatar || '',
                    isVerified: Boolean(a?.isVerified),
                    isLiked: Boolean(req.user && Array.isArray(likedBy) && likedBy.includes(req.user.uid)),
                };
            }),
        });
    } catch (error: any) {
        console.error('Community posts error:', error);
        res.status(500).json({ error: 'Failed to load posts' });
    }
});

// ─── Create & manage (owner) ──────────────────────────────────────────────────

/** POST /api/communities { name, description, image? } — a vendor, for their own category */
router.post('/', authenticateUser, writeLimiter, async (req: Request, res: Response) => {
    try {
        const uid = req.user!.uid;
        if (req.user!.role !== 'vendor') return res.status(403).json({ error: 'Only vendors can create communities' });
        const category = await vendorCategory(uid);
        if (!category) return res.status(400).json({ error: 'Set your business category first. Communities are for vendors of the same category.' });

        const name = str(req.body?.name, NAME_MAX + 1);
        if (name.length < NAME_MIN || name.length > NAME_MAX) return res.status(400).json({ error: `Community names must be ${NAME_MIN}–${NAME_MAX} characters` });
        const description = str(req.body?.description, DESC_MAX + 1);
        if (description.length > DESC_MAX) return res.status(400).json({ error: `Descriptions can be at most ${DESC_MAX} characters` });
        const image = req.body?.image ? (isHttps(req.body.image) ? req.body.image : null) : '';
        if (image === null) return res.status(400).json({ error: 'Invalid image' });

        const owned = await db.collection('communities').where('ownerId', '==', uid).get();
        if (owned.docs.filter(d => d.data().status !== 'rejected').length >= MAX_OWNED) {
            return res.status(400).json({ error: `You can run at most ${MAX_OWNED} communities` });
        }
        const sameName = await db.collection('communities').where('nameLower', '==', name.toLowerCase()).get();
        if (sameName.docs.some(d => d.data().category === category && d.data().status !== 'rejected')) {
            return res.status(409).json({ error: 'A community with this name already exists in your category' });
        }

        const id = `com_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
        const now = new Date().toISOString();
        const c = { id, name, nameLower: name.toLowerCase(), description, image, category, ownerId: uid, status: 'pending', memberCount: 0, followerCount: 0, createdAt: now, updatedAt: now };
        await communityRef(id).set(c);
        await addMember(c, uid, 'owner');
        const owner = await getDisplayProfile(uid);
        res.status(201).json({ community: present({ ...c, memberCount: 1 }, owner) });
    } catch (error: any) {
        console.error('Create community error:', error);
        res.status(500).json({ error: 'Failed to create community' });
    }
});

/** PUT /api/communities/:id { name?, description?, image? } — owner or admin */
router.put('/:id', authenticateUser, writeLimiter, async (req: Request, res: Response) => {
    try {
        const c = await loadCommunity(req.params.id);
        if (!c) return res.status(404).json({ error: 'Community not found' });
        if (c.ownerId !== req.user!.uid && !req.user!.isAdmin) return res.status(403).json({ error: 'Only the owner can edit this community' });
        const update: Record<string, any> = { updatedAt: new Date().toISOString() };
        if (req.body?.name !== undefined) {
            const name = str(req.body.name, NAME_MAX + 1);
            if (name.length < NAME_MIN || name.length > NAME_MAX) return res.status(400).json({ error: `Community names must be ${NAME_MIN}–${NAME_MAX} characters` });
            update.name = name; update.nameLower = name.toLowerCase();
        }
        if (req.body?.description !== undefined) {
            const d = str(req.body.description, DESC_MAX + 1);
            if (d.length > DESC_MAX) return res.status(400).json({ error: `Descriptions can be at most ${DESC_MAX} characters` });
            update.description = d;
        }
        if (req.body?.image !== undefined) {
            if (req.body.image && !isHttps(req.body.image)) return res.status(400).json({ error: 'Invalid image' });
            update.image = req.body.image || '';
        }
        await communityRef(c.id).set(update, { merge: true });
        res.json({ success: true });
    } catch (error: any) {
        console.error('Edit community error:', error);
        res.status(500).json({ error: 'Failed to update community' });
    }
});

/** POST /api/communities/:id/join — vendors of the same category ask to join */
router.post('/:id/join', authenticateUser, writeLimiter, async (req: Request, res: Response) => {
    try {
        const uid = req.user!.uid;
        const c = await loadCommunity(req.params.id);
        if (!c || c.status === 'rejected') return res.status(404).json({ error: 'Community not found' });
        if (req.user!.role !== 'vendor') return res.status(403).json({ error: 'Only vendors can join communities. You can follow it instead.' });
        if ((await vendorCategory(uid)) !== c.category) return res.status(403).json({ error: `Only ${c.category} vendors can join this community` });
        if ((await communityRef(c.id).collection('members').doc(uid).get()).exists) return res.json({ status: 'member' });

        // Accepting a valid invitation joins straight away
        const invite = await communityRef(c.id).collection('invites').doc(uid).get();
        if (invite.exists && new Date(invite.data()!.expiresAt).getTime() > Date.now()) {
            await addMember(c, uid, 'member');
            const me = await getDisplayProfile(uid);
            await createNotification(c.ownerId, { type: 'community', title: `${me.name} joined ${c.name}`, body: 'They accepted your invitation.', actorId: uid, actorName: me.name, actorAvatar: me.avatar || null, data: { communityId: c.id } });
            return res.json({ status: 'member' });
        }

        const reqRef = communityRef(c.id).collection('requests').doc(uid);
        if (!(await reqRef.get()).exists) {
            const at = new Date().toISOString();
            const batch = db.batch();
            batch.set(reqRef, { uid, createdAt: at });
            batch.set(linkRef(uid, c.id, 'request'), { communityId: c.id, kind: 'request', at });
            await batch.commit();
            const me = await getDisplayProfile(uid);
            await createNotification(c.ownerId, {
                type: 'community',
                title: `${me.name} wants to join ${c.name}`,
                body: 'Open the community to approve or decline.',
                actorId: uid, actorName: me.name, actorAvatar: me.avatar || null,
                data: { communityId: c.id },
            }, `community_req_${c.id}_${uid}`);
        }
        res.json({ status: 'requested' });
    } catch (error: any) {
        console.error('Join community error:', error);
        res.status(500).json({ error: 'Failed to join community' });
    }
});

/** POST /api/communities/:id/requests/:uid { approve: boolean } — owner (or admin) */
router.post('/:id/requests/:uid', authenticateUser, writeLimiter, async (req: Request, res: Response) => {
    try {
        const c = await loadCommunity(req.params.id);
        if (!c) return res.status(404).json({ error: 'Community not found' });
        if (c.ownerId !== req.user!.uid && !req.user!.isAdmin) return res.status(403).json({ error: 'Only the owner can decide on requests' });
        const target = req.params.uid;
        const reqRef = communityRef(c.id).collection('requests').doc(target);
        if (!(await reqRef.get()).exists) return res.status(404).json({ error: 'Request not found' });
        if (req.body?.approve) {
            // Category may have changed since they asked
            if ((await vendorCategory(target)) !== c.category) {
                await reqRef.delete();
                await linkRef(target, c.id, 'request').delete();
                return res.status(409).json({ error: `They are no longer a ${c.category} vendor` });
            }
            await addMember(c, target, 'member');
            await createNotification(target, { type: 'community', title: `You joined ${c.name}`, body: 'Your request was approved.', data: { communityId: c.id } });
        } else {
            await reqRef.delete();
            await linkRef(target, c.id, 'request').delete();
        }
        res.json({ success: true });
    } catch (error: any) {
        console.error('Community request decision error:', error);
        res.status(500).json({ error: 'Failed to update request' });
    }
});

/** POST /api/communities/:id/invites { username } — owner invites a vendor of the same category */
router.post('/:id/invites', authenticateUser, writeLimiter, async (req: Request, res: Response) => {
    try {
        const c = await loadCommunity(req.params.id);
        if (!c || c.status === 'rejected') return res.status(404).json({ error: 'Community not found' });
        if (c.ownerId !== req.user!.uid) return res.status(403).json({ error: 'Only the owner can invite' });
        const target = await uidForUsername(String(req.body?.username || ''));
        if (!target) return res.status(404).json({ error: 'No one has that username' });
        if ((await vendorCategory(target)) !== c.category) return res.status(400).json({ error: `Only ${c.category} vendors can be invited` });
        if ((await communityRef(c.id).collection('members').doc(target).get()).exists) return res.status(409).json({ error: 'They are already a member' });
        const them = await getDisplayProfile(target);
        if (them.blockedUserIds.includes(req.user!.uid)) return res.status(403).json({ error: 'You cannot invite this vendor' });

        const now = new Date();
        const expiresAt = new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString();
        const batch = db.batch();
        batch.set(communityRef(c.id).collection('invites').doc(target), { uid: target, invitedBy: req.user!.uid, createdAt: now.toISOString(), expiresAt });
        batch.set(linkRef(target, c.id, 'invite'), { communityId: c.id, kind: 'invite', at: now.toISOString(), expiresAt });
        await batch.commit();
        const owner = await getDisplayProfile(req.user!.uid);
        await createNotification(target, {
            type: 'community',
            title: `${owner.name} invited you to ${c.name}`,
            body: `A community for ${c.category} vendors. The invitation is valid for ${INVITE_DAYS} days.`,
            actorId: owner.uid, actorName: owner.name, actorAvatar: owner.avatar || null,
            data: { communityId: c.id },
        }, `community_inv_${c.id}_${target}`);
        res.json({ success: true, expiresAt });
    } catch (error: any) {
        console.error('Community invite error:', error);
        res.status(500).json({ error: 'Failed to send invitation' });
    }
});

/** DELETE /api/communities/:id/invites/me — decline an invitation */
router.delete('/:id/invites/me', authenticateUser, async (req: Request, res: Response) => {
    try {
        if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
        const uid = req.user!.uid;
        await communityRef(req.params.id).collection('invites').doc(uid).delete();
        await linkRef(uid, req.params.id, 'invite').delete();
        res.json({ success: true });
    } catch (error: any) {
        console.error('Decline invite error:', error);
        res.status(500).json({ error: 'Failed to decline invitation' });
    }
});

/** DELETE /api/communities/:id/members/:uid — leave (yourself) or remove (owner/admin) */
router.delete('/:id/members/:uid', authenticateUser, async (req: Request, res: Response) => {
    try {
        const c = await loadCommunity(req.params.id);
        if (!c) return res.status(404).json({ error: 'Community not found' });
        const target = req.params.uid === 'me' ? req.user!.uid : req.params.uid;
        const self = target === req.user!.uid;
        if (!self && c.ownerId !== req.user!.uid && !req.user!.isAdmin) return res.status(403).json({ error: 'Only the owner can remove members' });
        if (target === c.ownerId) return res.status(400).json({ error: 'The owner cannot leave. Delete the community instead.' });
        const m = communityRef(c.id).collection('members').doc(target);
        if (!(await m.get()).exists) return res.status(404).json({ error: 'Not a member' });
        const batch = db.batch();
        batch.delete(m);
        batch.delete(linkRef(target, c.id, 'member'));
        batch.update(communityRef(c.id), { memberCount: FieldValue.increment(-1) });
        await batch.commit();
        res.json({ success: true });
    } catch (error: any) {
        console.error('Leave community error:', error);
        res.status(500).json({ error: 'Failed to update membership' });
    }
});

/** POST/DELETE /api/communities/:id/follow — anyone signed in (customers follow, they don't join) */
router.post('/:id/follow', authenticateUser, writeLimiter, async (req: Request, res: Response) => {
    try {
        const c = await loadCommunity(req.params.id);
        if (!c || c.status === 'rejected') return res.status(404).json({ error: 'Community not found' });
        const uid = req.user!.uid;
        const f = communityRef(c.id).collection('followers').doc(uid);
        if ((await f.get()).exists) return res.json({ following: true });
        const now = new Date().toISOString();
        const batch = db.batch();
        batch.set(f, { uid, createdAt: now });
        batch.set(linkRef(uid, c.id, 'follower'), { communityId: c.id, kind: 'follower', at: now });
        batch.update(communityRef(c.id), { followerCount: FieldValue.increment(1) });
        await batch.commit();
        res.json({ following: true });
    } catch (error: any) {
        console.error('Follow community error:', error);
        res.status(500).json({ error: 'Failed to follow' });
    }
});

router.delete('/:id/follow', authenticateUser, async (req: Request, res: Response) => {
    try {
        const c = await loadCommunity(req.params.id);
        if (!c) return res.status(404).json({ error: 'Community not found' });
        const uid = req.user!.uid;
        const f = communityRef(c.id).collection('followers').doc(uid);
        if (!(await f.get()).exists) return res.json({ following: false });
        const batch = db.batch();
        batch.delete(f);
        batch.delete(linkRef(uid, c.id, 'follower'));
        batch.update(communityRef(c.id), { followerCount: FieldValue.increment(-1) });
        await batch.commit();
        res.json({ following: false });
    } catch (error: any) {
        console.error('Unfollow community error:', error);
        res.status(500).json({ error: 'Failed to unfollow' });
    }
});

/** Remove a community and everything under it (owner or admin) */
export async function deleteCommunity(id: string): Promise<void> {
    const ref = communityRef(id);
    const names = ['members', 'requests', 'invites', 'followers'];
    const subs = await Promise.all(names.map(n => ref.collection(n).get()));
    const refs: FirebaseFirestore.DocumentReference[] = [];
    subs.forEach((s, i) => s.docs.forEach(d => {
        refs.push(d.ref);
        refs.push(linkRef(d.id, id, SUB_KIND[names[i]]));
    }));
    refs.push(ref);
    for (let i = 0; i < refs.length; i += 400) {
        const batch = db.batch();
        refs.slice(i, i + 400).forEach(r => batch.delete(r));
        await batch.commit();
    }
}

router.delete('/:id', authenticateUser, async (req: Request, res: Response) => {
    try {
        const c = await loadCommunity(req.params.id);
        if (!c) return res.status(404).json({ error: 'Community not found' });
        if (c.ownerId !== req.user!.uid && !req.user!.isAdmin) return res.status(403).json({ error: 'Only the owner can delete this community' });
        await deleteCommunity(c.id);
        res.json({ success: true });
    } catch (error: any) {
        console.error('Delete community error:', error);
        res.status(500).json({ error: 'Failed to delete community' });
    }
});

// ─── Admin ───────────────────────────────────────────────────────────────────

/** GET /api/communities/admin/pending */
router.get('/admin/pending', authenticateUser, requireAdmin, async (_req: Request, res: Response) => {
    try {
        const snap = await db.collection('communities').where('status', '==', 'pending').get();
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        const owners = await getDisplayProfiles(list.map(c => c.ownerId));
        res.json({ communities: list.map(c => present(c, owners.get(c.ownerId))) });
    } catch (error: any) {
        console.error('Pending communities error:', error);
        res.status(500).json({ error: 'Failed to load communities' });
    }
});

/** PUT /api/communities/:id/verify { status: 'verified' | 'rejected', reason? } — admin */
router.put('/:id/verify', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
    try {
        const c = await loadCommunity(req.params.id);
        if (!c) return res.status(404).json({ error: 'Community not found' });
        const status = req.body?.status;
        if (status !== 'verified' && status !== 'rejected') return res.status(400).json({ error: 'status must be verified or rejected' });
        const reason = status === 'rejected' ? (str(req.body?.reason, 300) || 'It does not meet the community guidelines.') : null;
        await communityRef(c.id).set({ status, rejectionReason: reason, decidedAt: new Date().toISOString() }, { merge: true });
        await createNotification(c.ownerId, status === 'verified'
            ? { type: 'community', title: `${c.name} is verified`, body: 'Your community now shows the verified badge.', data: { communityId: c.id } }
            : { type: 'community', title: `${c.name} was not approved`, body: `Reason: ${reason}`, data: { communityId: c.id } });
        res.json({ success: true, status });
    } catch (error: any) {
        console.error('Verify community error:', error);
        res.status(500).json({ error: 'Failed to update community' });
    }
});

export default router;
