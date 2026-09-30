import { create } from 'zustand';
import { callAPI } from '../services/api';

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

interface CallState {
    currentCall: CallSession | null;
    incomingCall: CallSession | null;
    isMuted: boolean;
    isSpeaker: boolean;
    isVideoEnabled: boolean;
    isFrontCamera: boolean;
    callDuration: number;
    isInCall: boolean;

    // Actions
    setIncomingCall: (call: CallSession | null) => void;
    setCurrentCall: (call: CallSession | null) => void;
    toggleMute: () => void;
    toggleSpeaker: () => void;
    toggleVideo: () => void;
    toggleCamera: () => void;
    setCallDuration: (duration: number) => void;
    incrementDuration: () => void;

    startCall: (params: {
        callerId: string;
        callerName: string;
        callerAvatar?: string;
        receiverId: string;
        receiverName: string;
        receiverAvatar?: string;
        callType?: 'voice' | 'video';
    }) => Promise<CallSession>;

    answerIncomingCall: () => Promise<void>;
    rejectIncomingCall: () => Promise<void>;
    endCurrentCall: () => Promise<void>;
    checkForIncomingCall: (userId: string) => Promise<CallSession | null>;
}

export const useCallStore = create<CallState>((set, get) => ({
    currentCall: null,
    incomingCall: null,
    isMuted: false,
    isSpeaker: false,
    isVideoEnabled: true,
    isFrontCamera: true,
    callDuration: 0,
    isInCall: false,

    setIncomingCall: (call) => set({ incomingCall: call }),
    setCurrentCall: (call) => set({ currentCall: call, isInCall: Boolean(call) }),
    toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
    toggleSpeaker: () => set((state) => ({ isSpeaker: !state.isSpeaker })),
    toggleVideo: () => set((state) => ({ isVideoEnabled: !state.isVideoEnabled })),
    toggleCamera: () => set((state) => ({ isFrontCamera: !state.isFrontCamera })),
    setCallDuration: (duration) => set({ callDuration: duration }),
    incrementDuration: () => set((state) => ({ callDuration: state.callDuration + 1 })),

    startCall: async (params) => {
        try {
            const res = await callAPI.initiateCall(params);
            const call = res.data.call;
            set({
                currentCall: call,
                isInCall: true,
                callDuration: 0,
                isMuted: false,
                isSpeaker: false,
                isVideoEnabled: params.callType === 'video',
                isFrontCamera: true,
            });
            return call;
        } catch (error) {
            console.error('Failed to start call:', error);
            throw error;
        }
    },

    answerIncomingCall: async () => {
        const { incomingCall } = get();
        if (!incomingCall) return;
        try {
            const res = await callAPI.answerCall(incomingCall.id);
            const call = res.data.call || { ...incomingCall, status: 'connected' };
            set({
                incomingCall: null,
                currentCall: call,
                isInCall: true,
                callDuration: 0,
                isMuted: false,
                isSpeaker: false,
                isVideoEnabled: incomingCall.callType === 'video',
                isFrontCamera: true,
            });
        } catch (error) {
            console.error('Failed to answer call:', error);
            set({ incomingCall: null });
        }
    },

    rejectIncomingCall: async () => {
        const { incomingCall } = get();
        if (!incomingCall) return;
        try {
            await callAPI.rejectCall(incomingCall.id);
        } catch (error) {
            console.error('Failed to reject call:', error);
        } finally {
            set({ incomingCall: null });
        }
    },

    endCurrentCall: async () => {
        const { currentCall, callDuration } = get();
        if (currentCall) {
            try {
                await callAPI.endCall(currentCall.id, callDuration);
            } catch (error) {
                console.error('Failed to end call:', error);
            }
        }
        set({
            currentCall: null,
            incomingCall: null,
            isInCall: false,
            callDuration: 0,
            isMuted: false,
            isSpeaker: false,
        });
    },

    checkForIncomingCall: async (userId: string) => {
        const { currentCall } = get();
        // If already in a call, ignore incoming checks
        if (currentCall && currentCall.status === 'connected') return null;

        try {
            const res = await callAPI.checkIncomingCall(userId);
            const incoming = res.data.incomingCall;
            if (incoming) {
                set({ incomingCall: incoming });
                return incoming;
            } else {
                // If previously was incoming, clear it
                if (get().incomingCall) {
                    set({ incomingCall: null });
                }
                return null;
            }
        } catch (error) {
            return null;
        }
    },
}));
