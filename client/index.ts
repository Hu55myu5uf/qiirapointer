import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';

// Early diagnostic boot ping to confirm JS runtime execution
try {
  fetch('https://qiirapointer.onrender.com/health?src=android_boot_v103').catch(() => {});
} catch (_) {}

// Global safety guard for unhandled errors
if (typeof (globalThis as any).ErrorUtils !== 'undefined') {
  const originalHandler = (globalThis as any).ErrorUtils.getGlobalHandler();
  (globalThis as any).ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    console.error('Captured by global error handler:', error, 'isFatal:', isFatal);
    if (!isFatal && originalHandler) {
      try {
        originalHandler(error, isFatal);
      } catch (_) {}
    }
  });
}

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
