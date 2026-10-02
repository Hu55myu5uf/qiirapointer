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
 * Signal exchange in-memory buffer
 */
const callSignals = new Map<string, { to: string; from: string; data: any; timestamp: number }[]>();

/**
 * POST /api/calls/:callId/signal
 * Send WebRTC SDP offer/answer or ICE candidate
 */
router.post('/:callId/signal', (req: Request, res: Response): any => {
    try {
        const { callId } = req.params;
        const { from, to, data } = req.body;

        if (!from || !to || !data) {
            return res.status(400).json({ error: 'from, to, and data are required' });
        }

        if (!callSignals.has(callId)) {
            callSignals.set(callId, []);
        }

        const signals = callSignals.get(callId)!;
        signals.push({ to, from, data, timestamp: Date.now() });

        // Keep buffer lean (last 50 signals)
        if (signals.length > 50) {
            signals.splice(0, signals.length - 50);
        }

        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: 'Signal failed', message: e.message });
    }
});

/**
 * GET /api/calls/:callId/signal/:userId
 * Poll pending WebRTC signals destined for userId
 */
router.get('/:callId/signal/:userId', (req: Request, res: Response): any => {
    try {
        const { callId, userId } = req.params;
        const signals = callSignals.get(callId) || [];

        // Find and extract signals destined for userId
        const pending: any[] = [];
        const remaining: any[] = [];

        for (const s of signals) {
            if (s.to === userId) {
                pending.push(s.data);
            } else {
                remaining.push(s);
            }
        }

        callSignals.set(callId, remaining);
        res.json({ signals: pending });
    } catch (e: any) {
        res.status(500).json({ error: 'Poll signals failed', message: e.message });
    }
});

/**
 * GET /api/calls/room/:callId
 * Live WebRTC calling room with real audio and video
 */
router.get('/room/:callId', (req: Request, res: Response): any => {
    const { callId } = req.params;
    const { userId, userName = 'User', type = 'voice', targetId = '' } = req.query;

    const isVideo = type === 'video';

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
        const CALL_ID = "${callId}";
        const USER_ID = "${userId}";
        const TARGET_ID = "${targetId}";
        const IS_VIDEO = ${isVideo};
        const API_BASE = window.location.origin + '/api';

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

        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };

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
                await fetch(API_BASE + '/calls/' + CALL_ID + '/signal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ from: USER_ID, to: TARGET_ID, data })
                });
            } catch (e) {
                console.warn('Send signal note:', e);
            }
        }

        function startSignalPolling() {
            pollTimer = setInterval(async () => {
                try {
                    const res = await fetch(API_BASE + '/calls/' + CALL_ID + '/signal/' + USER_ID);
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

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
});

export default router;
