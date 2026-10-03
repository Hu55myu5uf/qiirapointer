import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';

import App from './App';

// Global safety guard for unhandled errors
if (typeof (global as any).ErrorUtils !== 'undefined') {
  const originalHandler = (global as any).ErrorUtils.getGlobalHandler();
  (global as any).ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    console.error('Captured by global error handler:', error, 'isFatal:', isFatal);
    if (!isFatal && originalHandler) {
      originalHandler(error, isFatal);
    }
  });
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
