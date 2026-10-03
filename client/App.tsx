import { useTheme, ThemeProvider } from './src/context/ThemeContext';
import React, { useEffect, useState } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { ActivityIndicator, View, Text, Alert, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { auth } from './src/config/firebase';
import { useAuthStore } from './src/store/authStore';
import { useChatStore } from './src/store/chatStore';
import { authAPI } from './src/services/api';
import { registerForPushNotifications, savePushToken, addNotificationListeners } from './src/services/notifications';

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
import IncomingCallModal from './src/components/IncomingCallModal';
import ThemedAlertModal from './src/components/ThemedAlertModal';
import AdminPreviewBanner from './src/components/AdminPreviewBanner';
import { useCallStore } from './src/store/callStore';
import { initGlobalAlertPatch } from './src/store/alertStore';

export const navigationRef = createNavigationContainerRef<any>();

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Auth Stack (Login/Register)
function AuthStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: colors.background },
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
        component={WriteReviewScreen}
        options={{ title: 'Write a Review' }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: 'Chat' }}
      />
      <Stack.Screen
        name="CreatePost"
        component={CreatePostScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Cart"
        component={CartScreen}
        options={{ title: 'Saved Cart' }}
      />
      <Stack.Screen
        name="CallScreen"
        component={CallScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Call"
        component={CallScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>

  );
}

// Explore Stack (Explore Feed -> Post / Vendor Details)
function ExploreStack() {
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
        component={CreatePostScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="VendorDetails"
        component={VendorDetailsScreen}
        options={{ title: 'Vendor Details' }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: 'Chat' }}
      />
      <Stack.Screen
        name="UserProfileView"
        component={UserProfileViewScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="WriteReview"
        component={WriteReviewScreen}
        options={{ title: 'Write a Review' }}
      />
      <Stack.Screen
        name="Cart"
        component={CartScreen}
        options={{ title: 'Saved Cart' }}
      />
      <Stack.Screen
        name="CallScreen"
        component={CallScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Call"
        component={CallScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// Client Profile Stack (for navigating to GetVerified from profile)
function ClientProfileStack() {
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
        component={CallScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Call"
        component={CallScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// Client Tabs
function ClientTabs() {
  const { theme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { unreadCount, refreshUnreadCount, loadReadTimestamps } = useChatStore();

  const bottomInset = insets.bottom > 0 ? insets.bottom : (Platform.OS === 'ios' ? 12 : 8);
  const barHeight = Platform.OS === 'ios'
    ? (insets.bottom > 0 ? 60 + insets.bottom : 68)
    : 66 + (insets.bottom > 0 ? insets.bottom : 0);

  useEffect(() => {
    loadReadTimestamps();
    if (user) {
      refreshUnreadCount(user.uid);
      const interval = setInterval(() => {
        refreshUnreadCount(user.uid);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

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
        component={FavoritesScreen}
        options={{
          tabBarLabel: 'Favorites',
        }}
      />
      <Tab.Screen
        name="Messages"
        component={ClientMessagesStack}
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
        component={ClientProfileStack}
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
        component={ChatScreen}
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
        component={CartScreen}
        options={{ title: 'Saved Cart' }}
      />
      <Stack.Screen
        name="CallScreen"
        component={CallScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Call"
        component={CallScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// Vendor Messages Stack (includes Chat screen)
function VendorMessagesStack() {
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
        component={ChatScreen}
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
        component={CartScreen}
        options={{ title: 'Saved Cart' }}
      />
      <Stack.Screen
        name="CallScreen"
        component={CallScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Call"
        component={CallScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// Vendor Profile Stack (to allow navigating to CreatePost, Cart, CallScreen, etc.)
function VendorProfileStack() {
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
        component={CreatePostScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Cart"
        component={CartScreen}
        options={{ title: 'Saved Cart' }}
      />
      <Stack.Screen
        name="CallScreen"
        component={CallScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Call"
        component={CallScreen}
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
  const { unreadCount, refreshUnreadCount, loadReadTimestamps } = useChatStore();

  const bottomInset = insets.bottom > 0 ? insets.bottom : (Platform.OS === 'ios' ? 12 : 8);
  const barHeight = Platform.OS === 'ios'
    ? (insets.bottom > 0 ? 60 + insets.bottom : 68)
    : 66 + (insets.bottom > 0 ? insets.bottom : 0);

  useEffect(() => {
    loadReadTimestamps();
    if (user) {
      refreshUnreadCount(user.uid);
      const interval = setInterval(() => {
        refreshUnreadCount(user.uid);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

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
        component={ChatScreen}
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
  const { user, setUser, setUserRole, setRealRole, realRole, setLoading, isLoading, isAuthenticated, userRole } = useAuthStore();
  const { checkForIncomingCall } = useCallStore();
  const [initializing, setInitializing] = useState(true);

  // Listen for incoming calls every 3.5 seconds when authenticated
  useEffect(() => {
    if (user?.uid) {
      checkForIncomingCall(user.uid);
      const interval = setInterval(() => {
        checkForIncomingCall(user.uid);
      }, 3500);
      return () => clearInterval(interval);
    }
  }, [user]);

  // Initialize themed alert patch safely inside component lifecycle
  useEffect(() => {
    try {
      initGlobalAlertPatch();
    } catch (e) {
      console.warn('initGlobalAlertPatch failed:', e);
    }
  }, []);

  // Listen for Firebase auth state changes
  useEffect(() => {
    const safetyTimeout = setTimeout(() => {
      setInitializing(false);
    }, 3500);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(safetyTimeout);
      try {
        if (firebaseUser) {
          const response = await authAPI.getUser(firebaseUser.uid);
          const dbUser = response.data?.user;

          if (dbUser?.isSuspended) {
            Alert.alert(
              'Account Suspended',
              'Your account has been suspended by an administrator. Please contact QIIRA support for assistance.'
            );
            await auth.signOut();
            setUser(null);
            setUserRole(null);
            setRealRole(null);
            return;
          }

          const role = dbUser?.role || 'client';
          setRealRole(role);
          const resolvedPhoto = dbUser?.profileImage || dbUser?.profile_image || dbUser?.businessImage || firebaseUser.photoURL || '';
          const resolvedName = dbUser?.fullName || dbUser?.full_name || dbUser?.businessName || firebaseUser.displayName || '';
          const enrichedUser = {
            ...firebaseUser,
            displayName: resolvedName || firebaseUser.displayName,
            photoURL: resolvedPhoto || firebaseUser.photoURL,
          };
          setUser(enrichedUser as any);

          // Register for push notifications and save token
          const pushToken = await registerForPushNotifications();
          if (pushToken) {
            await savePushToken(firebaseUser.uid, pushToken);
          }
        } else {
          setUser(null);
          setUserRole(null);
          setRealRole(null);
        }
      } catch (error: any) {
        console.error('Error fetching user role:', error);
        // If user exists in Firebase but not in DB (404) or is suspended (403), log them out
        if (error.response && (error.response.status === 404 || error.response.status === 403)) {
          console.log('User not found or suspended, logging out...');
          await auth.signOut();
        }
        // On any error (network, 404, etc), clear auth state and show login
        setUser(null);
        setUserRole(null);
        setRealRole(null);
      } finally {
        setLoading(false);
        setInitializing(false);
      }
    });

    return unsubscribe;
  }, []);

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AdminPreviewBanner />
        <NavigationContainer ref={navigationRef}>
          {!isAuthenticated ? (
            <AuthStack />
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

export default function App() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}
