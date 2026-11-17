import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { useAuthStore } from '../store/authStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';

const REASONS: Record<string, { icon: any; title: string; text: string }> = {
    Chat: { icon: 'chatbubbles-outline', title: 'Message businesses', text: 'Sign in to chat with vendors and keep your conversations.' },
    WriteReview: { icon: 'star-outline', title: 'Write a review', text: 'Sign in to share your experience with this business.' },
    Cart: { icon: 'cart-outline', title: 'Your saved cart', text: 'Sign in to save items and order from vendors.' },
    CallScreen: { icon: 'call-outline', title: 'Call in the app', text: 'Sign in to call vendors directly from Pointer.' },
    Call: { icon: 'call-outline', title: 'Call in the app', text: 'Sign in to call vendors directly from Pointer.' },
    CreatePost: { icon: 'create-outline', title: 'Post to Pointer', text: 'Sign in to share updates and ask the community.' },
    Account: { icon: 'person-circle-outline', title: 'Your Pointer account', text: 'Sign in or create a free account to save favourites, chat with vendors, write reviews and more.' },
};

/**
 * Shown to guests in place of screens that need an account. Guests can browse the feed,
 * vendors and the map freely; personal features lead here.
 */
export default function SignInRequiredScreen({ route }: any) {
    const { colors } = useTheme();
    const requestSignIn = useAuthStore(s => s.requestSignIn);
    const reason = REASONS[route?.name] || REASONS.Account;

    return (
        <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.iconCircle, { backgroundColor: colors.surfaceLight }]}>
                <Ionicons name={reason.icon} size={44} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">{reason.title}</Text>
            <Text style={[styles.text, { color: colors.textSecondary }]}>{reason.text}</Text>

            <TouchableOpacity
                style={[styles.primary, { backgroundColor: colors.primary }]}
                onPress={() => requestSignIn('Login')}
                accessibilityRole="button"
            >
                <Text style={[styles.primaryText, { color: colors.textInverse }]}>Sign in</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.secondary, { borderColor: colors.primary }]}
                onPress={() => requestSignIn('Register')}
                accessibilityRole="button"
            >
                <Text style={[styles.secondaryText, { color: colors.primary }]}>Create a free account</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
    iconCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg },
    title: { fontSize: FONT_SIZES.xl, fontWeight: '700', textAlign: 'center' },
    text: { fontSize: FONT_SIZES.md, textAlign: 'center', marginTop: SPACING.sm, maxWidth: 360, lineHeight: 22 },
    primary: { marginTop: SPACING.xl, width: '100%', maxWidth: 360, minHeight: 48, borderRadius: BORDER_RADIUS.md, alignItems: 'center', justifyContent: 'center' },
    primaryText: { fontSize: FONT_SIZES.md, fontWeight: '700' },
    secondary: { marginTop: SPACING.md, width: '100%', maxWidth: 360, minHeight: 48, borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { fontSize: FONT_SIZES.md, fontWeight: '700' },
});
