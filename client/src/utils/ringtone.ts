import { Platform, Vibration } from 'react-native';

/**
 * Rings (looping ringtone + vibration) while an incoming call is shown inside the app.
 * When the app is closed or in the background, the "incoming_calls" notification channel plays
 * the same ringtone instead.
 */
let player: any = null;
let ringing = false;

const VIBRATION_PATTERN = [0, 700, 900];

export async function startRinging(): Promise<void> {
    if (ringing || Platform.OS === 'web') return;
    ringing = true;
    try {
        Vibration.vibrate(VIBRATION_PATTERN, true);
    } catch {}
    try {
        // Loaded lazily so a missing native module can never break app start
        const { createAudioPlayer, setAudioModeAsync } = require('expo-audio');
        await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'duckOthers' }).catch(() => {});
        if (!ringing) return; // stopped while the audio mode was being set
        player = createAudioPlayer(require('../../assets/sounds/pointer_ring.wav'));
        player.loop = true;
        player.play();
    } catch (e: any) {
        console.warn('Ringtone unavailable:', e?.message);
    }
}

export function stopRinging(): void {
    ringing = false;
    try {
        Vibration.cancel();
    } catch {}
    if (player) {
        try {
            player.pause();
            player.remove();
        } catch {}
        player = null;
    }
}
