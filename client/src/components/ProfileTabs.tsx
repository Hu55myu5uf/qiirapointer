import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { FONT_SIZES, SPACING } from '../constants/theme';

export type ProfileTab<K extends string> = { key: K; label: string };

/**
 * Text tab bar for vendor profiles (Posts, Catalog, About us, Services, Docs, ...).
 * Tabs share the full width when they fit, and scroll sideways on narrow phones instead of
 * squashing or wrapping their labels.
 */
export default function ProfileTabs<K extends string>({
    tabs,
    active,
    onChange,
}: {
    tabs: ProfileTab<K>[];
    active: K;
    onChange: (key: K) => void;
}) {
    const { colors } = useTheme();
    return (
        <View style={[styles.bar, { borderBottomColor: colors.border }]}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.content}
                accessibilityRole="tablist"
            >
                {tabs.map(tab => {
                    const selected = tab.key === active;
                    return (
                        <TouchableOpacity
                            key={tab.key}
                            onPress={() => onChange(tab.key)}
                            style={[styles.tab, { borderBottomColor: selected ? colors.primary : 'transparent' }]}
                            accessibilityRole="tab"
                            accessibilityState={{ selected }}
                            activeOpacity={0.7}
                        >
                            <Text
                                numberOfLines={1}
                                style={[
                                    styles.label,
                                    { color: selected ? colors.primary : colors.textSecondary, fontWeight: selected ? '700' : '600' },
                                ]}
                            >
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    bar: {
        borderBottomWidth: 1,
        marginBottom: SPACING.md,
    },
    content: {
        flexGrow: 1,
    },
    tab: {
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 46,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: 3,
    },
    label: {
        fontSize: FONT_SIZES.sm,
    },
});
