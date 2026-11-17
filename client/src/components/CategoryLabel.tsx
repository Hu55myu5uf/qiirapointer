import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { FONT_SIZES } from '../constants/theme';
import { mainCategoryOf, subCategoryOf, categoryIconOf } from '../constants/categories';

/**
 * A vendor's category shown under their name, e.g.
 *   [icon] Journalist · Media, Content & Digital Creators
 * (categories are stored as "Main - Sub"). Shows a hint when no category is set yet.
 */
export default function CategoryLabel({ category, emptyText = 'No category yet' }: { category?: string | null; emptyText?: string }) {
    const { colors } = useTheme();
    const main = mainCategoryOf(category);
    const sub = subCategoryOf(category);

    if (!main) {
        return (
            <View style={styles.row}>
                <Ionicons name="pricetag-outline" size={14} color={colors.textSecondary} />
                <Text style={[styles.main, { color: colors.textSecondary, fontStyle: 'italic' }]}>{emptyText}</Text>
            </View>
        );
    }

    return (
        <View style={styles.row} accessible accessibilityLabel={`Category: ${sub ? `${sub}, ` : ''}${main}`}>
            <Ionicons name={categoryIconOf(category) as any} size={15} color={colors.primary} />
            <Text style={styles.textWrap} numberOfLines={2}>
                {sub ? (
                    <>
                        <Text style={[styles.sub, { color: colors.textPrimary }]}>{sub}</Text>
                        <Text style={{ color: colors.textSecondary }}>{'  ·  '}</Text>
                    </>
                ) : null}
                <Text style={[styles.main, { color: colors.textSecondary }]}>{main}</Text>
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
        marginBottom: 6,
    },
    textWrap: {
        flexShrink: 1,
        fontSize: FONT_SIZES.sm,
    },
    sub: {
        fontSize: FONT_SIZES.sm,
        fontWeight: '700',
    },
    main: {
        fontSize: FONT_SIZES.sm,
    },
});
