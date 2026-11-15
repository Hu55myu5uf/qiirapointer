import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db, FieldValue } from '../config/firebase';
import { authenticateUser, optionalAuthenticateUser } from '../utils/authMiddleware';
import { decodeUpload, saveUpload, storagePathOf, UploadError } from '../utils/fileStorage';
import { getDisplayProfile, getDisplayProfiles, usableImage } from '../utils/profiles';
import { writeLimiter } from '../utils/rateLimiter';
import { storage } from '../config/firebase';

const router = Router();

const MAX_CAPTION_LENGTH = 2200;
const MAX_COMMENT_LENGTH = 1000;
const MAX_MEDIA_PER_POST = 10;
const MAX_TAGS = 20;
const DEFAULT_PAGE = 30;
const MAX_PAGE = 50;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function matchesCategory(post: any, wanted: string) {
    const w = wanted.toLowerCase();
    const root = w.split('&')[0].trim().split(' ')[0].trim();
    return [post.category, post.vendorCategory].some(c => {
        const v = String(c || '').toLowerCase();
        return v && (v.includes(w) || w.includes(v) || (root.length > 3 && v.includes(root)));
    });
}

/**
 * Shape a stored post for the app: live author name/photo/badge, the viewer's like state, and no
 * private fields (who liked it). Dead image links from the old server disk are dropped.
 */
function presentPost(p: any, viewerId: string | undefined, people: Map<string, any>) {
    const { likedBy, ...rest } = p;
    const author = people.get(p.authorId || p.vendorId);
    const media: string[] = (Array.isArray(p.mediaUrls) && p.mediaUrls.length ? p.mediaUrls : [p.mediaUrl])
        .map((u: any) => usableImage(u)).filter(Boolean);
    return {
        ...rest,
        vendorName: author?.name || p.vendorName || 'QIIRA user',
        vendorImage: author?.avatar ?? '',
        isVerified: Boolean(author?.isVerified),
        isAdmin: Boolean(author?.isAdmin),
        role: author?.role || p.role,
        mediaUrl: media[0] || null,
        mediaUrls: media,
        mediaCount: media.length,
        thumbnailUrl: usableImage(p.thumbnailUrl) || media[0] || null,
        likesCount: Math.max(0, Number(p.likesCount) || 0),
        commentsCount: Math.max(0, Number(p.commentsCount) || 0),
        isLiked: Boolean(viewerId && Array.isArray(likedBy) && likedBy.includes(viewerId)),
    };
}

async function blockedFor(viewerId?: string): Promise<string[]> {
    if (!viewerId) return [];
    return (await getDisplayProfile(viewerId)).blockedUserIds;
}

/**
 * Load a page of posts, newest first, applying in-memory filters (type, category, blocks).
 * `before` is the createdAt cursor returned as `nextCursor` by the previous page.
 */
// Only orderBy(createdAt) + a range on createdAt is used, which Firestore indexes automatically
// (adding equality filters here would require deploying composite indexes).
async function loadPostsPage(opts: {
    limit: number;
    before?: string;
    filter?: (p: any) => boolean;
}) {
    const { limit, before, filter } = opts;
    const results: any[] = [];
    let cursor = before;
    // Over-fetch in rounds so filters don't leave pages short; bounded to keep reads predictable
    for (let round = 0; round < 3 && results.length < limit; round++) {
        let q: FirebaseFirestore.Query = db.collection('posts').orderBy('createdAt', 'desc');
        if (cursor) q = q.where('createdAt', '<', cursor);
        const snap = await q.limit(limit * 2).get();
        if (snap.empty) { cursor = undefined; break; }
        for (const d of snap.docs) {
            const p = { id: d.id, ...(d.data() as any) };
            if (!filter || filter(p)) results.push(p);
        }
        cursor = snap.docs[snap.docs.length - 1].data().createdAt;
        if (snap.size < limit * 2) { cursor = undefined; break; }
    }
    const page = results.slice(0, limit);
    const nextCursor = results.length > limit ? page[page.length - 1].createdAt : cursor || null;
    return { page, nextCursor };
}

/**
 * @route   GET /api/posts/feed
 * @query   type ('post' | 'reel' | 'community' | 'all'), category, limit (≤50), before (cursor)
 * @access  Public (personalised when logged in)
 */
