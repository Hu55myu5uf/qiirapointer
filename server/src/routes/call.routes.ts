import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../config/firebase';
import { authenticateUser } from '../utils/authMiddleware';
import { getDisplayProfile } from '../utils/profiles';
import { writeLimiter } from '../utils/rateLimiter';
import { notifyIncomingCall } from '../utils/pushNotifications';
import { createNotification } from '../utils/notifications';

const router = Router();

/**
 * In-app calls.
 *
 * Call sessions live in Firestore (calls/{callId}) so the app can listen for incoming calls and
 * status changes in real time (security rules: only the caller and receiver can read a call), and
 * calls survive server restarts. Only the short-lived WebRTC signalling messages stay in memory.
 */
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

const RING_TIMEOUT_MS = 45_000;
const MAX_CALL_MS = 3 * 60 * 60 * 1000;        // calls are force-ended after 3 hours
const SIGNAL_TTL_MS = 10 * 60 * 1000;
const ROOM_TOKEN_TTL_MS = MAX_CALL_MS;
const SESSION_CACHE_MS = 3_000;                 // the call page polls signals ~1x/second

const calls = () => db.collection('calls');
const callSignals = new Map<string, { to: string; from: string; data: any; timestamp: number }[]>();
const sessionCache = new Map<string, { at: number; value: CallSession | null }>();

/** Test helper: clear in-memory call state. */
export function __resetCallState() {
    callSignals.clear();
    sessionCache.clear();
    turnCache = null;
}

async function getCall(callId: string, fresh = false): Promise<CallSession | null> {
    const hit = sessionCache.get(callId);
    if (!fresh && hit && Date.now() - hit.at < SESSION_CACHE_MS) return hit.value;
    const doc = await calls().doc(callId).get();
    const value = doc.exists ? ({ id: doc.id, ...(doc.data() as any) } as CallSession) : null;
    sessionCache.set(callId, { at: Date.now(), value });
    return value;
}

async function updateCall(callId: string, update: Partial<CallSession>) {
    await calls().doc(callId).set(update, { merge: true });
    sessionCache.delete(callId);
    if (update.status && ['rejected', 'ended', 'missed'].includes(update.status)) {
        callSignals.delete(callId);
        // Every finished call leaves an entry in the two people's chat (call history)
        const session = await getCall(callId, true);
        if (session) await recordCallInChat(session).catch(e => console.warn('Call log note:', e.message));
    }
}

const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** What a finished call looks like in the chat list and in the chat itself. */
export function callSummary(s: Pick<CallSession, 'callType' | 'status' | 'durationSeconds'>) {
    const icon = s.callType === 'video' ? '🎥' : '📞';
    const kind = s.callType === 'video' ? 'video call' : 'voice call';
    if (s.status === 'missed') return `${icon} Missed ${kind}`;
    if (s.status === 'rejected') return `${icon} Declined ${kind}`;
    const d = Number(s.durationSeconds) || 0;
    return `${icon} ${kind.charAt(0).toUpperCase()}${kind.slice(1)}${d > 0 ? ` · ${formatDuration(d)}` : ''}`;
}

/**
 * Write a "call" message into the caller/receiver conversation. The message id is derived from
 * the call id, so a call can never be logged twice.
 */
async function recordCallInChat(s: CallSession) {
    if (!['ended', 'missed', 'rejected'].includes(s.status)) return;
    const [a, b] = [s.callerId, s.receiverId].sort();
    const convId = `${a}_${b}`;
    const at = s.endedAt || new Date().toISOString();
    const text = callSummary(s);
    const convRef = db.collection('conversations').doc(convId);
    const msgRef = convRef.collection('messages').doc(`call_${s.id}`);

    const [caller, receiver] = await Promise.all([getDisplayProfile(s.callerId), getDisplayProfile(s.receiverId)]);
    const batch = db.batch();
    batch.set(convRef, {
        id: convId,
        participants: [s.callerId, s.receiverId].sort(),
        participantNames: { [s.callerId]: caller.name, [s.receiverId]: receiver.name },
        participantImages: { [s.callerId]: caller.avatar, [s.receiverId]: receiver.avatar },
        lastMessage: text,
        lastMessageAt: at,
        lastSenderId: s.callerId,
        updatedAt: at,
    }, { merge: true });
    batch.set(msgRef, {
        senderId: s.callerId,
        receiverId: s.receiverId,
        text,
        createdAt: at,
        messageType: 'call',
        callData: {
            callId: s.id,
            callType: s.callType,
            status: s.status,
            durationSeconds: Number(s.durationSeconds) || 0,
        },
    });
    await batch.commit();

    // A missed call also goes on the receiver's Notifications page (one per call)
    if (s.status === 'missed') {
        await createNotification(s.receiverId, {
            type: 'missed_call',
            title: `Missed ${s.callType === 'video' ? 'video' : 'voice'} call`,
            body: `${caller.name} tried to call you.`,
            actorId: s.callerId,
            actorName: caller.name,
            actorAvatar: caller.avatar || null,
            data: { callId: s.id, callType: s.callType, otherUserId: s.callerId },
        }, `call_${s.id}`);
    }
}

