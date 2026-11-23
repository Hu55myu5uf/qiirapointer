import { Router, Request, Response } from 'express';
import { auth, db, FieldValue } from '../config/firebase';
import crypto from 'crypto';
import { authenticateUser, requireAdmin, MASTER_ADMIN_UID, SUPPORT_UID } from '../utils/authMiddleware';
import { clearProfileCache } from '../utils/profiles';
import { invalidateVendorList } from '../utils/vendors';
import { reportLimiter } from '../utils/rateLimiter';

const router = Router();

// Must match the labels in client/src/components/ReportModal.tsx
export const REPORT_REASONS = [
    'Inappropriate or offensive content',
    'Spam, scam, or misleading information',
    'Harassment, bullying, or hate speech',
    'Fake profile, store, or impersonation',
    'Fraudulent transaction or payment issue',
    'Intellectual property or copyright violation',
    'Other violation',
];

/**
 * @route   POST /api/moderation/report
 * @desc    Submit a user-generated content or user violation report (Apple & Google UGC compliance)
 * @access  Public / Authenticated
 */
router.post('/report', authenticateUser, reportLimiter, async (req: Request, res: Response) => {
    try {
        const {
            targetType,    // 'post' | 'comment' | 'user' | 'vendor' | 'listing'
            targetId,      // ID of the reported entity
            targetUserId,  // User ID responsible for the content
            targetTitle,   // Optional preview or title
            reason,        // Category of violation
            details,       // Free-text details
        } = req.body;

        if (!targetType || !targetId || !reason) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'targetType, targetId, and reason are required to file a report.'
            });
        }

        const validTypes = ['post', 'comment', 'user', 'vendor', 'listing'];
        if (!validTypes.includes(targetType)) {
            return res.status(400).json({ error: `Invalid targetType. Allowed: ${validTypes.join(', ')}` });
        }

        if (!REPORT_REASONS.includes(String(reason))) {
            return res.status(400).json({ error: 'Please choose a valid report reason' });
        }
        if (String(targetId).length > 200 || (targetUserId && String(targetUserId).length > 200)) {
            return res.status(400).json({ error: 'Invalid target' });
        }

        // The reporter is always the logged-in user
        const reporterUid = req.user!.uid;
        const reporterEmail = req.user!.email || null;

        // One report per user per item: the id is derived from (reporter, type, target)
        const reportId = 'rep_' + crypto.createHash('sha256')
            .update(`${reporterUid}|${targetType}|${targetId}`).digest('hex').slice(0, 32);
        const existing = await db.collection('reports').doc(reportId).get();
        if (existing.exists) {
            return res.status(200).json({
                success: true,
                alreadyReported: true,
                message: 'You have already reported this. Our moderation team will review it.',
                reportId,
            });
        }

        const reportData = {
            id: reportId,
            targetType,
            targetId: String(targetId),
            targetUserId: targetUserId ? String(targetUserId) : null,
            targetTitle: targetTitle ? String(targetTitle).slice(0, 200) : null,
            reason: String(reason),
            details: details ? String(details).slice(0, 1000) : '',
            reporterUid,
            reporterEmail,
            status: 'pending', // 'pending' | 'reviewed' | 'actioned' | 'dismissed'
            createdAt: new Date().toISOString(),
            reviewedAt: null,
            resolutionNotes: null,
        };

        // Store the report (if this fails the user must be told)
        await db.collection('reports').doc(reportId).set(reportData);

        console.log(`🚩 Report submitted [${reportId}]: ${targetType} ${targetId} by ${reporterUid} (Reason: ${reason})`);

        res.status(201).json({
            success: true,
            message: 'Thank you for your report. Our moderation team reviews all flagged content within 24 hours to ensure community safety.',
            reportId
        });
    } catch (error: any) {
        console.error('Submit report error:', error);
        res.status(500).json({ error: 'Failed to submit report', message: error.message });
    }
});

/**
 * @route   POST /api/moderation/block
 * @desc    Block an abusive user (blocks messaging and hides their content)
 * @access  Private (requires authentication)
 */
router.post('/block', authenticateUser, async (req: Request, res: Response) => {
    try {
        const callerUid = req.user!.uid;
        const { blockedUserId, blockedUserName } = req.body;

        if (!blockedUserId || typeof blockedUserId !== 'string') {
            return res.status(400).json({ error: 'blockedUserId is required' });
        }

        if (callerUid === blockedUserId) {
            return res.status(400).json({ error: 'You cannot block yourself' });
        }

        if (blockedUserId.length > 128 || blockedUserId === SUPPORT_UID) {
            return res.status(400).json({ error: 'This account cannot be blocked' });
        }

        const now = new Date().toISOString();
        const userRef = db.collection('users').doc(callerUid);

        // Atomic: the list entry and the quick-lookup array are written together
        const batch = db.batch();
        batch.set(userRef.collection('blocked_users').doc(blockedUserId), {
            blockedUserId,
            blockedUserName: typeof blockedUserName === 'string' ? blockedUserName.slice(0, 100) : 'User',
            blockedAt: now,
        });
        batch.set(userRef, { blockedUserIds: FieldValue.arrayUnion(blockedUserId) }, { merge: true });
        await batch.commit();
        clearProfileCache(callerUid);

        console.log(`🚫 User ${callerUid} blocked ${blockedUserId}`);

        res.status(200).json({
            success: true,
            message: 'User blocked successfully. You will no longer see content or receive messages from them.',
            blockedUserId
        });
    } catch (error: any) {
        console.error('Block user error:', error);
        res.status(500).json({ error: 'Failed to block user', message: error.message });
    }
});

