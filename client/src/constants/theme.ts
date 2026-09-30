// QIIRA Official Brand Color Palette (from qiiracolourshades.jpeg)
// WARM. BOLD. PREMIUM.
export const QIIRA_PALETTE = {
    base: '#B28A45',      // Base Colour (Warm Gold Ochre) - RGB(178, 138, 69)
    tint80: '#F3E6C8',    // Tint 80% (Light Warm Silk/Cream)
    tint60: '#E8D2A6',    // Tint 60% (Champagne Sand)
    tint40: '#DCC185',    // Tint 40% (Warm Muted Gold)
    tint20: '#CFA964',    // Tint 20% (Bright Amber Gold)
    shade20: '#8E6E37',   // Shade 20% (Deep Antique Bronze Gold)
    shade40: '#6A5329',   // Shade 40% (Dark Walnut Bronze)
    shade60: '#46371C',   // Shade 60% (Deep Espresso Bronze)
};

export const lightColors = {
    primary: QIIRA_PALETTE.base,          // #B28A45 - Warm Gold Ochre
    primaryDark: QIIRA_PALETTE.shade20,   // #8E6E37 - Deep Bronze
    primaryLight: QIIRA_PALETTE.tint20,   // #CFA964 - Bright Amber Gold
    primaryLighter: QIIRA_PALETTE.tint40, // #DCC185 - Warm Muted Gold
    primaryMuted: QIIRA_PALETTE.tint60,   // #E8D2A6 - Champagne Sand
    primarySubtle: QIIRA_PALETTE.tint80,  // #F3E6C8 - Light Warm Silk
    primaryDeep: QIIRA_PALETTE.shade40,   // #6A5329 - Dark Walnut Bronze
    primaryDarkest: QIIRA_PALETTE.shade60,// #46371C - Deep Espresso Bronze
    accent: '#FF6B6B',
    accentDark: '#E05555',
    accentLight: '#FF8888',
    background: '#FAF8F5',                // Warm luxury ivory cream background
    surface: '#FFFFFF',
    surfaceLight: '#F6F0E6',              // Warm tinted luxury surface
    textPrimary: '#1A1A1A',
    textSecondary: '#666666',
    textTertiary: '#999999',
    textInverse: '#FFFFFF',
    success: '#4CAF50',
    warning: '#FFC107',
    error: '#F44336',
    info: '#2196F3',
    border: '#E8DCC9',                    // Warm golden-ivory border
    borderLight: QIIRA_PALETTE.tint80,    // #F3E6C8
    overlay: 'rgba(70, 55, 28, 0.55)',
    overlayLight: 'rgba(70, 55, 28, 0.3)',
};

export const darkColors = {
    primary: QIIRA_PALETTE.tint20,        // #CFA964 - Radiant Amber Gold on dark surfaces
    primaryDark: QIIRA_PALETTE.base,      // #B28A45 - Base Gold Ochre
    primaryLight: QIIRA_PALETTE.tint40,   // #DCC185
    primaryLighter: QIIRA_PALETTE.tint60, // #E8D2A6
    primaryMuted: QIIRA_PALETTE.tint80,   // #F3E6C8
    primarySubtle: QIIRA_PALETTE.tint80,  // #F3E6C8
    primaryDeep: QIIRA_PALETTE.shade20,   // #8E6E37
    primaryDarkest: QIIRA_PALETTE.shade60,// #46371C
    accent: '#FF6B6B',
    accentDark: '#E05555',
    accentLight: '#FF8888',
    background: '#181510',                // Deep warm espresso luxury dark background
    surface: '#241E16',                   // Rich warm dark surface
    surfaceLight: '#332A1F',              // Elevated surface
    textPrimary: '#FFFFFF',
    textSecondary: '#C8BDB0',
    textTertiary: '#8C8275',
    textInverse: '#181510',
    success: '#81C784',
    warning: '#FFD54F',
    error: '#E57373',
    info: '#64B5F6',
    border: QIIRA_PALETTE.shade60,        // #46371C
    borderLight: QIIRA_PALETTE.shade40,   // #6A5329
    overlay: 'rgba(0, 0, 0, 0.75)',
    overlayLight: 'rgba(0, 0, 0, 0.5)',
};

// Keep COLORS pointing to lightColors temporarily so we don't break the app
// while refactoring components
export const COLORS = lightColors;

export const SPACING = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
};

export const FONTS = {
    regular: 'System',
    medium: 'System',
    bold: 'System',
    semiBold: 'System',
};

export const FONT_SIZES = {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 24,
    xxl: 32,
    xxxl: 40,
};

export const BORDER_RADIUS = {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    round: 9999,
};

export const SHADOWS = {
    small: {
        shadowColor: '#46371C',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    medium: {
        shadowColor: '#46371C',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 4,
    },
    large: {
        shadowColor: '#46371C',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 16,
        elevation: 8,
    },
};
