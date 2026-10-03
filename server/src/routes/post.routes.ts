import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import supabase from '../config/supabase';

const router = Router();

// In-memory array for newly created posts (syncs with Firestore and guarantees 100% instant retrieval)
const MEMORY_POSTS: any[] = [];

// Sample seed posts (empty - only real user-created posts are shown)
const SAMPLE_POSTS: any[] = [];

// In-memory comments store
const IN_MEMORY_COMMENTS: Record<string, any[]> = {};

// Helper: fetch vendor information to enrich post
async function getVendorMeta(vendorId: string) {
    let vendorName = 'Vendor';
    let vendorCategory = 'General';
    let vendorImage = '';
    let isVerified = false;
    let isAdmin = (vendorId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2');
    let role = isAdmin ? 'admin' : 'vendor';

    // 1. Try Firestore vendors collection
    try {
        const doc = await db.collection('vendors').doc(vendorId).get();
        if (doc.exists) {
            const data = doc.data()!;
            vendorName = data.businessName || data.fullName || vendorName;
            vendorCategory = data.category || vendorCategory;
            vendorImage = data.profileImage || data.businessImage || data.photoURL || data.avatar || data.logo || vendorImage;
            if (data.isVerified === true || data.is_verified === true) {
                isVerified = true;
            }
            if (data.role === 'admin') {
                isAdmin = true;
                role = 'admin';
            }
        }
    } catch (_) {}

    // 2. Try Firestore users collection
    try {
        const userDoc = await db.collection('users').doc(vendorId).get();
        if (userDoc.exists) {
            const data = userDoc.data()!;
            vendorName = data.businessName || data.fullName || data.displayName || vendorName;
            vendorCategory = data.category || vendorCategory;
            vendorImage = data.profileImage || data.businessImage || data.photoURL || data.avatar || vendorImage;
            if (data.isVerified === true || data.is_verified === true || data.role === 'admin') {
                isVerified = true;
            }
            if (data.role === 'admin') {
                isAdmin = true;
                role = 'admin';
            }
        }
    } catch (_) {}

    if (isAdmin) {
        isVerified = true;
    }

    return {
        vendorName,
        vendorCategory,
        vendorImage,
        isVerified,
        isAdmin,
        role,
    };
}

function withTimeout(promise: any, ms = 1200): Promise<any> {
    return Promise.race([
        Promise.resolve(promise),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
    ]);
}

// Helper: get all unified posts from Firestore + Memory + Seed
async function getAllUnifiedPosts(): Promise<any[]> {
    const postMap = new Map<string, any>();

    // 1. Add Seed posts
    for (const p of SAMPLE_POSTS) {
        postMap.set(p.id, { ...p });
    }

    // 2. Add In-Memory created posts
    for (const p of MEMORY_POSTS) {
        postMap.set(p.id, { ...p });
    }

    // 3. Add Firestore posts (graceful with 1.2s timeout)
    try {
        const snapshot = await withTimeout(db.collection('posts').get(), 1200);
        if (snapshot) {
            snapshot.forEach((doc: any) => {
                const data = doc.data();
                postMap.set(doc.id, {
                    id: doc.id,
                    ...data,
                });
            });
        }
    } catch (e: any) {
        console.warn('Firestore load posts note:', e.message);
    }

    // Convert map to array
    const allPosts = Array.from(postMap.values());

    // Enrich vendor info for live vendor posts with their latest profile picture & verification status
    const uniqueVendorIds = Array.from(new Set(allPosts.map(p => p.vendorId).filter(id => id && !id.startsWith('seed-'))));
    if (uniqueVendorIds.length > 0) {
        const metas = await Promise.all(uniqueVendorIds.map(id => getVendorMeta(id)));
        const vendorCache = new Map<string, any>();
        uniqueVendorIds.forEach((id, idx) => vendorCache.set(id, metas[idx]));

        for (const p of allPosts) {
            if (p.authorType === 'client') continue; // Preserve client author metadata
            if (p.vendorId && vendorCache.has(p.vendorId)) {
                const meta = vendorCache.get(p.vendorId);
                if (meta) {
                    if (meta.vendorImage) p.vendorImage = meta.vendorImage;
                    if (meta.vendorName && meta.vendorName !== 'Vendor') p.vendorName = meta.vendorName;
                    if (meta.vendorCategory && meta.vendorCategory !== 'General') p.vendorCategory = meta.vendorCategory;
                    p.isVerified = Boolean(meta.isVerified);
                    p.isAdmin = Boolean(meta.isAdmin);
                    p.role = meta.role || (meta.isAdmin ? 'admin' : 'vendor');
                }
            }
        }
    }

    allPosts.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return allPosts;
}

/**
 * @route   GET /api/posts/feed
 * @desc    Get explore feed with optional filtering by type ('post' | 'reel' | 'all') and category
 * @access  Public
 */
router.get('/feed', async (req: Request, res: Response) => {
    try {
        const { type, category, limit = '30', userId } = req.query;
        const allPosts = await getAllUnifiedPosts();

        let filtered = allPosts.filter(p => {
            if (type && type !== 'all' && p.type !== type) return false;
            if (category && category !== 'All') {
                const catStr = String(category).toLowerCase();
                const rootWord = catStr.split('&')[0].trim().split(' ')[0].trim();
                const pCat = String(p.category || '').toLowerCase();
                const vCat = String(p.vendorCategory || '').toLowerCase();
                const matches = pCat.includes(catStr) || catStr.includes(pCat) || (rootWord.length > 3 && pCat.includes(rootWord)) ||
                                vCat.includes(catStr) || catStr.includes(vCat) || (rootWord.length > 3 && vCat.includes(rootWord));
                if (!matches) return false;
            }
            return true;
        });

        const finalPosts = filtered.slice(0, Number(limit) || 30).map(p => ({
            ...p,
            isLiked: userId ? (p.likedBy || []).includes(userId as string) : false,
        }));

        res.status(200).json({
            posts: finalPosts,
            count: finalPosts.length,
        });
    } catch (error: any) {
        console.error('Get feed error:', error);
        res.status(500).json({ error: 'Failed to fetch explore feed', message: error.message });
    }
});

/**
 * @route   GET /api/posts/showcase (or /api/posts/reels)
 * @desc    Get showcase (video) only feed
 * @access  Public
 */
router.get(['/reels', '/showcase'], async (req: Request, res: Response) => {
    try {
        const { userId } = req.query;
        const allPosts = await getAllUnifiedPosts();

        const showcaseList = allPosts.filter(p => p.type === 'reel' || p.type === 'showcase').map(p => ({
            ...p,
            isLiked: userId ? (p.likedBy || []).includes(userId as string) : false,
        }));

        res.status(200).json({
            showcase: showcaseList,
            reels: showcaseList,
            count: showcaseList.length,
        });
    } catch (error: any) {
        console.error('Get showcase error:', error);
        res.status(500).json({ error: 'Failed to fetch showcase', message: error.message });
    }
});

/**
 * @route   GET /api/posts/vendor/:vendorId
 * @desc    Get all posts and reels uploaded by a specific vendor
 * @access  Public
 */
router.get('/vendor/:vendorId', async (req: Request, res: Response) => {
    try {
        const { vendorId } = req.params;
        const { userId } = req.query;
        const allPosts = await getAllUnifiedPosts();

        const vendorPosts = allPosts.filter(p => p.vendorId === vendorId).map(p => ({
            ...p,
            isLiked: userId ? (p.likedBy || []).includes(userId as string) : false,
        }));

        res.status(200).json({
            posts: vendorPosts,
            count: vendorPosts.length,
        });
    } catch (error: any) {
        console.error('Get vendor posts error:', error);
        res.status(500).json({ error: 'Failed to fetch vendor posts', message: error.message });
    }
});

/**
 * @route   GET /api/posts/:id
 * @desc    Get single post details
 * @access  Public
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { userId } = req.query;
        const allPosts = await getAllUnifiedPosts();

        const found = allPosts.find(p => p.id === id);
        if (found) {
            res.status(200).json({
                post: {
                    ...found,
                    isLiked: userId ? (found.likedBy || []).includes(userId as string) : false,
                }
            });
            return;
        }

        res.status(404).json({ error: 'Post not found' });
    } catch (error: any) {
        console.error('Get post error:', error);
        res.status(500).json({ error: 'Failed to fetch post', message: error.message });
    }
});

/**
 * @route   POST /api/posts
 * @desc    Create a new post, reel, or client community post
 * @access  Authenticated users (Vendors & Clients)
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const {
            vendorId,
            userId,
            authorId,
            authorType = 'vendor', // 'vendor' | 'client'
            authorName: explicitAuthorName,
            authorAvatar: explicitAuthorAvatar,
            clientPostType = 'update', // 'update' | 'question' | 'shoutout'
            taggedVendorId,
            taggedVendorName,
            type = 'post', // 'post' | 'reel' | 'community'
            caption,
            mediaUrl,
            mediaUrls,   // array of media URLs for multi-media posts
            thumbnailUrl,
            price,
            currency = 'NGN',
            category = 'General',
            tags = [],
        } = req.body;

        const creatorId = vendorId || userId || authorId;

        // Build the final media array — supports both single and multi-media
        let finalMediaUrls: string[] = [];
        if (Array.isArray(mediaUrls) && mediaUrls.length > 0) {
            finalMediaUrls = mediaUrls.filter((u: string) => u && u.trim());
        } else if (mediaUrl) {
            finalMediaUrls = [mediaUrl];
        }

        if (!creatorId) {
            return res.status(400).json({ error: 'creatorId / vendorId / userId is required' });
        }

        // For vendors, at least one media URL is required; for clients, either caption or media is required
        if (authorType !== 'client' && finalMediaUrls.length === 0) {
            return res.status(400).json({ error: 'vendorId and at least one media URL are required' });
        }

        if (authorType === 'client' && !caption && finalMediaUrls.length === 0) {
            return res.status(400).json({ error: 'Please provide either a message or a photo/video for your post' });
        }

        const postId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        let newPost: any;

        if (authorType === 'client') {
            // Fetch client details from users collection if not passed explicitly
            let clientName = explicitAuthorName || 'Client';
            let clientAvatar = explicitAuthorAvatar || '';
            let isVerified = false;
            let isAdmin = (creatorId === 'v8MwaOet0ISfZAWXIDAPAGcg1td2');

            try {
                const userDoc = await db.collection('users').doc(creatorId).get();
                if (userDoc.exists) {
                    const uData = userDoc.data()!;
                    clientName = uData.displayName || uData.fullName || clientName;
                    clientAvatar = uData.photoURL || uData.profileImage || uData.avatar || clientAvatar;
                    if (uData.isVerified || uData.is_verified) isVerified = true;
                    if (uData.role === 'admin') isAdmin = true;
                }
            } catch (_) {}

            newPost = {
                id: postId,
                vendorId: creatorId,
                authorId: creatorId,
                authorType: 'client',
                clientPostType: clientPostType || 'update',
                taggedVendorId: taggedVendorId || null,
                taggedVendorName: taggedVendorName || null,
                vendorName: clientName,
                vendorCategory: 'Community',
                vendorImage: clientAvatar,
                vendorTier: isVerified ? 'verified' : 'none',
                isVerified: Boolean(isVerified || isAdmin),
                isAdmin: Boolean(isAdmin),
                role: isAdmin ? 'admin' : 'client',
                type: 'community',
                caption: caption || '',
                mediaUrl: finalMediaUrls[0] || null,
                mediaUrls: finalMediaUrls,
                thumbnailUrl: thumbnailUrl || finalMediaUrls[0] || null,
                mediaCount: finalMediaUrls.length,
                price: null,
                currency,
                category: 'Community',
                tags: Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : []),
                likesCount: 0,
                commentsCount: 0,
                likedBy: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
        } else {
            const vendorMeta = await getVendorMeta(creatorId);

            newPost = {
                id: postId,
                vendorId: creatorId,
                authorId: creatorId,
                authorType: 'vendor',
                vendorName: vendorMeta.vendorName,
                vendorCategory: vendorMeta.vendorCategory,
                vendorImage: vendorMeta.vendorImage,
                vendorTier: vendorMeta.isVerified ? 'verified' : 'none',
                isVerified: vendorMeta.isVerified,
                isAdmin: Boolean(vendorMeta.isAdmin),
                role: vendorMeta.role || (vendorMeta.isAdmin ? 'admin' : 'vendor'),
                type: type === 'reel' ? 'reel' : 'post',
                caption: caption || '',
                mediaUrl: finalMediaUrls[0],                    // Primary media (backward compat)
                mediaUrls: finalMediaUrls,                      // Full list of all media
                thumbnailUrl: thumbnailUrl || finalMediaUrls[0],
                mediaCount: finalMediaUrls.length,
                price: (price !== undefined && price !== null && price !== '' && !isNaN(Number(price))) ? Number(price) : null,
                currency,
                category,
                tags: Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : []),
                likesCount: 0,
                commentsCount: 0,
                likedBy: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
        }

        // 1. Store in memory for instant availability
        MEMORY_POSTS.unshift(newPost);

        // 2. Also persist to Firestore
        try {
            await db.collection('posts').doc(postId).set(newPost);
        } catch (dbErr: any) {
            console.warn('Firestore post save note:', dbErr.message);
        }

        res.status(201).json({
            message: 'Post created successfully',
            post: newPost,
        });
    } catch (error: any) {
        console.error('Create post error:', error);
        res.status(500).json({ error: 'Failed to create post', message: error.message });
    }
});

/**
 * @route   POST /api/posts/:id/like
 * @desc    Toggle like / unlike a post
 * @access  Authenticated users
 */
router.post('/:id/like', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;

        if (!userId) {
            res.status(400).json({ error: 'userId is required to like a post' });
            return;
        }

        // Check in memory / seed first
        let targetPost = MEMORY_POSTS.find(p => p.id === id) || SAMPLE_POSTS.find(p => p.id === id);

        if (!targetPost) {
            try {
                const doc = await db.collection('posts').doc(id).get();
                if (doc.exists) {
                    targetPost = { id: doc.id, ...doc.data() };
                    MEMORY_POSTS.push(targetPost);
                }
            } catch (_) {}
        }

        if (!targetPost) {
            res.status(404).json({ error: 'Post not found' });
            return;
        }

        targetPost.likedBy = targetPost.likedBy || [];
        const index = targetPost.likedBy.indexOf(userId);
        let liked = false;

        if (index > -1) {
            targetPost.likedBy.splice(index, 1);
            targetPost.likesCount = Math.max(0, (targetPost.likesCount || 1) - 1);
        } else {
            targetPost.likedBy.push(userId);
            targetPost.likesCount = (targetPost.likesCount || 0) + 1;
            liked = true;
        }

        try {
            await db.collection('posts').doc(id).set({
                likedBy: targetPost.likedBy,
                likesCount: targetPost.likesCount,
                updatedAt: new Date().toISOString(),
            }, { merge: true });
        } catch (_) {}

        res.status(200).json({
            liked,
            likesCount: targetPost.likesCount,
        });
    } catch (error: any) {
        console.error('Like post error:', error);
        res.status(500).json({ error: 'Failed to toggle like', message: error.message });
    }
});