/**
 * @route   POST /api/moderation/unblock
 * @desc    Unblock a previously blocked user
 * @access  Private (requires authentication)
 */
router.post('/unblock', authenticateUser, async (req: Request, res: Response) => {
    try {
        const callerUid = req.user!.uid;
        const { blockedUserId } = req.body;

        if (!blockedUserId || typeof blockedUserId !== 'string') {
            return res.status(400).json({ error: 'blockedUserId is required' });
        }

        const userRef = db.collection('users').doc(callerUid);
        const batch = db.batch();
        batch.delete(userRef.collection('blocked_users').doc(blockedUserId));
        batch.set(userRef, { blockedUserIds: FieldValue.arrayRemove(blockedUserId) }, { merge: true });
        await batch.commit();
        clearProfileCache(callerUid);

        console.log(`🔓 User ${callerUid} unblocked ${blockedUserId}`);

        res.status(200).json({
            success: true,
            message: 'User unblocked successfully.',
            blockedUserId
        });
    } catch (error: any) {
        console.error('Unblock user error:', error);
        res.status(500).json({ error: 'Failed to unblock user', message: error.message });
    }
});

/**
 * @route   GET /api/moderation/blocked
 * @desc    Get list of all users blocked by the caller
 * @access  Private (requires authentication)
 */
router.get('/blocked', authenticateUser, async (req: Request, res: Response) => {
    try {
        const callerUid = req.user!.uid;
        const snap = await db.collection('users').doc(callerUid).collection('blocked_users').get();
        const blocked = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.status(200).json({ blocked });
    } catch (error: any) {
        console.error('Get blocked users error:', error);
        res.status(500).json({ error: 'Failed to fetch blocked users', message: error.message });
    }
});

/**
 * @route   GET /api/moderation/reports
 * @desc    Admin: View all submitted violation reports
 * @access  Private (Admin only)
 */
router.get('/reports', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
    try {
        const snap = await db.collection('reports').orderBy('createdAt', 'desc').limit(100).get();
        const reports = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.status(200).json({ reports });
    } catch (error: any) {
        // Fallback if index missing or order error
        try {
            const snapFallback = await db.collection('reports').limit(100).get();
            const reports = snapFallback.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return res.status(200).json({ reports });
        } catch (fbErr: any) {
            res.status(500).json({ error: 'Failed to fetch reports', message: fbErr.message });
        }
    }
});

/**
 * @route   PUT /api/moderation/reports/:id/resolve
 * @desc    Admin: Resolve a report (dismiss, remove content, or suspend user)
 * @access  Private (Admin only)
 */
router.put('/reports/:id/resolve', authenticateUser, requireAdmin, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { action, notes } = req.body; // 'dismiss' | 'remove_content' | 'suspend_user'
        if (!['dismiss', 'remove_content', 'suspend_user'].includes(action)) {
            return res.status(400).json({ error: 'Invalid action' });
        }

        const reportRef = db.collection('reports').doc(id);
        const reportDoc = await reportRef.get();
        if (!reportDoc.exists) {
            return res.status(404).json({ error: 'Report not found' });
        }

        const reportData = reportDoc.data()!;
        const now = new Date().toISOString();

        if (action === 'remove_content' && reportData.targetId) {
            const { deletePostAndComments, deleteComment } = await import('./post.routes');
            if (reportData.targetType === 'post') {
                await deletePostAndComments(reportData.targetId);
                console.log(`🗑️ Admin removed reported post: ${reportData.targetId}`);
            } else if (reportData.targetType === 'comment') {
                await deleteComment(reportData.targetId);
                console.log(`🗑️ Admin removed reported comment: ${reportData.targetId}`);
            } else {
                return res.status(400).json({ error: 'Use "suspend_user" for reported users and vendors' });
            }
        }

        if (action === 'suspend_user') {
            const target = reportData.targetUserId || (['user', 'vendor'].includes(reportData.targetType) ? reportData.targetId : null);
            if (!target) return res.status(400).json({ error: 'This report has no user to suspend' });
            if (target === req.user!.uid || target === MASTER_ADMIN_UID || target === SUPPORT_UID) {
                return res.status(403).json({ error: 'This account cannot be suspended' });
            }
            await db.collection('users').doc(target).set({
                isSuspended: true,
                suspendedAt: now,
                suspendedBy: req.user!.uid,
                suspensionReason: `Report violation: ${reportData.reason}`,
            }, { merge: true });
            try { await auth.revokeRefreshTokens(target); } catch (_) {}
            clearProfileCache(target);
            invalidateVendorList();
            console.log(`⛔ Admin suspended reported user: ${target}`);
        }

        await reportRef.set({
            status: action === 'dismiss' ? 'dismissed' : 'actioned',
            actionTaken: action,
            resolutionNotes: notes || '',
            resolvedAt: now,
            resolvedBy: req.user!.uid,
        }, { merge: true });

        res.status(200).json({
            success: true,
            message: `Report resolved with action: ${action}`
        });
    } catch (error: any) {
        console.error('Resolve report error:', error);
        res.status(500).json({ error: 'Failed to resolve report', message: error.message });
    }
});

export default router;
