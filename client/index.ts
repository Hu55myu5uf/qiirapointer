import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';

// Wake the API server as early as possible: on the free hosting plan it sleeps when idle and
// takes a while to start, so this overlaps that wait with the app's own start-up.
try {
  fetch('https://qiirapointer.onrender.com/health').catch(() => {});
} catch (_) {}

// Log unhandled errors, then always pass them on to React Native's default handler so real
// crashes are reported (and not silently swallowed, which left the app frozen).
if (typeof (globalThis as any).ErrorUtils !== 'undefined') {
  const originalHandler = (globalThis as any).ErrorUtils.getGlobalHandler();
  (globalThis as any).ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    console.error('Unhandled error:', error, 'isFatal:', isFatal);
    originalHandler?.(error, isFatal);
  });
}

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