/**
 * @route   GET /api/posts/:id/comments
 * @desc    Get comments thread for a post
 * @access  Public
 */
router.get('/:id/comments', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const commentsList: any[] = [];

        // 1. Check In-Memory comments
        if (IN_MEMORY_COMMENTS[id]) {
            commentsList.push(...IN_MEMORY_COMMENTS[id]);
        }

        // 2. Check Firestore post subcollection
        try {
            let snapshot: any = await db.collection('posts').doc(id).collection('comments').orderBy('createdAt', 'asc').get().catch(() => null);
            if (!snapshot) {
                snapshot = await db.collection('posts').doc(id).collection('comments').get().catch(() => null);
            }
            if (snapshot?.forEach) {
                snapshot.forEach((doc: any) => {
                    if (!commentsList.some(c => c.id === doc.id)) {
                        commentsList.push({ id: doc.id, ...doc.data() });
                    }
                });
            }
        } catch (_) {}

        // 3. Check Firestore root comments collection
        try {
            const rootSnap: any = await db.collection('comments').where('postId', '==', id).get().catch(() => null);
            if (rootSnap?.forEach) {
                rootSnap.forEach((doc: any) => {
                    if (!commentsList.some(c => c.id === doc.id)) {
                        commentsList.push({ id: doc.id, ...doc.data() });
                    }
                });
            }
        } catch (_) {}

        // 4. Enrich comments with live verification status and latest profile photos
        const userIds = Array.from(new Set(commentsList.map(c => c.userId).filter(Boolean)));
        const userVerifyMap = new Map<string, { isVerified: boolean; isAdmin: boolean; avatar?: string; name?: string }>();

        if (userIds.length > 0) {
            try {
                const userDocs = await Promise.all(userIds.map(uid => db.collection('users').doc(uid).get().catch(() => null)));
                userDocs.forEach(doc => {
                    if (doc && doc.exists) {
                        const d = doc.data()!;
                        userVerifyMap.set(doc.id, {
                            isVerified: Boolean(d.isVerified || d.is_verified || d.role === 'admin'),
                            isAdmin: d.role === 'admin',
                            avatar: d.profileImage || d.profile_image || d.photoURL || d.avatar || '',
                            name: d.fullName || d.full_name || d.displayName || '',
                        });
                    }
                });
            } catch (_) {}
        }

        const enrichedComments = commentsList.map(c => {
            const vInfo = userVerifyMap.get(c.userId);
            return {
                ...c,
                userAvatar: vInfo?.avatar || c.userAvatar || '',
                userName: vInfo?.name || c.userName || 'User',
                isVerified: vInfo?.isVerified ?? Boolean(c.isVerified),
                isAdmin: vInfo?.isAdmin ?? false,
            };
        });

        enrichedComments.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

        res.status(200).json({
            comments: enrichedComments,
            count: enrichedComments.length,
        });
    } catch (error: any) {
        console.error('Get comments error:', error);
        res.status(500).json({ error: 'Failed to fetch comments', message: error.message });
    }
});