const isActive = (s: CallSession) => s.status === 'ringing' || s.status === 'connected';
const isParticipant = (s: CallSession, uid: string) => s.callerId === uid || s.receiverId === uid;
const otherParty = (s: CallSession, uid: string) => (s.callerId === uid ? s.receiverId : s.callerId);

/** Ringing calls that nobody answered become "missed"; very long calls are ended. */
async function expireStaleCalls() {
    const now = Date.now();
    for (const status of ['ringing', 'connected'] as const) {
        const snap = await calls().where('status', '==', status).limit(200).get();
        for (const d of snap.docs) {
            const s = d.data() as CallSession;
            const age = now - new Date(s.createdAt).getTime();
            if (status === 'ringing' && age > RING_TIMEOUT_MS) {
                await updateCall(d.id, { status: 'missed', endedAt: new Date().toISOString() });
            } else if (status === 'connected' && age > MAX_CALL_MS) {
                await updateCall(d.id, { status: 'ended', endedAt: new Date().toISOString() });
            }
        }
    }
    for (const [id, list] of callSignals) {
        const fresh = list.filter(s => now - s.timestamp < SIGNAL_TTL_MS);
        if (fresh.length === 0) callSignals.delete(id); else callSignals.set(id, fresh);
    }
}
if (process.env.NODE_ENV !== 'test') {
    setInterval(() => { expireStaleCalls().catch(e => console.warn('Call cleanup note:', e.message)); }, 15_000).unref();
}

/** Is this user already ringing or on a call? (equality queries only: no composite index needed) */
async function isBusy(uid: string): Promise<boolean> {
    const [asCaller, asReceiver] = await Promise.all([
        calls().where('callerId', '==', uid).limit(50).get(),
        calls().where('receiverId', '==', uid).limit(50).get(),
    ]);
    const now = Date.now();
    return [...asCaller.docs, ...asReceiver.docs].some(d => {
        const s = d.data() as CallSession;
        if (s.status === 'connected') return now - new Date(s.createdAt).getTime() < MAX_CALL_MS;
        if (s.status === 'ringing') return now - new Date(s.createdAt).getTime() < RING_TIMEOUT_MS;
        return false;
    });
}

// ─── Room tokens ────────────────────────────────────────────────────────────
// The call screen is a WebView page that can't carry the user's Firebase session, so it gets a
// short-lived HMAC-signed token bound to (callId, uid). Set CALL_TOKEN_SECRET in production; without
// it a random per-process secret is used (tokens then stop working after a restart).
const ROOM_SECRET = process.env.CALL_TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

export function createRoomToken(callId: string, uid: string, now = Date.now()) {
    const exp = now + ROOM_TOKEN_TTL_MS;
    const payload = Buffer.from(JSON.stringify({ c: callId, u: uid, e: exp })).toString('base64url');
    const sig = crypto.createHmac('sha256', ROOM_SECRET).update(payload).digest('base64url');
    return `${payload}.${sig}`;
}

export function verifyRoomToken(token: unknown): { callId: string; uid: string } | null {
    if (typeof token !== 'string' || !token.includes('.')) return null;
    const [payload, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', ROOM_SECRET).update(payload).digest('base64url');
    const a = Buffer.from(sig || '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (typeof data.e !== 'number' || data.e < Date.now()) return null;
        return { callId: String(data.c), uid: String(data.u) };
    } catch {
        return null;
    }
}

// ─── ICE (STUN/TURN) servers ────────────────────────────────────────────────
// Two phones on different networks (Wi-Fi ↔ mobile data) usually can't reach each other
// directly; a TURN relay carries the call between them. Sources, in order:
//   1. Cloudflare TURN (CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN): short-lived
//      credentials generated per call, so no permanent password reaches the phone.
//   2. ICE_SERVERS_JSON: a fixed list, e.g. [{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]
//   3. Public STUN only (calls on the same kind of network).
type IceServer = { urls: string | string[]; username?: string; credential?: string };

const STUN_ONLY: IceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];
const TURN_TTL_SECONDS = 4 * 60 * 60;
let turnCache: { servers: IceServer[]; until: number } | null = null;

