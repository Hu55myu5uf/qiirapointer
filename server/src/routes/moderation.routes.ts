import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import supabase from '../config/supabase';
import crypto from 'crypto';
import { authenticateUser, requireAdmin } from '../utils/authMiddleware';
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
            targetType,    // 'post' | 'comment' | 'user' | 'vendor'
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

        const validTypes = ['post', 'comment', 'user', 'vendor'];
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

        // 1. Store in Firestore reports collection (if this fails the user must be told)
        await db.collection('reports').doc(reportId).set(reportData);

        // 2. Also try Supabase reports table if exists (non-blocking)
        try {
            await supabase.from('reports').insert([{
                id: reportId,
                target_type: targetType,
                target_id: String(targetId),
                target_user_id: targetUserId ? String(targetUserId) : null,
                reason: String(reason),
                details: details ? String(details).slice(0, 1000) : '',
                reporter_uid: reporterUid,
                status: 'pending',
                created_at: new Date().toISOString()
            }]);
        } catch (_) {}

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

        const now = new Date().toISOString();

        // 1. Save in Firestore under caller's blocked_users subcollection
        try {
            await db.collection('users').doc(callerUid).collection('blocked_users').doc(blockedUserId).set({
                blockedUserId,
                blockedUserName: blockedUserName || 'User',
                blockedAt: now,
            });

            // Also maintain blockedUserIds array on user doc for easy atomic array checks
            const userRef = db.collection('users').doc(callerUid);
            const userSnap = await userRef.get();
            const existingBlocked: string[] = userSnap.data()?.blockedUserIds || [];
            if (!existingBlocked.includes(blockedUserId)) {
                existingBlocked.push(blockedUserId);
                await userRef.set({ blockedUserIds: existingBlocked }, { merge: true });
            }
        } catch (fsErr: any) {
            console.warn('Firestore block save note:', fsErr.message);
        }

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

        try {
            await db.collection('users').doc(callerUid).collection('blocked_users').doc(blockedUserId).delete();

            const userRef = db.collection('users').doc(callerUid);
            const userSnap = await userRef.get();
            const existingBlocked: string[] = userSnap.data()?.blockedUserIds || [];
            const updated = existingBlocked.filter(id => id !== blockedUserId);
            await userRef.set({ blockedUserIds: updated }, { merge: true });
        } catch (fsErr: any) {
            console.warn('Firestore unblock note:', fsErr.message);
        }

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

        const reportRef = db.collection('reports').doc(id);
        const reportDoc = await reportRef.get();
        if (!reportDoc.exists) {
            return res.status(404).json({ error: 'Report not found' });
        }

        const reportData = reportDoc.data()!;
        const now = new Date().toISOString();

        if (action === 'remove_content' && reportData.targetType === 'post' && reportData.targetId) {
            try {
                await db.collection('posts').doc(reportData.targetId).delete();
                console.log(`🗑️ Admin removed reported post: ${reportData.targetId}`);
            } catch (_) {}
        }

        if (action === 'suspend_user' && reportData.targetUserId) {
            try {
                await db.collection('users').doc(reportData.targetUserId).set({
                    isSuspended: true,
                    suspendedAt: now,
                    suspensionReason: `Report violation: ${reportData.reason}`
                }, { merge: true });
                await supabase.from('users').update({ is_suspended: true, suspended_at: now }).eq('uid', reportData.targetUserId);
                console.log(`⛔ Admin suspended reported user: ${reportData.targetUserId}`);
            } catch (_) {}
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