/**
 * @route   POST /api/posts/:id/comments
 * @desc    Add comment to a post
 * @access  Authenticated users
 */
router.post('/:id/comments', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { userId, userName, userAvatar, text } = req.body;

        if (!userId || !text) {
            res.status(400).json({ error: 'userId and text are required' });
            return;
        }

        // Resolve latest user avatar from users collection
        let resolvedAvatar = userAvatar || '';
        let resolvedName = userName || 'User';
        try {
            const uDoc = await db.collection('users').doc(userId).get();
            if (uDoc.exists) {
                const uData = uDoc.data()!;
                resolvedAvatar = uData.profileImage || uData.profile_image || uData.photoURL || uData.avatar || resolvedAvatar;
                resolvedName = uData.fullName || uData.full_name || uData.displayName || resolvedName;
            }
        } catch (_) {}

        const commentId = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const newComment = {
            id: commentId,
            postId: id,
            userId,
            userName: resolvedName,
            userAvatar: resolvedAvatar,
            text,
            createdAt: new Date().toISOString(),
        };

        if (!IN_MEMORY_COMMENTS[id]) {
            IN_MEMORY_COMMENTS[id] = [];
        }
        IN_MEMORY_COMMENTS[id].push(newComment);

        // Update post comments count in memory
        const targetPost = MEMORY_POSTS.find(p => p.id === id) || SAMPLE_POSTS.find(p => p.id === id);
        if (targetPost) {
            targetPost.commentsCount = (targetPost.commentsCount || 0) + 1;
        }

        // Persist to Firestore (subcollection and root collection for max durability)
        try {
            await db.collection('posts').doc(id).collection('comments').doc(commentId).set(newComment);
            await db.collection('comments').doc(commentId).set(newComment);
            await db.collection('posts').doc(id).set({
                commentsCount: (targetPost?.commentsCount || 1),
            }, { merge: true });
        } catch (_) {}

        res.status(201).json({
            message: 'Comment added successfully',
            comment: newComment,
        });
    } catch (error: any) {
        console.error('Add comment error:', error);
        res.status(500).json({ error: 'Failed to add comment', message: error.message });
    }
});

