import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import * as Sentry from '@sentry/react-native';

// Crash reporting (Sentry). Only active in real builds and only when a DSN is configured
// (EXPO_PUBLIC_SENTRY_DSN). No personal data is sent: no IP addresses, emails or request bodies.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const SENTRY_ON = Boolean(SENTRY_DSN) && !__DEV__;
if (SENTRY_ON) {
  Sentry.init({
    dsn: SENTRY_DSN,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    environment: 'production',
  });
}

// Wake the API server as early as possible: on the free hosting plan it sleeps when idle and
// takes a while to start, so this overlaps that wait with the app's own start-up.
try {
  fetch('https://qiirapointer.onrender.com/health').catch(() => {});
} catch (_) {}

// Log unhandled errors, then always pass them on (Sentry / React Native's default handler) so
// real crashes are reported instead of being silently swallowed.
if (typeof (globalThis as any).ErrorUtils !== 'undefined') {
  const originalHandler = (globalThis as any).ErrorUtils.getGlobalHandler();
  (globalThis as any).ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    console.error('Unhandled error:', error, 'isFatal:', isFatal);
    originalHandler?.(error, isFatal);
  });
}

import App from './App';

registerRootComponent(SENTRY_ON ? Sentry.wrap(App) : App);