router.get('/feed', optionalAuthenticateUser, async (req: Request, res: Response) => {
    try {
        const viewerId = req.user?.uid;
        const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_PAGE, 1), MAX_PAGE);
        const type = typeof req.query.type === 'string' ? req.query.type : 'all';
        const category = typeof req.query.category === 'string' ? req.query.category : '';
        const blocked = await blockedFor(viewerId);

        const { page, nextCursor } = await loadPostsPage({
            limit,
            before: typeof req.query.before === 'string' ? req.query.before : undefined,
            filter: p =>
                !blocked.includes(p.authorId) && !blocked.includes(p.vendorId) &&
                (type === 'all' || p.type === type) &&
                (!category || category === 'All' || matchesCategory(p, category)),
        });

        const people = await getDisplayProfiles(page.map(p => p.authorId || p.vendorId));
        const posts = page.map(p => presentPost(p, viewerId, people));
        res.status(200).json({ posts, count: posts.length, nextCursor });
    } catch (error: any) {
        console.error('Get feed error:', error);
        res.status(500).json({ error: 'Failed to fetch explore feed' });
    }
});

/**
 * @route   GET /api/posts/showcase (alias /reels) — video posts only
 */
router.get(['/reels', '/showcase'], optionalAuthenticateUser, async (req: Request, res: Response) => {
    try {
        const viewerId = req.user?.uid;
        const blocked = await blockedFor(viewerId);
        const { page, nextCursor } = await loadPostsPage({
            limit: Math.min(Math.max(Number(req.query.limit) || DEFAULT_PAGE, 1), MAX_PAGE),
            before: typeof req.query.before === 'string' ? req.query.before : undefined,
            filter: p => (p.type === 'reel' || p.type === 'showcase') && !blocked.includes(p.authorId) && !blocked.includes(p.vendorId),
        });
        const people = await getDisplayProfiles(page.map(p => p.authorId || p.vendorId));
        const showcase = page.map(p => presentPost(p, viewerId, people));
        res.status(200).json({ showcase, reels: showcase, count: showcase.length, nextCursor });
    } catch (error: any) {
        console.error('Get showcase error:', error);
        res.status(500).json({ error: 'Failed to fetch showcase' });
    }
});

/**
 * @route   GET /api/posts/vendor/:vendorId
 */
router.get('/vendor/:vendorId', optionalAuthenticateUser, async (req: Request, res: Response) => {
    try {
        const viewerId = req.user?.uid;
        // One vendor's posts: equality query only (no composite index needed), sorted here
        const snap = await db.collection('posts').where('vendorId', '==', req.params.vendorId).limit(500).get();
        const all = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        const before = typeof req.query.before === 'string' ? req.query.before : '';
        const limit = Math.min(Math.max(Number(req.query.limit) || MAX_PAGE, 1), MAX_PAGE);
        const remaining = before ? all.filter(p => String(p.createdAt) < before) : all;
        const page = remaining.slice(0, limit);

        const people = await getDisplayProfiles([req.params.vendorId]);
        const posts = page.map(p => presentPost(p, viewerId, people));
        res.status(200).json({
            posts,
            count: posts.length,
            nextCursor: remaining.length > limit ? page[page.length - 1].createdAt : null,
        });
    } catch (error: any) {
        console.error('Get vendor posts error:', error);
        res.status(500).json({ error: 'Failed to fetch vendor posts' });
    }
});

/**
 * @route   GET /api/posts/:id
 */
router.get('/:id', optionalAuthenticateUser, async (req: Request, res: Response) => {
    try {
        const doc = await db.collection('posts').doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ error: 'Post not found' });
        const p = { id: doc.id, ...(doc.data() as any) };
        const people = await getDisplayProfiles([p.authorId || p.vendorId]);
        res.status(200).json({ post: presentPost(p, req.user?.uid, people) });
    } catch (error: any) {
        console.error('Get post error:', error);
        res.status(500).json({ error: 'Failed to fetch post' });
    }
});

