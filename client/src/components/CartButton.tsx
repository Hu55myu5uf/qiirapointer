import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useCartStore } from '../store/cartStore';
import { useTheme } from '../context/ThemeContext';
import { FONT_SIZES, BORDER_RADIUS } from '../constants/theme';

interface CartButtonProps {
    color?: string;
    size?: number;
    onPress?: () => void;
}

export default function CartButton({ color, size = 24, onPress }: CartButtonProps) {
    const navigation: any = useNavigation();
    const { colors } = useTheme();
    const { totalItems } = useCartStore();

    const iconColor = color || colors.textPrimary;

    return (
        <TouchableOpacity
            style={styles.container}
            onPress={onPress || (() => navigation.navigate('Cart'))}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
            <Ionicons name="cart-outline" size={size} color={iconColor} />
            {totalItems > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.badgeText}>
                        {totalItems > 99 ? '99+' : totalItems}
                    </Text>
                </View>
            ) : null}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        padding: 4,
    },
    badge: {
        position: 'absolute',
        top: 0,
        right: 0,
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 3,
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 9,
        fontWeight: 'bold',
    },
});
