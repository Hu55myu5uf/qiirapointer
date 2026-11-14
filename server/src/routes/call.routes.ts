import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../config/firebase';
import { authenticateUser } from '../utils/authMiddleware';
import { writeLimiter } from '../utils/rateLimiter';

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

const RING_TIMEOUT_MS = 45_000;
const HISTORY_TTL_MS = 60 * 60 * 1000;      // finished calls are kept 1 hour for status lookups
const HISTORY_MAX = 500;
const SIGNAL_TTL_MS = 10 * 60 * 1000;
const ROOM_TOKEN_TTL_MS = 3 * 60 * 60 * 1000; // a room link works for at most 3 hours

// In-memory call state. (A single server instance is assumed; Phase 3 moves calls to Firestore
// real-time documents so state survives restarts and multiple instances.)
const activeCalls: Map<string, CallSession> = new Map();
const callHistory: Map<string, CallSession & { archivedAt: number }> = new Map();
const callSignals = new Map<string, { to: string; from: string; data: any; timestamp: number }[]>();

/** Test helper: clear all in-memory call state. */
export function __resetCallState() {
    activeCalls.clear();
    callHistory.clear();
    callSignals.clear();
}

function archive(session: CallSession) {
    callHistory.set(session.id, { ...session, archivedAt: Date.now() });
    activeCalls.delete(session.id);
    callSignals.delete(session.id);
}

