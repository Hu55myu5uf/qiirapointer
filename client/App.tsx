import { useTheme, ThemeProvider } from './src/context/ThemeContext';
import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { ActivityIndicator, View, Text, Alert, Platform, TouchableOpacity, AppState } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { auth } from './src/config/firebase';
import { useAuthStore } from './src/store/authStore';
import { useChatStore } from './src/store/chatStore';
import { authAPI } from './src/services/api';
import { registerForPushNotifications, savePushToken, addNotificationListeners } from './src/services/notifications';
import { getCachedProfile, fetchProfileWithRetry, clearCachedProfile } from './src/services/session';
import { subscribeToIncomingCalls } from './src/services/realtime';
import * as SplashScreen from 'expo-splash-screen';
import * as Sentry from '@sentry/react-native';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import VendorDetailsScreen from './src/screens/VendorDetailsScreen';
import VendorProfileScreen from './src/screens/VendorProfileScreen';
import VendorVerificationScreen from './src/screens/VendorVerificationScreen';
import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import VendorProfileCompletionScreen from './src/screens/VendorProfileCompletionScreen';
import UserManagementScreen from './src/screens/UserManagementScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import WriteReviewScreen from './src/screens/WriteReviewScreen';
import ChatScreen from './src/screens/ChatScreen';
import ConversationsScreen from './src/screens/ConversationsScreen';
import ClientProfileScreen from './src/screens/ClientProfileScreen';
import VendorReviewsScreen from './src/screens/VendorReviewsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import UserProfileViewScreen from './src/screens/UserProfileViewScreen';
import ExploreScreen from './src/screens/ExploreScreen';
import CreatePostScreen from './src/screens/CreatePostScreen';
import CartScreen from './src/screens/CartScreen';
import CallScreen from './src/screens/CallScreen';
import SignInRequiredScreen from './src/screens/SignInRequiredScreen';
import IncomingCallModal from './src/components/IncomingCallModal';
import ThemedAlertModal from './src/components/ThemedAlertModal';
import AdminPreviewBanner from './src/components/AdminPreviewBanner';
import { useCallStore } from './src/store/callStore';
import { initGlobalAlertPatch } from './src/store/alertStore';

export const navigationRef = createNavigationContainerRef<any>();

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Auth Stack (Login/Register)
function AuthStack() {
  const { colors } = useTheme();
  const authEntry = useAuthStore(s => s.authEntry);
  return (
    <Stack.Navigator
      initialRouteName={authEntry}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen
        name="VendorProfileCompletion"
        component={VendorProfileCompletionScreen}
        options={{ title: 'Complete Profile' }}
      />
    </Stack.Navigator>
  );
}

