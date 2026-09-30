import { Router, Request, Response } from 'express';

const router = Router();

export interface CallSession {
    id: string;
    callerId: string;
    callerName: string;
    callerAvatar?: string;
    receiverId: string;
    receiverName: string;
    receiverAvatar?: string;
    callType: 'voice' | 'video';
    status: 'ringing' | 'connected' | 'rejected' | 'ended' | 'missed' | 'busy';
    createdAt: string;
    answeredAt?: string;
    endedAt?: string;
    durationSeconds?: number;
}

// In-memory call sessions storage
const activeCalls: Map<string, CallSession> = new Map();
const callHistory: CallSession[] = [];

// Clean up stale ringing calls (older than 45 seconds)
setInterval(() => {
    const now = Date.now();
    for (const [id, session] of activeCalls.entries()) {
        const created = new Date(session.createdAt).getTime();
        if (session.status === 'ringing' && now - created > 45000) {
            session.status = 'missed';
            session.endedAt = new Date().toISOString();
            callHistory.unshift({ ...session });
            activeCalls.delete(id);
        } else if (session.status === 'ended' || session.status === 'rejected') {
            callHistory.unshift({ ...session });
            activeCalls.delete(id);
        }
    }
}, 5000);

/**
 * POST /api/calls/initiate
 * Start an online voice or video call
 */
router.post('/initiate', (req: Request, res: Response): any => {
    try {
        const {
            callerId,
            callerName,
            callerAvatar,
            receiverId,
            receiverName,
            receiverAvatar,
            callType = 'voice',
        } = req.body;

        if (!callerId || !receiverId) {
            return res.status(400).json({ error: 'callerId and receiverId are required' });
        }

        // Check if receiver is already in a connected call
        for (const session of activeCalls.values()) {
            if (
                (session.receiverId === receiverId || session.callerId === receiverId) &&
                session.status === 'connected'
            ) {
                return res.status(409).json({ error: 'User is busy on another call', status: 'busy' });
            }
        }

        const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const session: CallSession = {
            id: callId,
            callerId,
            callerName: callerName || 'User',
            callerAvatar: callerAvatar || '',
            receiverId,
            receiverName: receiverName || 'User',
            receiverAvatar: receiverAvatar || '',
            callType: callType === 'video' ? 'video' : 'voice',
            status: 'ringing',
            createdAt: new Date().toISOString(),
        };

        activeCalls.set(callId, session);

        res.status(201).json({
            message: 'Call initiated successfully',
            call: session,
        });
    } catch (error: any) {
        console.error('Error initiating call:', error);
        res.status(500).json({ error: 'Failed to initiate call', message: error.message });
    }
});

/**
 * GET /api/calls/incoming/:userId
 * Check for incoming ringing calls for a user
 */
router.get('/incoming/:userId', (req: Request, res: Response): any => {
    try {
        const { userId } = req.params;
        const now = Date.now();

        for (const session of activeCalls.values()) {
            if (session.receiverId === userId && session.status === 'ringing') {
                const created = new Date(session.createdAt).getTime();
                if (now - created <= 45000) {
                    return res.json({ incomingCall: session });
                }
            }
        }

        res.json({ incomingCall: null });
    } catch (error: any) {
        console.error('Error checking incoming calls:', error);
        res.status(500).json({ error: 'Failed to check incoming calls' });
    }
});

/**
 * GET /api/calls/:callId/status
 * Get the latest status of a call session
 */
router.get('/:callId/status', (req: Request, res: Response): any => {
    try {
        const { callId } = req.params;
        const session = activeCalls.get(callId);

        if (!session) {
            // Check in history
            const historyItem = callHistory.find((c) => c.id === callId);
            if (historyItem) {
                return res.json({ call: historyItem });
            }
            return res.status(404).json({ error: 'Call session not found' });
        }

        res.json({ call: session });
    } catch (error: any) {
        console.error('Error getting call status:', error);
        res.status(500).json({ error: 'Failed to get call status' });
    }
});

/**
 * POST /api/calls/:callId/answer
 * Accept an incoming call
 */
router.post('/:callId/answer', (req: Request, res: Response): any => {
    try {
        const { callId } = req.params;
        const session = activeCalls.get(callId);

        if (!session) {
            return res.status(404).json({ error: 'Call session not found' });
        }

        session.status = 'connected';
        session.answeredAt = new Date().toISOString();
        activeCalls.set(callId, session);

        res.json({ message: 'Call connected', call: session });
    } catch (error: any) {
        console.error('Error answering call:', error);
        res.status(500).json({ error: 'Failed to answer call' });
    }
});

/**
 * POST /api/calls/:callId/reject
 * Reject an incoming call
 */
router.post('/:callId/reject', (req: Request, res: Response): any => {
    try {
        const { callId } = req.params;
        const session = activeCalls.get(callId);

        if (!session) {
            return res.status(404).json({ error: 'Call session not found' });
        }

        session.status = 'rejected';
        session.endedAt = new Date().toISOString();
        callHistory.unshift({ ...session });
        activeCalls.delete(callId);

        res.json({ message: 'Call rejected', call: session });
    } catch (error: any) {
        console.error('Error rejecting call:', error);
        res.status(500).json({ error: 'Failed to reject call' });
    }
});

/**
 * POST /api/calls/:callId/end
 * End an ongoing or ringing call
 */
router.post('/:callId/end', (req: Request, res: Response): any => {
    try {
        const { callId } = req.params;
        const { durationSeconds } = req.body;
        const session = activeCalls.get(callId);

        if (!session) {
            return res.json({ message: 'Call already ended' });
        }

        session.status = 'ended';
        session.endedAt = new Date().toISOString();
        if (durationSeconds !== undefined) {
            session.durationSeconds = durationSeconds;
        } else if (session.answeredAt) {
            session.durationSeconds = Math.floor(
                (new Date(session.endedAt).getTime() - new Date(session.answeredAt).getTime()) / 1000
            );
        }

        callHistory.unshift({ ...session });
        activeCalls.delete(callId);

        res.json({ message: 'Call ended successfully', call: session });
    } catch (error: any) {
        console.error('Error ending call:', error);
        res.status(500).json({ error: 'Failed to end call' });
    }
});

/**
 * GET /api/calls/history/:userId
 * Get user's call history
 */
router.get('/history/:userId', (req: Request, res: Response): any => {
    try {
        const { userId } = req.params;
        const userCalls = callHistory.filter(
            (c) => c.callerId === userId || c.receiverId === userId
        );
        res.json({ calls: userCalls.slice(0, 30) });
    } catch (error: any) {
        console.error('Error fetching call history:', error);
        res.status(500).json({ error: 'Failed to fetch call history' });
    }
});

export default router;