const cleanup = setInterval(() => {
    const now = Date.now();
    for (const session of activeCalls.values()) {
        const created = new Date(session.createdAt).getTime();
        if (session.status === 'ringing' && now - created > RING_TIMEOUT_MS) {
            session.status = 'missed';
            session.endedAt = new Date().toISOString();
            archive(session);
        } else if (session.status === 'connected' && now - created > ROOM_TOKEN_TTL_MS) {
            session.status = 'ended';
            session.endedAt = new Date().toISOString();
            archive(session);
        }
    }
    for (const [id, h] of callHistory) {
        if (now - h.archivedAt > HISTORY_TTL_MS) callHistory.delete(id);
    }
    while (callHistory.size > HISTORY_MAX) {
        callHistory.delete(callHistory.keys().next().value as string);
    }
    for (const [id, list] of callSignals) {
        const fresh = list.filter(s => now - s.timestamp < SIGNAL_TTL_MS);
        if (fresh.length === 0) callSignals.delete(id); else callSignals.set(id, fresh);
    }
}, 5000);
cleanup.unref();

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
// ICE_SERVERS_JSON example: [{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]
function getIceServers() {
    const fallback = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ];
    if (!process.env.ICE_SERVERS_JSON) return fallback;
    try {
        const parsed = JSON.parse(process.env.ICE_SERVERS_JSON);
        return Array.isArray(parsed) && parsed.length ? parsed : fallback;
    } catch {
        console.warn('ICE_SERVERS_JSON is not valid JSON; using STUN only');
        return fallback;
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function findCall(callId: string): CallSession | undefined {
    return activeCalls.get(callId) || callHistory.get(callId);
}

const isParticipant = (s: CallSession, uid: string) => s.callerId === uid || s.receiverId === uid;
const otherParty = (s: CallSession, uid: string) => (s.callerId === uid ? s.receiverId : s.callerId);

async function getDisplayInfo(uid: string) {
    try {
        const [u, v] = await Promise.all([
            db.collection('users').doc(uid).get(),
            db.collection('vendors').doc(uid).get(),
        ]);
        if (!u.exists) return null;
        const ud = u.data() || {};
        const vd = v.exists ? v.data() || {} : {};
        return {
            name: vd.businessName || ud.fullName || ud.displayName || 'User',
            avatar: vd.businessImage || ud.profileImage || ud.photoURL || '',
            blocked: (ud.blockedUserIds || []) as string[],
        };
    } catch {
        return null;
    }
}

/**
 * Identify the signalling party: either a logged-in user (Bearer token) or the call WebView
 * (X-Call-Token room token, which is only valid for that one call).
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
 * POST /api/calls/initiate
 * Start an in-app voice or video call. The caller is always the logged-in user.
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

        const [caller, receiver] = await Promise.all([getDisplayInfo(callerId), getDisplayInfo(receiverId)]);
        if (!receiver) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (receiver.blocked.includes(callerId) || caller?.blocked.includes(receiverId)) {
            return res.status(403).json({ error: 'You cannot call this user' });
        }

        // Busy if either party is already ringing or connected in another call
        for (const s of activeCalls.values()) {
            if (isParticipant(s, receiverId) && (s.status === 'connected' || s.status === 'ringing')) {
                return res.status(409).json({ error: 'User is busy on another call', status: 'busy' });
            }
        }

        const callId = `call_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
        const session: CallSession = {
            id: callId,
            callerId,
            callerName: caller?.name || 'User',
            callerAvatar: caller?.avatar || '',
            receiverId,
            receiverName: receiver.name,
            receiverAvatar: receiver.avatar,
            callType: callType === 'video' ? 'video' : 'voice',
            status: 'ringing',
            createdAt: new Date().toISOString(),
        };
        activeCalls.set(callId, session);

        res.status(201).json({ message: 'Call initiated successfully', call: session });
    } catch (error: any) {
        console.error('Error initiating call:', error);
        res.status(500).json({ error: 'Failed to initiate call' });
    }
});

/**
 * GET /api/calls/incoming/:userId
 * Check for a ringing call addressed to the logged-in user.
 */
router.get('/incoming/:userId', authenticateUser, (req: Request, res: Response): any => {
    if (req.params.userId !== req.user!.uid) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const now = Date.now();
    for (const session of activeCalls.values()) {
        if (session.receiverId === req.user!.uid && session.status === 'ringing' &&
            now - new Date(session.createdAt).getTime() <= RING_TIMEOUT_MS) {
            return res.json({ incomingCall: session });
        }
    }
    res.json({ incomingCall: null });
});

/**
 * GET /api/calls/:callId/status
 */
router.get('/:callId/status', authenticateUser, (req: Request, res: Response): any => {
    const session = findCall(req.params.callId);
    if (!session || !isParticipant(session, req.user!.uid)) {
        return res.status(404).json({ error: 'Call session not found' });
    }
    res.json({ call: session });
});

/**
 * GET /api/calls/:callId/room-token
 * Short-lived token for the call WebView (participants only).
 */
router.get('/:callId/room-token', authenticateUser, (req: Request, res: Response): any => {
    const session = activeCalls.get(req.params.callId);
    if (!session || !isParticipant(session, req.user!.uid)) {
        return res.status(404).json({ error: 'Call session not found' });
    }
    res.json({ roomToken: createRoomToken(session.id, req.user!.uid) });
});

/**
 * POST /api/calls/:callId/answer — receiver only
 */
router.post('/:callId/answer', authenticateUser, (req: Request, res: Response): any => {
    const session = activeCalls.get(req.params.callId);
    if (!session || !isParticipant(session, req.user!.uid)) {
        return res.status(404).json({ error: 'Call session not found' });
    }
    if (session.receiverId !== req.user!.uid) {
        return res.status(403).json({ error: 'Only the person being called can answer' });
    }
    if (session.status !== 'ringing') {
        return res.status(409).json({ error: `Call is ${session.status}` });
    }
    session.status = 'connected';
    session.answeredAt = new Date().toISOString();
    res.json({ message: 'Call connected', call: session });
});

/**
 * POST /api/calls/:callId/reject — receiver only
 */
router.post('/:callId/reject', authenticateUser, (req: Request, res: Response): any => {
    const session = activeCalls.get(req.params.callId);
    if (!session || !isParticipant(session, req.user!.uid)) {
        return res.status(404).json({ error: 'Call session not found' });
    }
    if (session.receiverId !== req.user!.uid) {
        return res.status(403).json({ error: 'Only the person being called can reject' });
    }
    session.status = 'rejected';
    session.endedAt = new Date().toISOString();
    archive(session);
    res.json({ message: 'Call rejected', call: session });
});

/**
 * POST /api/calls/:callId/end — either participant
 */
router.post('/:callId/end', authenticateUser, (req: Request, res: Response): any => {
    const session = activeCalls.get(req.params.callId);
    if (!session) {
        const past = callHistory.get(req.params.callId);
        if (past && isParticipant(past, req.user!.uid)) return res.json({ message: 'Call already ended', call: past });
        return res.status(404).json({ error: 'Call session not found' });
    }
    if (!isParticipant(session, req.user!.uid)) {
        return res.status(404).json({ error: 'Call session not found' });
    }
    session.status = 'ended';
    session.endedAt = new Date().toISOString();
    // Duration is computed by the server, not trusted from the client
    if (session.answeredAt) {
        session.durationSeconds = Math.max(0, Math.floor(
            (new Date(session.endedAt).getTime() - new Date(session.answeredAt).getTime()) / 1000
        ));
    }
    archive(session);
    res.json({ message: 'Call ended successfully', call: session });
});

/**
 * POST /api/calls/:callId/signal
 * Send a WebRTC offer/answer/ICE candidate to the other participant.
 */
router.post('/:callId/signal', signalAuth, (req: Request, res: Response): any => {
    const uid: string = (req as any).callUid;
    const session = activeCalls.get(req.params.callId);
    if (!session || !isParticipant(session, uid)) {
        return res.status(404).json({ error: 'Call session not found' });
    }
    const { data } = req.body || {};
    if (!data || typeof data !== 'object' || !['offer', 'answer', 'candidate'].includes(data.type)) {
        return res.status(400).json({ error: 'Invalid signal' });
    }

    const signals = callSignals.get(session.id) || [];
    // Sender and recipient are derived from the session, never from the request body
    signals.push({ from: uid, to: otherParty(session, uid), data, timestamp: Date.now() });
    if (signals.length > 100) signals.splice(0, signals.length - 100);
    callSignals.set(session.id, signals);

    res.json({ success: true });
});

/**
 * GET /api/calls/:callId/signal/:userId
 * Poll pending signals for the authenticated participant.
 */
router.get('/:callId/signal/:userId', signalAuth, (req: Request, res: Response): any => {
    const uid: string = (req as any).callUid;
    if (req.params.userId !== uid) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const session = findCall(req.params.callId);
    if (!session || !isParticipant(session, uid)) {
        return res.status(404).json({ error: 'Call session not found' });
    }
    const signals = callSignals.get(session.id) || [];
    const pending = signals.filter(s => s.to === uid).map(s => s.data);
    callSignals.set(session.id, signals.filter(s => s.to !== uid));
    res.json({ signals: pending, status: session.status });
});

router.get('/room/:callId', (req: Request, res: Response): any => {
    const { callId } = req.params;
    const { type = 'voice', token } = req.query;

    // The room only opens with a valid token for THIS call; who you are comes from the token
    const t = verifyRoomToken(token);
    const session = activeCalls.get(callId);
    if (!t || t.callId !== callId || !session || !isParticipant(session, t.uid)) {
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
        iceServers: getIceServers(),
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, maximum-scale=1.0">
    <title>QIIRA Live Call</title>
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
            top: 16px;
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

                localStream = await navigator.mediaDevices.getUserMedia(constraints);
                if (IS_VIDEO && localVideo) {
                    localVideo.srcObject = localStream;
                }

                setupAudioVisualizer(localStream);
                statusPill.textContent = 'Audio Connected';
                postToNative('LOCAL_MEDIA_READY');

                createPeerConnection();

                // Determine if initiator by user ID sorting
                isInitiator = USER_ID < TARGET_ID;

                if (isInitiator) {
                    const offer = await peerConnection.createOffer();
                    await peerConnection.setLocalDescription(offer);
                    sendSignal({ type: 'offer', sdp: offer });
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
                    remoteVideo.srcObject = stream;
                    remoteVideo.play().catch(() => {});
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

            peerConnection.onconnectionstatechange = () => {
                const state = peerConnection.connectionState;
                if (state === 'connected') {
                    statusPill.textContent = 'Connected • HD Audio';
                    postToNative('PEER_CONNECTED');
                } else if (state === 'disconnected' || state === 'failed') {
                    statusPill.textContent = 'Reconnecting...';
                }
            };
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

        function startSignalPolling() {
            pollTimer = setInterval(async () => {
                try {
                    const res = await fetch(API_BASE + '/calls/' + encodeURIComponent(CALL_ID) + '/signal/' + encodeURIComponent(USER_ID), { headers: AUTH_HEADERS });
                    if (res.status === 401 || res.status === 404) { clearInterval(pollTimer); return; }
                    const json = await res.json();
                    if (json.signals && json.signals.length > 0) {
                        for (const sig of json.signals) {
                            handleSignal(sig);
                        }
                    }
                } catch (e) {}
            }, 800);
        }

        async function handleSignal(sig) {
            if (!peerConnection) return;
            try {
                if (sig.type === 'offer') {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(sig.sdp));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    sendSignal({ type: 'answer', sdp: answer });
                } else if (sig.type === 'answer') {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(sig.sdp));
                } else if (sig.type === 'candidate' && sig.candidate) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(sig.candidate));
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
                        if (localVideo) localVideo.srcObject = newStream;
                        if (peerConnection) {
                            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                            if (sender) sender.replaceTrack(newTrack);
                        }
                    }).catch(() => {});
                }
            } else if (data.action === 'END_CALL') {
                if (localStream) localStream.getTracks().forEach(t => t.stop());
                if (peerConnection) peerConnection.close();
                if (pollTimer) clearInterval(pollTimer);
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