function staticIceServers(): IceServer[] | null {
    if (!process.env.ICE_SERVERS_JSON) return null;
    try {
        const parsed = JSON.parse(process.env.ICE_SERVERS_JSON);
        return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch {
        console.warn('ICE_SERVERS_JSON is not valid JSON; ignoring it');
        return null;
    }
}

async function cloudflareIceServers(): Promise<IceServer[] | null> {
    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
    const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
    if (!keyId || !apiToken) return null;
    if (turnCache && turnCache.until > Date.now()) return turnCache.servers;
    try {
        const res = await fetch(
            `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
                signal: AbortSignal.timeout(5000),
            },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body: any = await res.json();
        const raw: any[] = Array.isArray(body?.iceServers) ? body.iceServers : body?.iceServers ? [body.iceServers] : [];
        // Port 53 addresses are slow or blocked in browsers/WebViews (Cloudflare's own advice)
        const servers: { urls: string[]; username?: string; credential?: string }[] = raw
            .map(s => ({
                ...s,
                urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u: string) => typeof u === 'string' && !/:53(\?|$)/.test(u)),
            }))
            .filter(s => s.urls.length > 0);
        if (!servers.some(s => s.urls.some((u: string) => u.startsWith('turn')))) throw new Error('no TURN servers returned');
        // Reuse for half the credential lifetime, so a call never starts with nearly-expired ones
        turnCache = { servers, until: Date.now() + (TURN_TTL_SECONDS * 1000) / 2 };
        return servers;
    } catch (e: any) {
        console.warn('Cloudflare TURN credentials unavailable:', e?.message);
        return null;
    }
}

export async function getIceServers(): Promise<IceServer[]> {
    const relay = (await cloudflareIceServers()) || staticIceServers();
    // Keep public STUN alongside the relay: a direct path is used when one exists
    return relay ? [...STUN_ONLY, ...relay] : STUN_ONLY;
}

export function relayConfigured(): boolean {
    return Boolean((process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN) || staticIceServers());
}

if (process.env.NODE_ENV !== 'test') {
    console.log(relayConfigured()
        ? 'Calls: TURN relay configured (Wi-Fi ↔ mobile data calls supported)'
        : 'Calls: no TURN relay configured — calls between different networks may fail');
}

/**
 * Identify the signalling party: a logged-in user (Bearer token) or the call WebView
 * (X-Call-Token room token, valid for that one call only).
 */
async function signalAuth(req: Request, res: Response, next: NextFunction) {
    const roomToken = req.get('X-Call-Token');
    if (roomToken) {
        const t = verifyRoomToken(roomToken);
        if (!t || t.callId !== req.params.callId) {
            return res.status(401).json({ error: 'Invalid or expired call token' });
        }
        (req as any).callUid = t.uid;
        return next();
    }
    return authenticateUser(req, res, () => {
        (req as any).callUid = req.user!.uid;
        next();
    });
}

/**
 * POST /api/calls/initiate — the caller is always the logged-in user
 */
router.post('/initiate', authenticateUser, writeLimiter, async (req: Request, res: Response): Promise<any> => {
    try {
        const callerId = req.user!.uid;
        const { receiverId, callType = 'voice' } = req.body;

        if (!receiverId || typeof receiverId !== 'string') {
            return res.status(400).json({ error: 'receiverId is required' });
        }
        if (receiverId === callerId) {
            return res.status(400).json({ error: 'You cannot call yourself' });
        }

        const [caller, receiver] = await Promise.all([getDisplayProfile(callerId), getDisplayProfile(receiverId)]);
        if (!receiver.exists || receiver.role === 'support') {
            return res.status(404).json({ error: 'User not found' });
        }
        if (receiver.blockedUserIds.includes(callerId) || caller.blockedUserIds.includes(receiverId)) {
            return res.status(403).json({ error: 'You cannot call this user' });
        }
        if (await isBusy(receiverId)) {
            return res.status(409).json({ error: 'User is busy on another call', status: 'busy' });
        }

        const callId = `call_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
        const session: CallSession = {
            id: callId,
            callerId,
            callerName: caller.name,
            callerAvatar: caller.avatar,
            receiverId,
            receiverName: receiver.name,
            receiverAvatar: receiver.avatar,
            callType: callType === 'video' ? 'video' : 'voice',
            status: 'ringing',
            createdAt: new Date().toISOString(),
        };
        await calls().doc(callId).set(session);

        // Ring the receiver even when the app is closed (background, best effort)
        notifyIncomingCall(receiverId, session.callerName, session.callType, callId).catch(() => {});

        res.status(201).json({ message: 'Call initiated successfully', call: session });
    } catch (error: any) {
        console.error('Error initiating call:', error);
        res.status(500).json({ error: 'Failed to initiate call' });
    }
});

/**
 * GET /api/calls/incoming/:userId — fallback for apps without the live listener
 */
router.get('/incoming/:userId', authenticateUser, async (req: Request, res: Response): Promise<any> => {
    try {
        if (req.params.userId !== req.user!.uid) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const snap = await calls().where('receiverId', '==', req.user!.uid).limit(20).get();
        const now = Date.now();
        const incoming = snap.docs
            .map(d => ({ id: d.id, ...(d.data() as any) }) as CallSession)
            .filter(s => s.status === 'ringing' && now - new Date(s.createdAt).getTime() <= RING_TIMEOUT_MS)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
        res.json({ incomingCall: incoming });
    } catch (error: any) {
        console.error('Incoming call check error:', error);
        res.status(500).json({ error: 'Failed to check incoming calls' });
    }
});

/**
 * GET /api/calls/history — the signed-in user's own recent calls (newest first)
 */
router.get('/history', authenticateUser, async (req: Request, res: Response): Promise<any> => {
    try {
        const uid = req.user!.uid;
        // Two equality queries (no composite index needed), merged and sorted here
        const [out, inc] = await Promise.all([
            calls().where('callerId', '==', uid).limit(200).get(),
            calls().where('receiverId', '==', uid).limit(200).get(),
        ]);
        const sessions = [...out.docs, ...inc.docs]
            .map(d => ({ id: d.id, ...(d.data() as any) }) as CallSession)
            .filter(s => !isActive(s))
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
            .slice(0, 100);

        const calls_ = await Promise.all(sessions.map(async s => {
            const outgoing = s.callerId === uid;
            const otherId = outgoing ? s.receiverId : s.callerId;
            const other = await getDisplayProfile(otherId);
            return {
                id: s.id,
                callType: s.callType,
                status: s.status,
                direction: outgoing ? 'outgoing' : 'incoming',
                // Missed from this user's point of view: someone called them and they didn't answer
                missed: !outgoing && s.status === 'missed',
                durationSeconds: Number(s.durationSeconds) || 0,
                createdAt: s.createdAt,
                endedAt: s.endedAt || null,
                summary: callSummary(s),
                otherUser: { id: otherId, name: other.name, avatar: other.avatar, isVerified: other.isVerified },
            };
        }));
        res.json({ calls: calls_ });
    } catch (error: any) {
        console.error('Call history error:', error);
        res.status(500).json({ error: 'Failed to load call history' });
    }
});

/**
 * GET /api/calls/:callId/status
 */
router.get('/:callId/status', authenticateUser, async (req: Request, res: Response): Promise<any> => {
    const session = await getCall(req.params.callId);
    if (!session || !isParticipant(session, req.user!.uid)) {
        return res.status(404).json({ error: 'Call session not found' });
    }
    res.json({ call: session });
});

/**
 * GET /api/calls/:callId/room-token — participants of an active call only
 */
router.get('/:callId/room-token', authenticateUser, async (req: Request, res: Response): Promise<any> => {
    const session = await getCall(req.params.callId, true);
    if (!session || !isParticipant(session, req.user!.uid) || !isActive(session)) {
        return res.status(404).json({ error: 'Call session not found' });
    }
    res.json({ roomToken: createRoomToken(session.id, req.user!.uid) });
});

/**
 * POST /api/calls/:callId/answer — receiver only
 */
router.post('/:callId/answer', authenticateUser, async (req: Request, res: Response): Promise<any> => {
    try {
        const ref = calls().doc(req.params.callId);
        const outcome = await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            if (!snap.exists) return { code: 404 };
            const s = { id: snap.id, ...(snap.data() as any) } as CallSession;
            if (!isParticipant(s, req.user!.uid)) return { code: 404 };
            if (s.receiverId !== req.user!.uid) return { code: 403 };
            if (s.status !== 'ringing') return { code: 409, status: s.status };
            const answeredAt = new Date().toISOString();
            tx.update(ref, { status: 'connected', answeredAt });
            return { code: 200, call: { ...s, status: 'connected', answeredAt } };
        });
        sessionCache.delete(req.params.callId);
        if (outcome.code === 404) return res.status(404).json({ error: 'Call session not found' });
        if (outcome.code === 403) return res.status(403).json({ error: 'Only the person being called can answer' });
        if (outcome.code === 409) return res.status(409).json({ error: `Call is ${outcome.status}` });
        res.json({ message: 'Call connected', call: outcome.call });
    } catch (error: any) {
        console.error('Answer call error:', error);
        res.status(500).json({ error: 'Failed to answer call' });
    }
});