/**
 * @route   DELETE /api/posts/:id
 * @desc    Delete a post (Vendor can delete own posts, Admin can delete any post)
 * @access  Vendor owner or Admin only
 */
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req.body.userId || req.query.userId || req.headers['x-user-id']) as string;
        const role = (req.body.role || req.query.role || req.headers['x-user-role']) as string;

        if (!userId) {
            res.status(401).json({ error: 'User ID is required to perform this action' });
            return;
        }

        // 1. Locate the post in Memory, Seed, or Firestore
        let targetPost = MEMORY_POSTS.find(p => p.id === id) || SAMPLE_POSTS.find(p => p.id === id);

        if (!targetPost) {
            try {
                const doc = await db.collection('posts').doc(id).get();
                if (doc.exists) {
                    targetPost = { id: doc.id, ...doc.data() };
                }
            } catch (_) {}
        }

        if (!targetPost) {
            res.status(404).json({ error: 'Post not found' });
            return;
        }

        // 2. Check permissions: Admin can delete any post; Vendor can only delete their own post
        const isAdmin = role === 'admin' || (req as any).user?.role === 'admin';
        const isOwner = targetPost.vendorId === userId;

        if (!isAdmin && !isOwner) {
            res.status(403).json({
                error: 'Forbidden: You only have permission to delete your own posts unless you are an administrator.',
            });
            return;
        }

        // 3. Remove from MEMORY_POSTS
        const memIdx = MEMORY_POSTS.findIndex(p => p.id === id);
        if (memIdx > -1) {
            MEMORY_POSTS.splice(memIdx, 1);
        }

        // 4. Remove from SAMPLE_POSTS
        const seedIdx = SAMPLE_POSTS.findIndex(p => p.id === id);
        if (seedIdx > -1) {
            SAMPLE_POSTS.splice(seedIdx, 1);
        }

        // 5. Remove comments
        delete IN_MEMORY_COMMENTS[id];

        // 6. Delete from Firestore
        try {
            await db.collection('posts').doc(id).delete();
        } catch (dbErr: any) {
            console.warn('Firestore post delete note:', dbErr.message);
        }

        res.status(200).json({
            message: 'Post deleted successfully',
            postId: id,
            deletedBy: isAdmin ? 'admin' : 'vendor',
        });
    } catch (error: any) {
        console.error('Delete post error:', error);
        res.status(500).json({ error: 'Failed to delete post', message: error.message });
    }
});

export default router;
