import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * Earpiece / loudspeaker routing during a call (native module in modules/call-audio).
 * The phone stays in call mode for the whole call; only the output device changes.
 * Every call is a no-op where the module isn't available (web, iOS for now, old builds).
 */
type CallAudioNative = {
    start(speaker: boolean): boolean;
    setSpeaker(speaker: boolean): boolean;
    stop(): boolean;
};

const native: CallAudioNative | null =
    Platform.OS === 'android' ? requireOptionalNativeModule<CallAudioNative>('CallAudio') : null;

export const callAudio = {
    available: Boolean(native),
    start(speaker: boolean) {
        try { native?.start(speaker); } catch {}
    },
    setSpeaker(speaker: boolean) {
        try { native?.setSpeaker(speaker); } catch {}
    },
    stop() {
        try { native?.stop(); } catch {}
    },
};