/** Accept already-uploaded https media, or upload base64 data URIs (validated by file content). */
async function resolveMedia(items: string[], creatorId: string): Promise<string[]> {
    const out: string[] = [];
    for (const [idx, u] of items.entries()) {
        if (u.startsWith('data:')) {
            const file = decodeUpload(u, ['image', 'video']);
            const saved = await saveUpload({ folder: ['posts', creatorId], namePrefix: `media_${idx}`, file, visibility: 'public' });
            out.push(saved.url);
        } else if (/^https:\/\/[^\s]+$/i.test(u) && u.length <= 2048) {
            out.push(u);
        } else {
            throw new UploadError('Invalid media');
        }
    }
    return out;
}

/**
 * @route   POST /api/posts
 * @desc    Vendors publish business posts / reels; everyone can post to Community (authorType "client")
 */
router.post('/', authenticateUser, writeLimiter, async (req: Request, res: Response) => {
    try {
        const b = req.body || {};
        const callerUid = req.user!.uid;
        const isAdmin = req.user!.isAdmin;
        const creatorId = b.vendorId || b.userId || b.authorId || callerUid;
        if (creatorId !== callerUid && !isAdmin) {
            return res.status(403).json({ error: 'Forbidden: You can only create posts for your own account' });
        }

        const isCommunity = b.authorType === 'client';
        if (!isCommunity && !isAdmin && req.user!.role !== 'vendor') {
            return res.status(403).json({ error: 'Only vendor accounts can publish business posts' });
        }
        if (b.caption !== undefined && b.caption !== null && (typeof b.caption !== 'string' || b.caption.length > MAX_CAPTION_LENGTH)) {
            return res.status(400).json({ error: `Captions can be at most ${MAX_CAPTION_LENGTH} characters` });
        }

        let media: string[] = Array.isArray(b.mediaUrls) && b.mediaUrls.length
            ? b.mediaUrls.filter((u: any) => typeof u === 'string' && u.trim())
            : (typeof b.mediaUrl === 'string' && b.mediaUrl ? [b.mediaUrl] : []);
        if (media.length > MAX_MEDIA_PER_POST) {
            return res.status(400).json({ error: `A post can include at most ${MAX_MEDIA_PER_POST} photos or videos` });
        }
        const caption = str(b.caption, MAX_CAPTION_LENGTH);
        if (!isCommunity && media.length === 0) {
            return res.status(400).json({ error: 'Please add at least one photo or video' });
        }
        if (isCommunity && !caption && media.length === 0) {
            return res.status(400).json({ error: 'Please provide either a message or a photo/video for your post' });
        }

        media = await resolveMedia(media, creatorId);
        const thumb = typeof b.thumbnailUrl === 'string' && /^https:\/\//i.test(b.thumbnailUrl) ? b.thumbnailUrl : media[0] || null;

        const author = await getDisplayProfile(creatorId);
        const now = new Date().toISOString();
        const tags = (Array.isArray(b.tags) ? b.tags : (typeof b.tags === 'string' ? b.tags.split(',') : []))
            .map((t: any) => str(String(t), 40)).filter(Boolean).slice(0, MAX_TAGS);
        const price = b.price !== undefined && b.price !== null && b.price !== '' && Number.isFinite(Number(b.price)) && Number(b.price) >= 0
            ? Number(b.price) : null;

        const postId = `post_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        let vendorCategory = 'Community';
        if (!isCommunity) {
            const vDoc = await db.collection('vendors').doc(creatorId).get();
            vendorCategory = vDoc.data()?.category || 'General';
        }

        const newPost: Record<string, any> = {
            id: postId,
            vendorId: creatorId,
            authorId: creatorId,
            authorType: isCommunity ? 'client' : 'vendor',
            type: isCommunity ? 'community' : (b.type === 'reel' ? 'reel' : 'post'),
            vendorName: author.name,
            vendorCategory,
            caption,
            mediaUrl: media[0] || null,
            mediaUrls: media,
            thumbnailUrl: thumb,
            mediaCount: media.length,
            price: isCommunity ? null : price,
            currency: str(b.currency, 5) || 'NGN',
            category: isCommunity ? 'Community' : (str(b.category, 80) || vendorCategory),
            tags,
            likesCount: 0,
            commentsCount: 0,
            likedBy: [],
            createdAt: now,
            updatedAt: now,
        };
        if (isCommunity) {
            newPost.clientPostType = ['update', 'question', 'shoutout'].includes(b.clientPostType) ? b.clientPostType : 'update';
            newPost.taggedVendorId = str(b.taggedVendorId, 128) || null;
            newPost.taggedVendorName = str(b.taggedVendorName, 100) || null;
        }

        await db.collection('posts').doc(postId).set(newPost);
        const people = new Map([[creatorId, author]]);
        res.status(201).json({ message: 'Post created successfully', post: presentPost(newPost, callerUid, people) });
    } catch (error: any) {
        if (error instanceof UploadError) return res.status(error.status).json({ error: error.message });
        console.error('Create post error:', error);
        res.status(500).json({ error: 'Failed to create post' });
    }
});

/**
 * @route   POST /api/posts/:id/like — toggle (atomic)
 */
router.post('/:id/like', authenticateUser, writeLimiter, async (req: Request, res: Response) => {
    try {
        const uid = req.user!.uid;
        const ref = db.collection('posts').doc(req.params.id);
        const result = await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            if (!snap.exists) return null;
            const likedBy: string[] = snap.data()!.likedBy || [];
            const wasLiked = likedBy.includes(uid);
            const likesCount = Math.max(0, (Number(snap.data()!.likesCount) || 0) + (wasLiked ? -1 : 1));
            tx.update(ref, {
                likedBy: wasLiked ? FieldValue.arrayRemove(uid) : FieldValue.arrayUnion(uid),
                likesCount,
            });
            return { liked: !wasLiked, likesCount };
        });
        if (!result) return res.status(404).json({ error: 'Post not found' });
        res.status(200).json(result);
    } catch (error: any) {
        console.error('Like post error:', error);
        res.status(500).json({ error: 'Failed to toggle like' });
    }
});

/**
 * @route   GET /api/posts/:id/comments
 */
router.get('/:id/comments', optionalAuthenticateUser, async (req: Request, res: Response) => {
    try {
        const blocked = await blockedFor(req.user?.uid);
        // Comments live in the top-level "comments" collection (automatic single-field indexes)
        const snap = await db.collection('comments').where('postId', '==', req.params.id).get();
        const raw = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
            .filter(c => !blocked.includes(c.userId))
            .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
            .slice(-500);
        const people = await getDisplayProfiles(raw.map(c => c.userId));
        const comments = raw.map(c => {
            const p = people.get(c.userId);
            return {
                id: c.id,
                postId: req.params.id,
                userId: c.userId,
                userName: p?.name || 'QIIRA user',
                userAvatar: p?.avatar || '',
                text: c.text || '',
                createdAt: c.createdAt,
                isVerified: Boolean(p?.isVerified),
                isAdmin: Boolean(p?.isAdmin),
            };
        });
        res.status(200).json({ comments, count: comments.length });
    } catch (error: any) {
        console.error('Get comments error:', error);
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
});

/**
 * @route   POST /api/posts/:id/comments
 */
router.post('/:id/comments', authenticateUser, writeLimiter, async (req: Request, res: Response) => {
    try {
        const uid = req.user!.uid;
        const text = str(req.body.text, MAX_COMMENT_LENGTH + 1);
        if (!text) return res.status(400).json({ error: 'Comment text is required' });
        if (text.length > MAX_COMMENT_LENGTH) {
            return res.status(400).json({ error: `Comments can be at most ${MAX_COMMENT_LENGTH} characters` });
        }

        const postRef = db.collection('posts').doc(req.params.id);
        const post = await postRef.get();
        if (!post.exists) return res.status(404).json({ error: 'Post not found' });

        // You can't comment on posts by someone who blocked you
        const author = await getDisplayProfile(post.data()!.authorId || post.data()!.vendorId);
        if (author.blockedUserIds.includes(uid)) {
            return res.status(403).json({ error: 'You cannot comment on this post' });
        }

        const me = await getDisplayProfile(uid);
        const commentId = `comment_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const comment = { id: commentId, postId: post.id, userId: uid, text, createdAt: new Date().toISOString() };

        const batch = db.batch();
        batch.set(db.collection('comments').doc(commentId), comment);
        batch.update(postRef, { commentsCount: FieldValue.increment(1) });
        await batch.commit();

        res.status(201).json({
            message: 'Comment added successfully',
            comment: { ...comment, userName: me.name, userAvatar: me.avatar, isVerified: me.isVerified, isAdmin: me.isAdmin },
        });
    } catch (error: any) {
        console.error('Add comment error:', error);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

/**
 * @route   DELETE /api/posts/:id/comments/:commentId
 * @desc    Delete a comment: its author, the post's owner, or an admin
 */
router.delete('/:id/comments/:commentId', authenticateUser, async (req: Request, res: Response) => {
    try {
        const postRef = db.collection('posts').doc(req.params.id);
        const [post, comment] = await Promise.all([postRef.get(), db.collection('comments').doc(req.params.commentId).get()]);
        if (!post.exists || !comment.exists || comment.data()!.postId !== post.id) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        const uid = req.user!.uid;
        const isPostOwner = post.data()!.authorId === uid || post.data()!.vendorId === uid;
        if (comment.data()!.userId !== uid && !isPostOwner && !req.user!.isAdmin) {
            return res.status(403).json({ error: 'You can only delete your own comments' });
        }
        await deleteComment(req.params.commentId);
        res.status(200).json({ message: 'Comment deleted', commentId: req.params.commentId });
    } catch (error: any) {
        console.error('Delete comment error:', error);
        res.status(500).json({ error: 'Failed to delete comment' });
    }
});

/**
 * @route   DELETE /api/posts/:id — owner or admin
 */
router.delete('/:id', authenticateUser, async (req: Request, res: Response) => {
    try {
        const doc = await db.collection('posts').doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ error: 'Post not found' });
        const p = doc.data()!;
        const isOwner = p.vendorId === req.user!.uid || p.authorId === req.user!.uid;
        if (!isOwner && !req.user!.isAdmin) {
            return res.status(403).json({ error: 'Forbidden: You only have permission to delete your own posts unless you are an administrator.' });
        }
        await deletePostAndComments(req.params.id);
        res.status(200).json({ message: 'Post deleted successfully', postId: req.params.id, deletedBy: isOwner ? 'owner' : 'admin' });
    } catch (error: any) {
        console.error('Delete post error:', error);
        res.status(500).json({ error: 'Failed to delete post' });
    }
});

// ─── Shared deletion helpers (also used by moderation) ──────────────────────

/** Delete a post, all its comments (incl. any legacy sub-collection copies) and its uploaded media. */
export async function deletePostAndComments(postId: string): Promise<void> {
    const postRef = db.collection('posts').doc(postId);
    const post = await postRef.get();
    const [comments, legacy] = await Promise.all([
        db.collection('comments').where('postId', '==', postId).get(),
        postRef.collection('comments').get(),
    ]);
    const refs = [...comments.docs.map(d => d.ref), ...legacy.docs.map(d => d.ref), postRef];
    for (let i = 0; i < refs.length; i += 400) {
        const batch = db.batch();
        refs.slice(i, i + 400).forEach(r => batch.delete(r));
        await batch.commit();
    }
    // Remove the post's own uploaded files (external links are left alone)
    const media: string[] = post.exists ? [...(post.data()!.mediaUrls || []), post.data()!.mediaUrl, post.data()!.thumbnailUrl] : [];
    const paths = [...new Set(media.map(storagePathOf).filter((p): p is string => Boolean(p)))];
    await Promise.all(paths.map(p => storage.bucket().file(p).delete().catch(() => {})));
}

/** Delete one comment and correct its post's comment counter. */
export async function deleteComment(commentId: string): Promise<boolean> {
    const ref = db.collection('comments').doc(commentId);
    const snap = await ref.get();
    if (!snap.exists) return false;

    const postId = snap.data()!.postId;
    const batch = db.batch();
    batch.delete(ref);
    if (postId) {
        const postRef = db.collection('posts').doc(postId);
        batch.delete(postRef.collection('comments').doc(commentId)); // legacy copy, if any
        if ((await postRef.get()).exists) batch.update(postRef, { commentsCount: FieldValue.increment(-1) });
    }
    await batch.commit();
    return true;
}

export default router;
