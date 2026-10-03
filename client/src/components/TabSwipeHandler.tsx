import React, { useRef } from 'react';
import { View, PanResponder, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useAuthStore } from '../store/authStore';

const CLIENT_TABS = ['Home', 'Explore', 'Favorites', 'Messages', 'Profile'];
const VENDOR_TABS = ['Profile', 'Explore', 'Reviews', 'Messages'];

interface TabSwipeHandlerProps {
    currentTab: string; // 'Home' | 'Explore' | 'Favorites' | 'Messages' | 'Profile' | 'Reviews'
    navigation: any;
    activeSubTab?: 'feed' | 'reels'; // applicable when currentTab === 'Explore'
    onSubTabChange?: (tab: 'feed' | 'reels') => void;
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    disableSwipe?: boolean;
}

export default function TabSwipeHandler({
    currentTab,
    navigation,
    activeSubTab = 'feed',
    onSubTabChange,
    children,
    style,
    disableSwipe = false,
}: TabSwipeHandlerProps) {
    const { userRole } = useAuthStore();
    const tabs = userRole === 'vendor' ? VENDOR_TABS : CLIENT_TABS;

    const navigateTo = (tabName: string, params?: any) => {
        try {
            const parent = navigation.getParent?.();
            if (parent && parent.navigate) {
                parent.navigate(tabName, params);
            } else {
                navigation.navigate(tabName, params);
            }
        } catch (e) {
            console.warn('Tab swipe navigation fallback:', e);
            navigation.navigate(tabName, params);
        }
    };

    const handleSwipeLeft = () => {
        if (disableSwipe) return;

        // If currently in Explore tab
        if (currentTab === 'Explore') {
            if (activeSubTab === 'feed') {
                // First swipe shows the Showcase page!
                if (onSubTabChange) {
                    onSubTabChange('reels');
                }
                return;
            } else {
                // Already on Showcase, swipe left moves to the next tab
                const currentIndex = tabs.indexOf('Explore');
                if (currentIndex >= 0 && currentIndex < tabs.length - 1) {
                    navigateTo(tabs[currentIndex + 1]);
                }
                return;
            }
        }

        // On other tabs: swipe left advances to next tab
        const currentIndex = tabs.indexOf(currentTab);
        if (currentIndex >= 0 && currentIndex < tabs.length - 1) {
            const nextTab = tabs[currentIndex + 1];
            navigateTo(nextTab, nextTab === 'Explore' ? { subTab: 'feed' } : undefined);
        }
    };

    const handleSwipeRight = () => {
        if (disableSwipe) return;

        // If currently in Explore tab
        if (currentTab === 'Explore') {
            if (activeSubTab === 'reels') {
                // Swiping right from Showcase returns to Explore feed!
                if (onSubTabChange) {
                    onSubTabChange('feed');
                }
                return;
            } else {
                // Swiping right from Explore feed moves to previous tab
                const currentIndex = tabs.indexOf('Explore');
                if (currentIndex > 0) {
                    navigateTo(tabs[currentIndex - 1]);
                }
                return;
            }
        }

        // On other tabs: swipe right moves to previous tab
        const currentIndex = tabs.indexOf(currentTab);
        if (currentIndex > 0) {
            const prevTab = tabs[currentIndex - 1];
            // If navigating back to Explore from the right (e.g. from Favorites/Reviews),
            // start at Showcase for symmetric swipe navigation
            navigateTo(prevTab, prevTab === 'Explore' ? { subTab: 'reels' } : undefined);
        }
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onStartShouldSetPanResponderCapture: () => false,
            onMoveShouldSetPanResponder: (_, gesture) => {
                if (disableSwipe) return false;
                // Only capture if horizontal movement exceeds 40px and is at least 2.5x the vertical movement
                const dx = Math.abs(gesture.dx);
                const dy = Math.abs(gesture.dy);
                return dx > 40 && dx > dy * 2.5;
            },
            onMoveShouldSetPanResponderCapture: (_, gesture) => {
                if (disableSwipe) return false;
                const dx = Math.abs(gesture.dx);
                const dy = Math.abs(gesture.dy);
                return dx > 50 && dx > dy * 3;
            },
            onPanResponderRelease: (_, gesture) => {
                if (disableSwipe) return;
                if (gesture.dx < -55 && Math.abs(gesture.vx) > 0.18) {
                    handleSwipeLeft();
                } else if (gesture.dx > 55 && Math.abs(gesture.vx) > 0.18) {
                    handleSwipeRight();
                }
            },
            onPanResponderTerminationRequest: () => true,
        })
    ).current;

    return (
        <View style={[styles.container, style]} {...panResponder.panHandlers}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
