import React from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Dimensions,
    Platform,
    TouchableWithoutFeedback,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { useAlertStore, ThemedAlertButton, AlertType } from '../store/alertStore';
import { SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';

const { width } = Dimensions.get('window');

export default function ThemedAlertModal() {
    const { colors, theme } = useTheme();
    const currentAlert = useAlertStore((state) => state.currentAlert);
    const hideAlert = useAlertStore((state) => state.hideAlert);

    if (!currentAlert) return null;

    const { title, message, type, buttons, cancelable } = currentAlert;

    const handleButtonPress = async (btn: ThemedAlertButton) => {
        hideAlert();
        if (btn.onPress) {
            try {
                await btn.onPress();
            } catch (e) {
                console.error('Alert button onPress error:', e);
            }
        }
    };

    const getIconConfig = (alertType: AlertType) => {
        switch (alertType) {
            case 'success':
                return {
                    name: 'checkmark-circle' as const,
                    color: '#10B981',
                    bg: 'rgba(16, 185, 129, 0.15)',
                    borderColor: 'rgba(16, 185, 129, 0.3)',
                };
            case 'error':
                return {
                    name: 'alert-circle' as const,
                    color: colors.error || '#EF4444',
                    bg: 'rgba(239, 68, 68, 0.15)',
                    borderColor: 'rgba(239, 68, 68, 0.3)',
                };
            case 'warning':
                return {
                    name: 'warning' as const,
                    color: '#F59E0B',
                    bg: 'rgba(245, 158, 11, 0.15)',
                    borderColor: 'rgba(245, 158, 11, 0.3)',
                };
            case 'confirm':
                return {
                    name: 'help-circle' as const,
                    color: colors.primary,
                    bg: theme === 'dark' ? 'rgba(202, 138, 4, 0.2)' : 'rgba(202, 138, 4, 0.12)',
                    borderColor: colors.primaryLight || 'rgba(202, 138, 4, 0.3)',
                };
            case 'info':
            default:
                return {
                    name: 'information-circle' as const,
                    color: colors.primary,
                    bg: theme === 'dark' ? 'rgba(202, 138, 4, 0.2)' : 'rgba(202, 138, 4, 0.12)',
                    borderColor: colors.primaryLight || 'rgba(202, 138, 4, 0.3)',
                };
        }
    };

    const iconConfig = getIconConfig(type);
    const styles = getStyles(colors, theme);

    const isHorizontal = buttons.length === 2 && buttons.every((b) => b.text.length <= 12);

    return (
        <Modal
            visible={!!currentAlert}
            transparent
            animationType="fade"
            onRequestClose={() => {
                if (cancelable) hideAlert();
            }}
        >
            <TouchableWithoutFeedback
                onPress={() => {
                    if (cancelable) hideAlert();
                }}
            >
                <View style={styles.overlay}>
                    <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                        <View style={styles.card}>
                            {/* Close / Back button at top-right */}
                            {cancelable && (
                                <TouchableOpacity
                                    style={styles.closeIconBtn}
                                    onPress={hideAlert}
                                    activeOpacity={0.7}
                                    hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                                >
                                    <Ionicons name="close" size={20} color={colors.textTertiary} />
                                </TouchableOpacity>
                            )}

                            {/* Icon Header */}
                            <View
                                style={[
                                    styles.iconContainer,
                                    {
                                        backgroundColor: iconConfig.bg,
                                        borderColor: iconConfig.borderColor,
                                    },
                                ]}
                            >
                                <Ionicons name={iconConfig.name} size={36} color={iconConfig.color} />
                            </View>

                            {/* Title */}
                            {title ? <Text style={styles.title}>{title}</Text> : null}

                            {/* Message Body */}
                            {message ? <Text style={styles.message}>{message}</Text> : null}

                            {/* Action Buttons */}
                            <View
                                style={[
                                    styles.buttonContainer,
                                    isHorizontal ? styles.buttonRow : styles.buttonColumn,
                                ]}
                            >
                                {buttons.map((btn, index) => {
                                    const isCancel = btn.style === 'cancel' || btn.text.toLowerCase() === 'cancel' || btn.text.toLowerCase() === 'back';
                                    const isDestructive = btn.style === 'destructive' || btn.text.toLowerCase().includes('delete') || btn.text.toLowerCase().includes('remove');

                                    let buttonStyle: any = styles.primaryButton;
                                    let textStyle: any = styles.primaryButtonText;

                                    if (isCancel) {
                                        buttonStyle = styles.cancelButton;
                                        textStyle = styles.cancelButtonText;
                                    } else if (isDestructive) {
                                        buttonStyle = styles.destructiveButton;
                                        textStyle = styles.destructiveButtonText;
                                    }

                                    return (
                                        <TouchableOpacity
                                            key={`${index}_${btn.text}`}
                                            style={[
                                                styles.buttonBase,
                                                buttonStyle,
                                                isHorizontal && { flex: 1 },
                                            ]}
                                            onPress={() => handleButtonPress(btn)}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={[styles.buttonTextBase, textStyle]}>
                                                {btn.text}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

const getStyles = (colors: any, theme: string) =>
    StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: SPACING.lg,
            zIndex: 9999,
        },
        card: {
            width: '100%',
            maxWidth: 380,
            backgroundColor: colors.surface,
            borderRadius: BORDER_RADIUS.xl,
            padding: SPACING.xl,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : colors.border,
            ...SHADOWS.large,
            elevation: 10,
        },
        closeIconBtn: {
            position: 'absolute',
            top: SPACING.md,
            right: SPACING.md,
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
        },
        iconContainer: {
            width: 68,
            height: 68,
            borderRadius: 34,
            borderWidth: 1.5,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: SPACING.md,
            marginTop: SPACING.xs,
        },
        title: {
            fontSize: FONT_SIZES.lg,
            fontWeight: 'bold',
            color: colors.textPrimary,
            textAlign: 'center',
            marginBottom: SPACING.xs,
            paddingHorizontal: SPACING.sm,
        },
        message: {
            fontSize: FONT_SIZES.md,
            color: colors.textSecondary,
            textAlign: 'center',
            lineHeight: 22,
            marginBottom: SPACING.lg,
            paddingHorizontal: SPACING.xs,
        },
        buttonContainer: {
            width: '100%',
            marginTop: SPACING.xs,
        },
        buttonRow: {
            flexDirection: 'row',
            gap: SPACING.sm,
        },
        buttonColumn: {
            flexDirection: 'column',
            gap: SPACING.sm,
        },
        buttonBase: {
            paddingVertical: SPACING.md,
            paddingHorizontal: SPACING.lg,
            borderRadius: BORDER_RADIUS.lg,
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 46,
        },
        buttonTextBase: {
            fontSize: FONT_SIZES.md,
            fontWeight: '600',
        },
        primaryButton: {
            backgroundColor: colors.primary,
        },
        primaryButtonText: {
            color: colors.textInverse || '#000000',
            fontWeight: 'bold',
        },
        cancelButton: {
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: colors.border,
        },
        cancelButtonText: {
            color: colors.textPrimary,
            fontWeight: '600',
        },
        destructiveButton: {
            backgroundColor: colors.error || '#EF4444',
        },
        destructiveButtonText: {
            color: '#FFFFFF',
            fontWeight: 'bold',
        },
    });
