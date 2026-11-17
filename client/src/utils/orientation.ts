import { Dimensions, Platform } from 'react-native';
// Loaded lazily: an app build made before this module was added has no native side for it,
// and a top-level import would crash at start-up instead of just skipping the policy.
let ScreenOrientation: typeof import('expo-screen-orientation') | null = null;

/**
 * Orientation policy:
 * - phones (shortest side under 600dp) stay in portrait, like most social / shopping apps
 * - tablets and unfolded foldables rotate freely (Android 16+ requires this on large screens anyway)
 *
 * Re-checked whenever the display changes size, so folding / unfolding a foldable switches policy.
 */
const TABLET_MIN_SIDE = 600;

let lockedToPortrait: boolean | null = null;

function apply() {
    if (!ScreenOrientation) return;
    const { width, height } = Dimensions.get('screen');
    const isLargeScreen = Math.min(width, height) >= TABLET_MIN_SIDE;
    const wantPortrait = !isLargeScreen;
    if (wantPortrait === lockedToPortrait) return;
    lockedToPortrait = wantPortrait;
    const action = wantPortrait
        ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
        : ScreenOrientation.unlockAsync();
    action.catch(() => {
        // not supported here (e.g. some emulators); the app still works in whatever orientation it gets
        lockedToPortrait = null;
    });
}

export function initOrientationPolicy() {
    if (Platform.OS === 'web') return;
    try {
        ScreenOrientation = require('expo-screen-orientation');
        apply();
        Dimensions.addEventListener('change', apply);
    } catch {
        // native module missing in an older build: keep the default behaviour
    }
}