/**
 * POST /api/calls/:callId/reject — receiver only
 */
router.post('/:callId/reject', authenticateUser, async (req: Request, res: Response): Promise<any> => {
    try {
        const session = await getCall(req.params.callId, true);
        if (!session || !isParticipant(session, req.user!.uid)) {
            return res.status(404).json({ error: 'Call session not found' });
        }
        if (session.receiverId !== req.user!.uid) {
            return res.status(403).json({ error: 'Only the person being called can reject' });
        }
        if (!isActive(session)) return res.json({ message: `Call already ${session.status}`, call: session });
        const update = { status: 'rejected' as const, endedAt: new Date().toISOString() };
        await updateCall(session.id, update);
        res.json({ message: 'Call rejected', call: { ...session, ...update } });
    } catch (error: any) {
        console.error('Reject call error:', error);
        res.status(500).json({ error: 'Failed to reject call' });
    }
});

/**
 * POST /api/calls/:callId/end — either participant
 */
router.post('/:callId/end', authenticateUser, async (req: Request, res: Response): Promise<any> => {
    try {
        const session = await getCall(req.params.callId, true);
        if (!session || !isParticipant(session, req.user!.uid)) {
            return res.status(404).json({ error: 'Call session not found' });
        }
        if (!isActive(session)) return res.json({ message: 'Call already ended', call: session });

        const endedAt = new Date().toISOString();
        // Duration is computed by the server, never trusted from the client
        const durationSeconds = session.answeredAt
            ? Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(session.answeredAt).getTime()) / 1000))
            : 0;
        // A caller hanging up before an answer is a missed call for the receiver
        const status = session.status === 'ringing' ? 'missed' : 'ended';
        await updateCall(session.id, { status, endedAt, durationSeconds });
        res.json({ message: 'Call ended successfully', call: { ...session, status, endedAt, durationSeconds } });
    } catch (error: any) {
        console.error('End call error:', error);
        res.status(500).json({ error: 'Failed to end call' });
    }
});

