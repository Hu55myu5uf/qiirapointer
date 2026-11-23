import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { usersAPI } from '../services/api';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';

/**
 * Shows your @username with a Change button. Changing checks availability as you type and
 * explains the once-every-30-days rule. Saving is separate from the rest of the profile form.
 */
export default function UsernameEditor({
    username,
    onChanged,
}: {
    username?: string | null;
    onChanged?: (username: string) => void;
}) {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(username || '');
    const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
    const [checking, setChecking] = useState(false);
    const [saving, setSaving] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { if (!editing) setValue(username || ''); }, [username, editing]);

    const clean = value.trim().replace(/^@+/, '').toLowerCase();
    const unchanged = clean === (username || '');

    useEffect(() => {
        if (!editing) return;
        if (timer.current) clearTimeout(timer.current);
        if (!clean || unchanged) { setStatus(null); return; }
        setChecking(true);
        timer.current = setTimeout(async () => {
            try {
                const res = await usersAPI.checkUsername(clean);
                setStatus(res.data?.available ? { ok: true, text: 'Available' } : { ok: false, text: res.data?.reason || 'Not available' });
            } catch {
                setStatus(null);
            } finally {
                setChecking(false);
            }
        }, 400);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [clean, editing, unchanged]);

    const save = async () => {
        if (!clean || unchanged || saving) return;
        setSaving(true);
        try {
            const res = await usersAPI.setUsername(clean);
            onChanged?.(res.data?.username || clean);
            setEditing(false);
            setStatus(null);
        } catch (e: any) {
            setStatus({ ok: false, text: e?.response?.data?.error || 'Could not change your username. Try again.' });
        } finally {
            setSaving(false);
        }
    };

    if (!editing) {
        return (
            <View style={styles.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.label}>Username</Text>
                    <Text style={styles.value} numberOfLines={1}>{username ? `@${username}` : 'Not set yet'}</Text>
                </View>
                <TouchableOpacity style={styles.smallButton} onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel="Change username">
                    <Text style={styles.smallButtonText}>Change</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.box}>
            <Text style={styles.label}>New username</Text>
            <View style={styles.inputRow}>
                <Text style={styles.at}>@</Text>
                <TextInput
                    style={styles.input}
                    value={value}
                    onChangeText={setValue}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    maxLength={31}
                    placeholder="your.name"
                    placeholderTextColor={colors.textTertiary}
                    accessibilityLabel="New username"
                />
                {checking ? <ActivityIndicator size="small" color={colors.primary} /> : status ? (
                    <Ionicons name={status.ok ? 'checkmark-circle' : 'close-circle'} size={20} color={status.ok ? colors.success : colors.error} />
                ) : null}
            </View>
            {status ? <Text style={[styles.hint, { color: status.ok ? colors.success : colors.error }]}>{status.text}</Text> : null}
            <Text style={styles.hint}>Letters, numbers, "." and "_". You can change it once every 30 days.</Text>
            <View style={styles.actions}>
                <TouchableOpacity onPress={() => { setEditing(false); setStatus(null); }} style={styles.textButton} accessibilityRole="button">
                    <Text style={styles.textButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={save}
                    disabled={!clean || unchanged || saving || status?.ok === false}
                    style={[styles.saveButton, (!clean || unchanged || status?.ok === false) && { opacity: 0.5 }]}
                    accessibilityRole="button"
                >
                    {saving ? <ActivityIndicator size="small" color={colors.textInverse} /> : <Text style={styles.saveButtonText}>Save</Text>}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm },
    label: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: colors.textSecondary, marginBottom: 2 },
    value: { fontSize: FONT_SIZES.md, fontWeight: '600', color: colors.textPrimary },
    smallButton: { paddingHorizontal: 14, minHeight: 36, justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceLight },
    smallButtonText: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
    box: { paddingVertical: SPACING.sm, gap: 6 },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceLight, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.md, minHeight: 44 },
    at: { fontSize: FONT_SIZES.md, fontWeight: '700', color: colors.textSecondary },
    input: { flex: 1, fontSize: FONT_SIZES.md, color: colors.textPrimary, paddingVertical: 8 },
    hint: { fontSize: 12, color: colors.textSecondary },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: SPACING.sm, marginTop: 4 },
    textButton: { paddingHorizontal: 12, minHeight: 40, justifyContent: 'center' },
    textButtonText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: colors.textSecondary },
    saveButton: { paddingHorizontal: 20, minHeight: 40, justifyContent: 'center', borderRadius: 20, backgroundColor: colors.primary },
    saveButtonText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: colors.textInverse },
});