// Home Stack (Home -> Vendor Details)
function HomeStack() {
  const isGuest = useAuthStore(s => s.isGuest);
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textInverse,
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen
        name="HomeMain"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="VendorDetails"
        component={VendorDetailsScreen}
        options={{ title: 'Vendor Details' }}
      />
      <Stack.Screen
        name="UserProfileView"
        component={UserProfileViewScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="WriteReview"
        component={isGuest ? SignInRequiredScreen : WriteReviewScreen}
        options={{ title: 'Write a Review' }}
      />
      <Stack.Screen
        name="Chat"
        component={isGuest ? SignInRequiredScreen : ChatScreen}
        options={{ title: 'Chat' }}
      />
      <Stack.Screen
        name="CreatePost"
        component={isGuest ? SignInRequiredScreen : CreatePostScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Cart"
        component={isGuest ? SignInRequiredScreen : CartScreen}
        options={{ title: 'Saved Cart' }}
      />
      <Stack.Screen
        name="CallScreen"
        component={isGuest ? SignInRequiredScreen : CallScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Call"
        component={isGuest ? SignInRequiredScreen : CallScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>

  );
}

// Explore Stack (Explore Feed -> Post / Vendor Details)
function ExploreStack() {
  const isGuest = useAuthStore(s => s.isGuest);
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textInverse,
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen
        name="ExploreMain"
        component={ExploreScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreatePost"
        component={isGuest ? SignInRequiredScreen : CreatePostScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="VendorDetails"
        component={VendorDetailsScreen}
        options={{ title: 'Vendor Details' }}
      />
      <Stack.Screen
        name="Chat"
        component={isGuest ? SignInRequiredScreen : ChatScreen}
        options={{ title: 'Chat' }}
      />
      <Stack.Screen
        name="UserProfileView"
        component={UserProfileViewScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="WriteReview"
        component={isGuest ? SignInRequiredScreen : WriteReviewScreen}
        options={{ title: 'Write a Review' }}
      />
      <Stack.Screen
        name="Cart"
        component={isGuest ? SignInRequiredScreen : CartScreen}
        options={{ title: 'Saved Cart' }}
      />
      <Stack.Screen
        name="CallScreen"
        component={isGuest ? SignInRequiredScreen : CallScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Call"
        component={isGuest ? SignInRequiredScreen : CallScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// Client Profile Stack (for navigating to GetVerified from profile)
function ClientProfileStack() {
  const isGuest = useAuthStore(s => s.isGuest);
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textInverse,
      }}
    >
      <Stack.Screen
        name="ClientProfileMain"
        component={ClientProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="GetVerified"
        component={VendorVerificationScreen}
        options={{ title: 'Get Verified' }}
      />
      <Stack.Screen
        name="CallScreen"
        component={isGuest ? SignInRequiredScreen : CallScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Call"
        component={isGuest ? SignInRequiredScreen : CallScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// Client Tabs
function ClientTabs() {
  const isGuest = useAuthStore(s => s.isGuest);
  const { theme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const unreadCount = useChatStore(s => s.unreadCount);

  const bottomInset = insets.bottom > 0 ? insets.bottom : (Platform.OS === 'ios' ? 12 : 8);
  const barHeight = Platform.OS === 'ios'
    ? (insets.bottom > 0 ? 60 + insets.bottom : 68)
    : 66 + (insets.bottom > 0 ? insets.bottom : 0);

  // Unread badge comes from the app-wide live chat subscription (see MainApp)

  return (
    <Tab.Navigator
      initialRouteName="Explore"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          paddingBottom: bottomInset,
          paddingTop: 8,
          height: barHeight,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIconStyle: {
          width: 44,
          height: 30,
        },
        tabBarIcon: ({ focused }) => {
          let iconName: any = 'ellipse';
          if (route.name === 'Home') iconName = focused ? 'compass' : 'compass-outline';
          else if (route.name === 'Explore') iconName = focused ? 'sparkles' : 'sparkles-outline';
          else if (route.name === 'Favorites') iconName = focused ? 'heart' : 'heart-outline';
          else if (route.name === 'Messages') iconName = focused ? 'chatbubble' : 'chatbubble-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';

          const iconColor = focused
            ? (theme === 'dark' ? '#000000' : '#FFFFFF')
            : colors.primary;

          return (
            <View
              style={{
                width: 42,
                height: 28,
                borderRadius: 14,
                backgroundColor: focused ? colors.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={iconName} size={20} color={iconColor} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{
          tabBarLabel: 'Discover',
        }}
      />
      <Tab.Screen
        name="Explore"
        component={ExploreStack}
        options={{
          tabBarLabel: 'Explore',
        }}
      />
      <Tab.Screen
        name="Favorites"
        component={isGuest ? SignInRequiredScreen : FavoritesScreen}
        options={{
          tabBarLabel: 'Favorites',
        }}
      />
      <Tab.Screen
        name="Messages"
        component={isGuest ? SignInRequiredScreen : ClientMessagesStack}
        options={{
          tabBarLabel: 'Messages',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.primary,
            fontSize: 10,
          },
        }}
      />
      <Tab.Screen
        name="Profile"
        component={isGuest ? SignInRequiredScreen : ClientProfileStack}
        options={{
          headerShown: false,
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
}

// Client Messages Stack (for navigating from Messages tab to Chat)
function ClientMessagesStack() {
  const isGuest = useAuthStore(s => s.isGuest);
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textInverse,
      }}
    >
      <Stack.Screen
        name="ConversationsList"
        component={ConversationsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Chat"
        component={isGuest ? SignInRequiredScreen : ChatScreen}
        options={{ title: 'Chat' }}
      />
      <Stack.Screen
        name="UserProfileView"
        component={UserProfileViewScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="VendorDetails"
        component={VendorDetailsScreen}
        options={{ title: 'Vendor Details' }}
      />
      <Stack.Screen
        name="Cart"
        component={isGuest ? SignInRequiredScreen : CartScreen}
        options={{ title: 'Saved Cart' }}
      />
      <Stack.Screen
        name="CallScreen"
        component={isGuest ? SignInRequiredScreen : CallScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Call"
        component={isGuest ? SignInRequiredScreen : CallScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// Vendor Messages Stack (includes Chat screen)
function VendorMessagesStack() {
  const isGuest = useAuthStore(s => s.isGuest);
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textInverse,
      }}
    >
      <Stack.Screen
        name="ConversationsList"
        component={ConversationsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Chat"
        component={isGuest ? SignInRequiredScreen : ChatScreen}
        options={{ title: 'Chat' }}
      />
      <Stack.Screen
        name="UserProfileView"
        component={UserProfileViewScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="VendorDetails"
        component={VendorDetailsScreen}
        options={{ title: 'Vendor Details' }}
      />
      <Stack.Screen
        name="Cart"
        component={isGuest ? SignInRequiredScreen : CartScreen}
        options={{ title: 'Saved Cart' }}
      />
      <Stack.Screen
        name="CallScreen"
        component={isGuest ? SignInRequiredScreen : CallScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Call"
        component={isGuest ? SignInRequiredScreen : CallScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// Vendor Profile Stack (to allow navigating to CreatePost, Cart, CallScreen, etc.)
function VendorProfileStack() {
  const isGuest = useAuthStore(s => s.isGuest);
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textInverse,
      }}
    >
      <Stack.Screen
        name="VendorProfileMain"
        component={VendorProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreatePost"
        component={isGuest ? SignInRequiredScreen : CreatePostScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Cart"
        component={isGuest ? SignInRequiredScreen : CartScreen}
        options={{ title: 'Saved Cart' }}
      />
      <Stack.Screen
        name="CallScreen"
        component={isGuest ? SignInRequiredScreen : CallScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Call"
        component={isGuest ? SignInRequiredScreen : CallScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="UserProfileView"
        component={UserProfileViewScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="GetVerified"
        component={VendorVerificationScreen}
        options={{ title: 'Get Verified' }}
      />
    </Stack.Navigator>
  );
}

// Vendor Tabs
function VendorTabs() {
  const { theme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const unreadCount = useChatStore(s => s.unreadCount);

  const bottomInset = insets.bottom > 0 ? insets.bottom : (Platform.OS === 'ios' ? 12 : 8);
  const barHeight = Platform.OS === 'ios'
    ? (insets.bottom > 0 ? 60 + insets.bottom : 68)
    : 66 + (insets.bottom > 0 ? insets.bottom : 0);

  // Unread badge comes from the app-wide live chat subscription (see MainApp)

  return (
    <Tab.Navigator
      initialRouteName="Explore"
      screenOptions={({ route }) => ({
        headerShown: true,
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textInverse,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          paddingBottom: bottomInset,
          paddingTop: 8,
          height: barHeight,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIconStyle: {
          width: 44,
          height: 30,
        },
        tabBarIcon: ({ focused }) => {
          let iconName: any = 'ellipse';
          if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
          else if (route.name === 'Explore') iconName = focused ? 'sparkles' : 'sparkles-outline';
          else if (route.name === 'Reviews') iconName = focused ? 'star' : 'star-outline';
          else if (route.name === 'Messages') iconName = focused ? 'chatbubble' : 'chatbubble-outline';

          const iconColor = focused
            ? (theme === 'dark' ? '#000000' : '#FFFFFF')
            : colors.primary;

          return (
            <View
              style={{
                width: 42,
                height: 28,
                borderRadius: 14,
                backgroundColor: focused ? colors.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={iconName} size={20} color={iconColor} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen
        name="Profile"
        component={VendorProfileStack}
        options={{
          headerShown: false,
          tabBarLabel: 'Profile',
        }}
      />
      <Tab.Screen
        name="Explore"
        component={ExploreStack}
        options={{
          headerShown: false,
          tabBarLabel: 'Explore',
        }}
      />
      <Tab.Screen
        name="Reviews"
        component={VendorReviewsScreen}
        options={{
          title: 'My Reviews',
          tabBarLabel: 'Reviews',
        }}
      />
      <Tab.Screen
        name="Messages"
        component={VendorMessagesStack}
        options={{
          headerShown: false,
          tabBarLabel: 'Messages',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.primary,
            fontSize: 10,
          },
        }}
      />
    </Tab.Navigator>
  );
}

// Admin Dashboard Stack (includes Chat and Profile view for Support Queue)
function AdminDashboardStack() {
  const isGuest = useAuthStore(s => s.isGuest);
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textInverse,
      }}
    >
      <Stack.Screen
        name="AdminDashboardMain"
        component={AdminDashboardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Chat"
        component={isGuest ? SignInRequiredScreen : ChatScreen}
        options={{ title: 'Chat' }}
      />
      <Stack.Screen
        name="UserProfileView"
        component={UserProfileViewScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="VendorDetails"
        component={VendorDetailsScreen}
        options={{ title: 'Vendor Details' }}
      />
    </Stack.Navigator>
  );
}

// Admin Tabs
function AdminTabs() {
  const { theme, colors } = useTheme();
  const insets = useSafeAreaInsets();

  const bottomInset = insets.bottom > 0 ? insets.bottom : (Platform.OS === 'ios' ? 12 : 8);
  const barHeight = Platform.OS === 'ios'
    ? (insets.bottom > 0 ? 60 + insets.bottom : 68)
    : 66 + (insets.bottom > 0 ? insets.bottom : 0);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          paddingBottom: bottomInset,
          paddingTop: 8,
          height: barHeight,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIconStyle: {
          width: 44,
          height: 30,
        },
        tabBarIcon: ({ focused }) => {
          let iconName: any = 'ellipse';
          if (route.name === 'Dashboard') iconName = focused ? 'bar-chart' : 'bar-chart-outline';
          else if (route.name === 'Discover') iconName = focused ? 'compass' : 'compass-outline';
          else if (route.name === 'Users') iconName = focused ? 'people' : 'people-outline';

          const iconColor = focused
            ? (theme === 'dark' ? '#000000' : '#FFFFFF')
            : colors.primary;

          return (
            <View
              style={{
                width: 42,
                height: 28,
                borderRadius: 14,
                backgroundColor: focused ? colors.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={iconName} size={20} color={iconColor} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={AdminDashboardStack}
        options={{
          tabBarLabel: 'Dashboard',
        }}
      />
      <Tab.Screen
        name="Discover"
        component={HomeStack}
        options={{
          tabBarLabel: 'Discover Vendors',
        }}
      />
      <Tab.Screen
        name="Users"
        component={UserManagementScreen}
        options={{
          tabBarLabel: 'Users',
        }}
      />
    </Tab.Navigator>
  );
}

function MainApp() {
  const { colors } = useTheme();
  const { user, setUser, setUserRole, setRealRole, realRole, setLoading, isLoading, isAuthenticated, userRole, isGuest } = useAuthStore();
  const { checkForIncomingCall } = useCallStore();
  const [initializing, setInitializing] = useState(true);

  // Incoming calls arrive instantly through a live listener. If it can't be used, fall back to
  // checking every 5 seconds — but only while the app is in the foreground.
  const setIncomingCall = useCallStore(s => s.setIncomingCall);
  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;
    let fallback: ReturnType<typeof setInterval> | null = null;
    let appState = AppState.currentState;

    const unsubscribe = subscribeToIncomingCalls(
      uid,
      (call) => {
        // Don't interrupt a call that's already connected
        const current = useCallStore.getState().currentCall;
        if (current && current.status === 'connected') return;
        setIncomingCall(call);
      },
      () => {
        if (!fallback) {
          fallback = setInterval(() => {
            if (appState === 'active') checkForIncomingCall(uid);
          }, 5000);
        }
      },
    );
    const sub = AppState.addEventListener('change', (next) => { appState = next; });

    return () => {
      unsubscribe();
      sub.remove();
      if (fallback) clearInterval(fallback);
    };
  }, [user?.uid]);

  // Tapping a notification: open the conversation. (A call notification just opens the app —
  // the live incoming-call listener then shows the ringing call.)
  useEffect(() => {
    if (!user?.uid) return;
    return addNotificationListeners((target) => {
      if (target.type !== 'message' || !target.conversationId) return;
      const open = () => {
        if (!navigationRef.isReady()) return setTimeout(open, 300);
        navigationRef.navigate('Messages', {
          screen: 'Chat',
          params: { conversationId: target.conversationId, otherUserId: target.senderId },
        });
      };
      open();
    });
  }, [user?.uid]);

  // One real-time chat subscription for the whole app (inbox, unread badge, chat screens)
  const startChats = useChatStore(s => s.start);
  const stopChats = useChatStore(s => s.stop);
  useEffect(() => {
    if (user?.uid) startChats(user.uid);
    else stopChats();
  }, [user?.uid]);

  // Initialize themed alert patch safely inside component lifecycle
  useEffect(() => {
    try {
      initGlobalAlertPatch();
    } catch (e) {
      console.warn('initGlobalAlertPatch failed:', e);
    }
  }, []);

  // 'connecting' while waiting for the server, 'offline' when it couldn't be reached
  const [connection, setConnection] = useState<'ok' | 'connecting' | 'offline'>('ok');
  const [retryKey, setRetryKey] = useState(0);

  const applyProfile = (firebaseUser: any, dbUser: any) => {
    setRealRole(dbUser?.role === 'admin' || dbUser?.role === 'vendor' ? dbUser.role : 'client');
    const resolvedPhoto = dbUser?.profileImage || dbUser?.businessImage || firebaseUser.photoURL || '';
    const resolvedName = dbUser?.fullName || dbUser?.businessName || firebaseUser.displayName || '';
    setUser({
      ...firebaseUser,
      uid: firebaseUser.uid,
      displayName: resolvedName || firebaseUser.displayName,
      photoURL: resolvedPhoto || firebaseUser.photoURL,
    } as any);
  };

  const signOutLocally = async (uid?: string) => {
    if (uid) await clearCachedProfile(uid);
    await auth.signOut().catch(() => {});
    setUser(null);
    setUserRole(null);
    setRealRole(null);
  };

  // Listen for Firebase auth state changes
  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setUserRole(null);
        setRealRole(null);
        setConnection('ok');
        setLoading(false);
        setInitializing(false);
        return;
      }

      // 1. Instant start from the profile cached on this device (if any)
      const cached = await getCachedProfile(firebaseUser.uid);
      if (cached && !cancelled) {
        applyProfile(firebaseUser, cached);
        setLoading(false);
        setInitializing(false);
      }

      // 2. Fresh profile from the server, retrying patiently through slow networks / wake-up
      setConnection('connecting');
      const result = await fetchProfileWithRetry(firebaseUser.uid);
      if (cancelled) return;

      if (result.status === 'ok') {
        applyProfile(firebaseUser, result.user);
        setConnection('ok');
        registerForPushNotifications()
          .then(token => { if (token) return savePushToken(firebaseUser.uid, token); })
          .catch(() => {});
      } else if (result.status === 'suspended') {
        Alert.alert(
          'Account Suspended',
          result.message || 'Your account has been suspended by an administrator. Please contact QIIRA support for assistance.'
        );
        await signOutLocally(firebaseUser.uid);
        setConnection('ok');
      } else if (result.status === 'not-found') {
        await signOutLocally(firebaseUser.uid);
        setConnection('ok');
      } else {
        // Couldn't reach the server: keep the user signed in and offer a retry
        setConnection('offline');
      }
      setLoading(false);
      setInitializing(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [retryKey]);

  // Hide native splash screen once initial load finishes
  useEffect(() => {
    if (!initializing) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [initializing]);

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 24 }}>
        <ActivityIndicator size="large" color={colors.primary} />
        {connection === 'connecting' ? (
          <Text style={{ marginTop: 16, color: colors.textSecondary, textAlign: 'center' }}>
            Connecting to QIIRA… this can take up to a minute.
          </Text>
        ) : null}
      </View>
    );
  }

  // Signed in, never loaded a profile on this device, and the server can't be reached
  if (connection === 'offline' && !isAuthenticated && auth.currentUser) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 24 }}>
        <Ionicons name="cloud-offline-outline" size={56} color={colors.textSecondary} />
        <Text style={{ marginTop: 16, fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' }}>
          Can't reach QIIRA
        </Text>
        <Text style={{ marginTop: 8, color: colors.textSecondary, textAlign: 'center' }}>
          Check your internet connection and try again.
        </Text>
        <TouchableOpacity
          onPress={() => { setConnection('connecting'); setInitializing(true); setRetryKey(k => k + 1); }}
          accessibilityRole="button"
          style={{ marginTop: 24, backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 10 }}
        >
          <Text style={{ color: colors.textInverse, fontWeight: '700' }}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => signOutLocally(auth.currentUser?.uid)} style={{ marginTop: 16, padding: 8 }}>
          <Text style={{ color: colors.textSecondary }}>Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {connection === 'offline' ? (
          <TouchableOpacity
            onPress={() => setRetryKey(k => k + 1)}
            accessibilityRole="button"
            style={{ backgroundColor: '#B45309', paddingVertical: 6, paddingHorizontal: 12 }}
          >
            <Text style={{ color: '#FFFFFF', textAlign: 'center', fontSize: 13 }}>
              You're offline — showing saved data. Tap to retry.
            </Text>
          </TouchableOpacity>
        ) : null}
        <AdminPreviewBanner />
        <NavigationContainer ref={navigationRef}>
          {!isAuthenticated ? (
            isGuest ? <ClientTabs /> : <AuthStack />
          ) : userRole === 'admin' ? (
            <AdminTabs />
          ) : userRole === 'vendor' ? (
            <VendorTabs />
          ) : (
            <ClientTabs />
          )}
          <IncomingCallModal navigation={navigationRef} />
          <ThemedAlertModal />
        </NavigationContainer>
      </View>
    </SafeAreaProvider>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('RootErrorBoundary caught an error:', error, errorInfo);
    // Report to Sentry (does nothing when crash reporting isn't configured)
    try { Sentry.captureException(error, { extra: { componentStack: errorInfo?.componentStack } }); } catch (_) {}
  }

  handleRestart = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#FAF8F5' }}>
          <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#B28A45', marginBottom: 12 }}>
            QIIRA
          </Text>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginBottom: 8, textAlign: 'center' }}>
            Application Error
          </Text>
          <Text style={{ fontSize: 13, color: '#666666', marginBottom: 20, textAlign: 'center' }}>
            {this.state.error?.message || 'An unexpected issue occurred while starting the app.'}
          </Text>
          <TouchableOpacity
            onPress={this.handleRestart}
            activeOpacity={0.8}
            style={{
              backgroundColor: '#B28A45',
              paddingVertical: 12,
              paddingHorizontal: 28,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 }}>Restart App</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootErrorBoundary>
        <ThemeProvider>
          <MainApp />
        </ThemeProvider>
      </RootErrorBoundary>
    </GestureHandlerRootView>
  );
}