/**
 * POST /api/calls/:callId/signal — WebRTC offer/answer/ICE candidate for the other participant
 */
router.post('/:callId/signal', signalAuth, async (req: Request, res: Response): Promise<any> => {
    const uid: string = (req as any).callUid;
    const session = await getCall(req.params.callId);
    if (!session || !isParticipant(session, uid) || !isActive(session)) {
        return res.status(404).json({ error: 'Call session not found' });
    }
    const { data } = req.body || {};
    if (!data || typeof data !== 'object' || !['offer', 'answer', 'candidate', 'ready', 'restart'].includes(data.type)) {
        return res.status(400).json({ error: 'Invalid signal' });
    }
    if (JSON.stringify(data).length > 20_000) {
        return res.status(413).json({ error: 'Signal too large' });
    }

    const signals = callSignals.get(session.id) || [];
    // Sender and recipient are derived from the session, never from the request body
    signals.push({ from: uid, to: otherParty(session, uid), data, timestamp: Date.now() });
    // Keep the queue bounded by dropping the oldest ICE candidates first: losing the offer or
    // answer (e.g. while the other person is still picking up) would make the call unconnectable.
    while (signals.length > 100) {
        const i = signals.findIndex(x => x.data?.type === 'candidate');
        signals.splice(i >= 0 ? i : 0, 1);
    }
    callSignals.set(session.id, signals);
    res.json({ success: true });
});

/**
 * GET /api/calls/:callId/signal/:userId — pending signals for the authenticated participant
 */
router.get('/:callId/signal/:userId', signalAuth, async (req: Request, res: Response): Promise<any> => {
    const uid: string = (req as any).callUid;
    if (req.params.userId !== uid) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const session = await getCall(req.params.callId);
    if (!session || !isParticipant(session, uid)) {
        return res.status(404).json({ error: 'Call session not found' });
    }
    const signals = callSignals.get(session.id) || [];
    const pending = signals.filter(s => s.to === uid).map(s => s.data);
    callSignals.set(session.id, signals.filter(s => s.to !== uid));
    res.json({ signals: pending, status: session.status });
});

