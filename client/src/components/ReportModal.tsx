import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Alert,
    ScrollView,
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { moderationAPI } from '../services/api';
import { auth } from '../config/firebase';

export interface ReportModalProps {
    visible: boolean;
    onClose: () => void;
    targetType: 'post' | 'comment' | 'user' | 'vendor';
    targetId: string;
    targetUserId?: string;
    targetTitle?: string;
    onSuccess?: () => void;
}

const REPORT_REASONS = [
    { id: 'inappropriate', label: 'Inappropriate or offensive content' },
    { id: 'spam', label: 'Spam, scam, or misleading information' },
    { id: 'harassment', label: 'Harassment, bullying, or hate speech' },
    { id: 'fake', label: 'Fake profile, store, or impersonation' },
    { id: 'fraud', label: 'Fraudulent transaction or payment issue' },
    { id: 'copyright', label: 'Intellectual property or copyright violation' },
    { id: 'other', label: 'Other violation' }
];

export default function ReportModal({
    visible,
    onClose,
    targetType,
    targetId,
    targetUserId,
    targetTitle,
    onSuccess,
}: ReportModalProps) {
    const { colors } = useTheme();
    const [selectedReason, setSelectedReason] = useState<string>(REPORT_REASONS[0].label);
    const [details, setDetails] = useState('');
    const [loading, setLoading] = useState(false);

    const typeLabel = targetType === 'vendor' ? 'Business' : targetType === 'post' ? 'Post' : targetType === 'comment' ? 'Comment' : 'User';

    const handleSubmit = async () => {
        if (!selectedReason) {
            Alert.alert('Required', 'Please select a reason for your report.');
            return;
        }

        setLoading(true);
        try {
            await moderationAPI.reportContent({
                targetType,
                targetId,
                targetUserId,
                targetTitle,
                reason: selectedReason,
                details: details.trim(),
                reporterId: auth.currentUser?.uid,
                reporterEmail: auth.currentUser?.email || undefined,
            });

            Alert.alert(
                'Report Submitted 🛡️',
                'Thank you for helping keep the QIIRA community safe. Our moderation team reviews every reported item within 24 hours and takes appropriate enforcement action.',
                [
                    {
                        text: 'OK',
                        onPress: () => {
                            setDetails('');
                            onClose();
                            if (onSuccess) onSuccess();
                        }
                    }
                ]
            );
        } catch (error: any) {
            console.error('Report submission error:', error);
            const msg = error.response?.data?.message || error.message || 'Failed to submit report. Please try again.';
            Alert.alert('Error', msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={[styles.container, { backgroundColor: colors.surface }]}>
                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: colors.border }]}>
                        <View style={styles.titleRow}>
                            <Ionicons name="shield-outline" size={24} color="#D9534F" style={{ marginRight: 8 }} />
                            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                                Report {typeLabel}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close" size={24} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                        {targetTitle ? (
                            <View style={[styles.targetBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                <Text style={[styles.targetLabel, { color: colors.textSecondary }]}>Reporting:</Text>
                                <Text style={[styles.targetTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                                    {targetTitle}
                                </Text>
                            </View>
                        ) : null}

                        <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>
                            Why are you reporting this {typeLabel.toLowerCase()}?
                        </Text>

                        {/* Reasons */}
                        {REPORT_REASONS.map((r) => {
                            const isSelected = selectedReason === r.label;
                            return (
                                <TouchableOpacity
                                    key={r.id}
                                    style={[
                                        styles.reasonOption,
                                        {
                                            borderColor: isSelected ? '#B28A45' : colors.border,
                                            backgroundColor: isSelected ? 'rgba(178, 138, 69, 0.08)' : colors.background
                                        }
                                    ]}
                                    onPress={() => setSelectedReason(r.label)}
                                >
                                    <View style={[
                                        styles.radioOuter,
                                        { borderColor: isSelected ? '#B28A45' : colors.border }
                                    ]}>
                                        {isSelected && <View style={[styles.radioInner, { backgroundColor: '#B28A45' }]} />}
                                    </View>
                                    <Text style={[styles.reasonText, { color: colors.textPrimary, fontWeight: isSelected ? '600' : '400' }]}>
                                        {r.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}

                        {/* Additional Details */}
                        <Text style={[styles.sectionLabel, { color: colors.textPrimary, marginTop: SPACING.md }]}>
                            Additional Details (Optional)
                        </Text>
                        <TextInput
                            style={[
                                styles.textInput,
                                {
                                    backgroundColor: colors.background,
                                    color: colors.textPrimary,
                                    borderColor: colors.border
                                }
                            ]}
                            placeholder="Provide any additional context or details..."
                            placeholderTextColor={colors.textTertiary}
                            multiline
                            numberOfLines={4}
                            maxLength={500}
                            value={details}
                            onChangeText={setDetails}
                        />

                        <Text style={[styles.disclaimer, { color: colors.textTertiary }]}>
                            False or abusive reporting violates QIIRA Terms of Service. Reports are reviewed by our safety team within 24 hours.
                        </Text>
                    </ScrollView>

                    {/* Footer */}
                    <View style={[styles.footer, { borderTopColor: colors.border }]}>
                        <TouchableOpacity
                            style={[styles.cancelBtn, { borderColor: colors.border }]}
                            onPress={onClose}
                            disabled={loading}
                        >
                            <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.submitBtn, { backgroundColor: '#D9534F' }]}
                            onPress={handleSubmit}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                                <Text style={styles.submitBtnText}>Submit Report</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        justifyContent: 'flex-end',
    },
    container: {
        maxHeight: '85%',
        borderTopLeftRadius: BORDER_RADIUS.xl || 20,
        borderTopRightRadius: BORDER_RADIUS.xl || 20,
        paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.md,
        borderBottomWidth: 1,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: FONT_SIZES.lg,
        fontWeight: 'bold',
    },
    body: {
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.md,
    },
    targetBox: {
        padding: SPACING.sm,
        borderRadius: BORDER_RADIUS.sm,
        borderWidth: 1,
        marginBottom: SPACING.md,
    },
    targetLabel: {
        fontSize: FONT_SIZES.xs,
        fontWeight: '600',
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    targetTitle: {
        fontSize: FONT_SIZES.sm,
        fontWeight: '500',
    },
    sectionLabel: {
        fontSize: FONT_SIZES.sm,
        fontWeight: '600',
        marginBottom: SPACING.xs,
    },
    reasonOption: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: SPACING.md,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        marginBottom: 8,
    },
    radioOuter: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: SPACING.sm,
    },
    radioInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    reasonText: {
        fontSize: FONT_SIZES.sm,
        flex: 1,
    },
    textInput: {
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        padding: SPACING.sm,
        fontSize: FONT_SIZES.sm,
        minHeight: 80,
        textAlignVertical: 'top',
    },
    disclaimer: {
        fontSize: FONT_SIZES.xs,
        lineHeight: 16,
        marginTop: SPACING.md,
        marginBottom: SPACING.lg,
    },
    footer: {
        flexDirection: 'row',
        paddingHorizontal: SPACING.lg,
        paddingTop: SPACING.md,
        borderTopWidth: 1,
        gap: SPACING.md,
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: BORDER_RADIUS.md,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelBtnText: {
        fontSize: FONT_SIZES.md,
        fontWeight: '600',
    },
    submitBtn: {
        flex: 1.5,
        paddingVertical: 12,
        borderRadius: BORDER_RADIUS.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitBtnText: {
        color: '#FFFFFF',
        fontSize: FONT_SIZES.md,
        fontWeight: 'bold',
    },
});