router.get('/room/:callId', async (req: Request, res: Response): Promise<any> => {
    const { callId } = req.params;
    const { type = 'voice', token } = req.query;

    // The room only opens with a valid token for THIS call; who you are comes from the token
    const t = verifyRoomToken(token);
    const session = await getCall(callId);
    if (!t || t.callId !== callId || !session || !isParticipant(session, t.uid) || !isActive(session)) {
        res.status(403).setHeader('Content-Type', 'text/plain');
        return res.send('This call link is invalid or has expired.');
    }

    // Values are embedded via JSON with "<" escaped, so nothing can break out of the <script>
    const embed = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
    const isVideo = type === 'video';
    const roomConfig = embed({
        callId: session.id,
        userId: t.uid,
        targetId: otherParty(session, t.uid),
        token: String(token),
        isVideo,
        iceServers: await getIceServers(),
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, maximum-scale=1.0">
    <title>Pointer Live Call</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
        body {
            background-color: #0D0E12;
            color: #FFFFFF;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            width: 100vw;
            height: 100vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            position: relative;
        }
        #remoteVideo {
            width: 100%;
            height: 100%;
            object-fit: cover;
            position: absolute;
            top: 0;
            left: 0;
            background: #13141B;
            display: ${isVideo ? 'block' : 'none'};
        }
        #localVideo {
            position: absolute;
            bottom: 140px;
            right: 16px;
            width: 100px;
            height: 140px;
            border-radius: 12px;
            border: 2px solid #B28A45;
            object-fit: cover;
            z-index: 10;
            background: #20222B;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            display: ${isVideo ? 'block' : 'none'};
            transform: scaleX(-1);
        }
        .voice-container {
            display: ${isVideo ? 'none' : 'flex'};
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 5;
            width: 100%;
            height: 100%;
        }
        .sound-wave {
            display: flex;
            align-items: center;
            gap: 6px;
            height: 60px;
            margin-top: 30px;
        }
        .wave-bar {
            width: 5px;
            background: #B28A45;
            border-radius: 3px;
            transition: height 0.08s ease;
            height: 8px;
        }
        .status-pill {
            margin-top: 15px;
            background: rgba(178, 138, 69, 0.15);
            border: 1px solid rgba(178, 138, 69, 0.4);
            color: #E2B96B;
            font-size: 13px;
            font-weight: 600;
            padding: 6px 14px;
            border-radius: 20px;
        }
        #audioElement { display: none; }
    </style>
</head>
<body>
    <audio id="audioElement" autoplay playsinline></audio>
    <video id="remoteVideo" autoplay playsinline></video>
    <video id="localVideo" autoplay playsinline muted></video>

    <div class="voice-container" id="voiceUi">
        <div class="sound-wave">
            <div class="wave-bar" id="bar1"></div>
            <div class="wave-bar" id="bar2"></div>
            <div class="wave-bar" id="bar3"></div>
            <div class="wave-bar" id="bar4"></div>
            <div class="wave-bar" id="bar5"></div>
            <div class="wave-bar" id="bar6"></div>
            <div class="wave-bar" id="bar7"></div>
        </div>
        <div class="status-pill" id="statusPill">Connecting Audio...</div>
    </div>

    <script>
        const ROOM = ${roomConfig};
        const CALL_ID = ROOM.callId;
        const USER_ID = ROOM.userId;
        const TARGET_ID = ROOM.targetId;
        const IS_VIDEO = ROOM.isVideo;
        const API_BASE = window.location.origin + '/api';
        const AUTH_HEADERS = { 'X-Call-Token': ROOM.token };

        const remoteVideo = document.getElementById('remoteVideo');
        const localVideo = document.getElementById('localVideo');
        const audioElement = document.getElementById('audioElement');
        const statusPill = document.getElementById('statusPill');

        let localStream = null;
        let peerConnection = null;
        let isInitiator = false;
        let pollTimer = null;
        let audioContext = null;
        let analyser = null;
        let isMuted = false;
        let isVideoOff = !IS_VIDEO;
        let facingMode = 'user';
        let recoveryTimer = null;
        let recoveryAttempts = 0;

        const configuration = { iceServers: ROOM.iceServers };

        function postToNative(type, payload = {}) {
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
            }
        }

        async function init() {
            try {
                // Request user media
                const constraints = {
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                    video: IS_VIDEO ? { facingMode: facingMode, width: { ideal: 720 }, height: { ideal: 1280 } } : false
                };

                try {
                    localStream = await navigator.mediaDevices.getUserMedia(constraints);
                } catch (mediaErr) {
                    if (!IS_VIDEO) throw mediaErr;
                    // Camera unavailable or refused: carry on with sound only
                    postToNative('MEDIA_ERROR', { error: 'camera: ' + (mediaErr && mediaErr.message) });
                    localStream = await navigator.mediaDevices.getUserMedia({ audio: constraints.audio, video: false });
                }
                if (IS_VIDEO && localVideo) {
                    localVideo.srcObject = localStream;
                }

                setupAudioVisualizer(localStream);
                statusPill.textContent = 'Audio Connected';
                postToNative('LOCAL_MEDIA_READY');

                createPeerConnection();

                // Determine if initiator by user ID sorting
                isInitiator = USER_ID < TARGET_ID;

                // Tell the other side this page is new (e.g. reloaded when switching to video), so it
                // starts a fresh connection with us instead of talking to the old page.
                await sendSignal({ type: 'ready' });
                if (isInitiator) {
                    await makeOffer(false);
                }

                startSignalPolling();
            } catch (err) {
                console.error('Media init error:', err);
                statusPill.textContent = 'Active Call';
                postToNative('MEDIA_ERROR', { error: err.message });
            }
        }

        function createPeerConnection() {
            peerConnection = new RTCPeerConnection(configuration);

            // Add local tracks
            if (localStream) {
                localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, localStream);
                });
            }

            // Handle remote track
            peerConnection.ontrack = (event) => {
                const stream = event.streams[0] || new MediaStream([event.track]);
                if (audioElement) {
                    audioElement.srcObject = stream;
                    audioElement.play().catch(() => {});
                }
                if (IS_VIDEO && remoteVideo) {
                    remoteVideo.muted = true;
                    remoteVideo.srcObject = stream;
                    remoteVideo.play().catch(() => {});
                    remoteVideo.onresize = fitRemoteVideo;
                    remoteVideo.onloadedmetadata = fitRemoteVideo;
                }
                statusPill.textContent = 'Connected • Clear Audio';
                postToNative('REMOTE_CONNECTED');
            };

            // Handle ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    sendSignal({ type: 'candidate', candidate: event.candidate });
                }
            };

            const pc = peerConnection;
            pc.onconnectionstatechange = () => {
                if (pc !== peerConnection) return; // an old connection that was replaced
                const state = pc.connectionState;
                if (state === 'connected') {
                    statusPill.textContent = 'Connected • HD Audio';
                    recoveryAttempts = 0;
                    if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = null; }
                    postToNative('PEER_CONNECTED');
                } else if (state === 'disconnected' || state === 'failed') {
                    statusPill.textContent = 'Reconnecting...';
                    postToNative('RECONNECTING');
                    // 'disconnected' often heals by itself (network switch); give it a moment
                    scheduleRecovery(state === 'failed' ? 500 : 3000);
                }
            };
        }

        // Either side can trigger recovery: the initiator restarts ICE itself, the other side asks
        // the initiator to. Retries while the link stays down.
        function scheduleRecovery(delay) {
            if (recoveryTimer || !polling) return;
            recoveryTimer = setTimeout(() => {
                recoveryTimer = null;
                if (!peerConnection || !polling) return;
                const st = peerConnection.connectionState;
                if (st === 'connected' || st === 'closed') return;
                recoveryAttempts++;
                if (recoveryAttempts > 6) { statusPill.textContent = 'Connection lost'; postToNative('CONNECTION_LOST'); return; }
                if (isInitiator) makeOffer(true); else sendSignal({ type: 'restart' });
                scheduleRecovery(6000);
            }, delay);
        }

        async function makeOffer(iceRestart) {
            if (!peerConnection) return;
            try {
                if (peerConnection.signalingState !== 'stable' && !iceRestart) return;
                const offer = await peerConnection.createOffer(iceRestart ? { iceRestart: true } : undefined);
                await peerConnection.setLocalDescription(offer);
                await sendSignal({ type: 'offer', sdp: offer });
            } catch (e) {
                console.warn('Offer note:', e);
            }
        }

        // Fill the screen with the other person's video, unless the picture's shape differs a lot
        // from the screen's (e.g. their phone is sideways): then show it whole instead of a close-up.
        function fitRemoteVideo() {
            if (!remoteVideo || !remoteVideo.videoWidth) return;
            const videoPortrait = remoteVideo.videoHeight >= remoteVideo.videoWidth;
            const screenPortrait = window.innerHeight >= window.innerWidth;
            remoteVideo.style.objectFit = videoPortrait === screenPortrait ? 'cover' : 'contain';
        }
        window.addEventListener('resize', fitRemoteVideo);

        // Start over with a brand-new connection (the other side's page was reloaded)
        function resetPeerConnection() {
            try { if (peerConnection) peerConnection.close(); } catch (_) {}
            pendingCandidates = [];
            createPeerConnection();
        }

        async function sendSignal(data) {
            try {
                await fetch(API_BASE + '/calls/' + encodeURIComponent(CALL_ID) + '/signal', {
                    method: 'POST',
                    headers: Object.assign({ 'Content-Type': 'application/json' }, AUTH_HEADERS),
                    body: JSON.stringify({ data })
                });
            } catch (e) {
                console.warn('Send signal note:', e);
            }
        }

        // Signals must be applied in the order they were sent (offer/answer before their ICE
        // candidates), so batches are fetched one at a time and handled sequentially.
        let polling = true;
        function startSignalPolling() {
            const tick = async () => {
                if (!polling) return;
                try {
                    const res = await fetch(API_BASE + '/calls/' + encodeURIComponent(CALL_ID) + '/signal/' + encodeURIComponent(USER_ID), { headers: AUTH_HEADERS });
                    if (res.status === 401 || res.status === 404) { polling = false; return; }
                    const json = await res.json();
                    for (const sig of (json.signals || [])) {
                        await handleSignal(sig);
                    }
                    if (json.status && ['ended', 'rejected', 'missed'].includes(json.status)) { polling = false; return; }
                } catch (e) {}
                pollTimer = setTimeout(tick, 700);
            };
            tick();
        }

        function restartConnection() { return makeOffer(true); }

        let pendingCandidates = [];
        async function flushCandidates() {
            const list = pendingCandidates;
            pendingCandidates = [];
            for (const c of list) {
                try { await peerConnection.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { console.warn('Candidate note:', e); }
            }
        }

        async function handleSignal(sig) {
            if (!peerConnection) return;
            try {
                if (sig.type === 'ready') {
                    // The other page is new. If we were already talking to an older page of theirs,
                    // drop that connection and connect to the new one.
                    if (peerConnection.remoteDescription) {
                        resetPeerConnection();
                        if (isInitiator) await makeOffer(false);
                    }
                    return;
                }
                if (sig.type === 'restart') {
                    if (isInitiator) await makeOffer(true);
                    return;
                }
                if (sig.type === 'offer') {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(sig.sdp));
                    await flushCandidates();
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    sendSignal({ type: 'answer', sdp: answer });
                } else if (sig.type === 'answer') {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(sig.sdp));
                    await flushCandidates();
                } else if (sig.type === 'candidate' && sig.candidate) {
                    if (!peerConnection.remoteDescription) {
                        pendingCandidates.push(sig.candidate);
                    } else {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(sig.candidate));
                    }
                }
            } catch (err) {
                console.warn('Handle signal note:', err);
            }
        }

        function setupAudioVisualizer(stream) {
            try {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextClass) return;
                audioContext = new AudioContextClass();
                const source = audioContext.createMediaStreamSource(stream);
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 32;
                source.connect(analyser);

                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                const bars = [
                    document.getElementById('bar1'),
                    document.getElementById('bar2'),
                    document.getElementById('bar3'),
                    document.getElementById('bar4'),
                    document.getElementById('bar5'),
                    document.getElementById('bar6'),
                    document.getElementById('bar7')
                ];

                function updateBars() {
                    if (!analyser || isMuted) {
                        bars.forEach(b => { if (b) b.style.height = '6px'; });
                        requestAnimationFrame(updateBars);
                        return;
                    }
                    analyser.getByteFrequencyData(dataArray);
                    bars.forEach((b, idx) => {
                        if (b) {
                            const val = dataArray[idx % dataArray.length] || 0;
                            const h = Math.max(6, Math.min(50, Math.floor((val / 255) * 48) + 6));
                            b.style.height = h + 'px';
                        }
                    });
                    requestAnimationFrame(updateBars);
                }
                updateBars();
            } catch (_) {}
        }

        // Native control message listener
        window.addEventListener('message', (event) => {
            let data = event.data;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch (_) {}
            }
            if (!data || !data.action) return;

            if (data.action === 'LAYOUT') {
                // Keep the self-view clear of the app's top bar and control bar
                if (localVideo && typeof data.bottom === 'number') localVideo.style.bottom = Math.max(0, Math.min(600, data.bottom)) + 'px';
                if (localVideo && typeof data.top === 'number') localVideo.style.top = 'auto';
                return;
            }
            if (data.action === 'TOGGLE_MUTE') {
                if (localStream) {
                    const audioTracks = localStream.getAudioTracks();
                    audioTracks.forEach(t => t.enabled = !t.enabled);
                    isMuted = !audioTracks[0]?.enabled;
                }
            } else if (data.action === 'TOGGLE_VIDEO') {
                if (localStream) {
                    const videoTracks = localStream.getVideoTracks();
                    videoTracks.forEach(t => t.enabled = !t.enabled);
                }
            } else if (data.action === 'SWITCH_CAMERA') {
                facingMode = (facingMode === 'user') ? 'environment' : 'user';
                if (localStream && IS_VIDEO) {
                    localStream.getVideoTracks().forEach(t => t.stop());
                    navigator.mediaDevices.getUserMedia({
                        video: { facingMode: facingMode, width: { ideal: 720 }, height: { ideal: 1280 } }
                    }).then(newStream => {
                        const newTrack = newStream.getVideoTracks()[0];
                        if (localVideo) {
                            localVideo.srcObject = newStream;
                            // A mirror image only makes sense for the front camera
                            localVideo.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'none';
                        }
                        // keep the new camera's track in localStream so mute/video toggles reach it
                        if (localStream) {
                            localStream.getVideoTracks().forEach(t => localStream.removeTrack(t));
                            localStream.addTrack(newTrack);
                        }
                        if (peerConnection) {
                            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                            if (sender) sender.replaceTrack(newTrack);
                        }
                    }).catch(() => {});
                }
            } else if (data.action === 'END_CALL') {
                if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = null; }
                if (localStream) localStream.getTracks().forEach(t => t.stop());
                if (peerConnection) peerConnection.close();
                polling = false;
                if (pollTimer) clearTimeout(pollTimer);
            }
        });

        window.onload = init;
    </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    // The page may only run its own inline script and talk to this server
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; media-src 'self' blob: mediastream:; img-src 'self' data:");
    res.send(html);
});

export default router;
