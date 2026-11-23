import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, StyleProp, TextStyle } from 'react-native';
import { Image } from './CachedImage';
import { useTheme } from '../context/ThemeContext';
import { usersAPI } from '../services/api';
import { VerificationBadgeInline } from './VerificationBadge';
import { PLACEHOLDER_AVATARS } from '../assets';

export type Mention = { uid: string; username: string };

/** Open the profile of an @mentioned person (store page for vendors). */
export async function openMentionedProfile(navigation: any, m: Mention) {
    try {
        const res = await usersAPI.byUsername(m.username);
        const { uid, role, name } = res.data || {};
        if (!uid) throw new Error('not found');
        if (role === 'vendor') navigation.navigate('VendorDetails', { vendorId: uid });
        else navigation.navigate('UserProfileView', { userId: uid, userName: name });
    } catch {
        Alert.alert('Profile unavailable', `@${m.username} could not be found.`);
    }
}

/**
 * Text with @mentions highlighted and tappable. Only names the server confirmed (`mentions`)
 * become links; any other "@word" stays plain text.
 */
export function MentionText({
    text,
    mentions,
    navigation,
    style,
    numberOfLines,
    prefix,
}: {
    text: string;
    mentions?: Mention[] | null;
    navigation: any;
    style?: StyleProp<TextStyle>;
    numberOfLines?: number;
    prefix?: React.ReactNode;
}) {
    const { colors } = useTheme();
    const known = useMemo(() => new Map((mentions || []).map(m => [m.username.toLowerCase(), m])), [mentions]);
    const parts = useMemo(() => {
        const out: { text: string; mention?: Mention }[] = [];
        const re = /(^|[^A-Za-z0-9_.@])@([A-Za-z0-9._]{3,31})/g;
        let last = 0;
        let m: RegExpExecArray | null;
        const src = String(text || '');
        while ((m = re.exec(src))) {
            const name = m[2].toLowerCase().replace(/\.+$/, '');
            const hit = known.get(name);
            if (!hit) continue;
            const start = m.index + m[1].length;
            if (start > last) out.push({ text: src.slice(last, start) });
            out.push({ text: '@' + m[2].replace(/\.+$/, ''), mention: hit });
            last = start + 1 + m[2].replace(/\.+$/, '').length;
        }
        if (last < src.length) out.push({ text: src.slice(last) });
        return out;
    }, [text, known]);

    return (
        <Text style={style} numberOfLines={numberOfLines}>
            {prefix}
            {parts.map((p, i) =>
                p.mention ? (
                    <Text
                        key={i}
                        style={{ color: colors.primary, fontWeight: '700' }}
                        onPress={() => openMentionedProfile(navigation, p.mention!)}
                        accessibilityRole="link"
                    >
                        {p.text}
                    </Text>
                ) : (
                    <Text key={i}>{p.text}</Text>
                )
            )}
        </Text>
    );
}

/** The "@prefix" being typed at the end of `text`, or null */
export function activeMentionQuery(text: string): string | null {
    const m = /(^|\s)@([A-Za-z0-9._]{1,30})$/.exec(text);
    return m ? m[2] : null;
}

/**
 * Suggestions while typing "@na…" at the end of an input. Tapping one completes the name.
 * Render it next to the TextInput; it shows nothing when there's no "@" being typed.
 */
export function MentionSuggestions({
    text,
    onChangeText,
    max = 5,
}: {
    text: string;
    onChangeText: (t: string) => void;
    max?: number;
}) {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const query = activeMentionQuery(text);
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const seq = useRef(0);

    useEffect(() => {
        if (!query) { setResults([]); return; }
        const n = ++seq.current;
        setLoading(true);
        const t = setTimeout(async () => {
            try {
                const res = await usersAPI.search(query);
                if (n === seq.current) setResults((res.data?.users || []).slice(0, max));
            } catch {
                if (n === seq.current) setResults([]);
            } finally {
                if (n === seq.current) setLoading(false);
            }
        }, 250);
        return () => clearTimeout(t);
    }, [query, max]);

    if (!query || (!loading && results.length === 0)) return null;

    const pick = (username: string) => {
        onChangeText(text.replace(/@([A-Za-z0-9._]{1,30})$/, `@${username} `));
        setResults([]);
    };

    return (
        <View style={styles.box} accessibilityLabel="Mention suggestions">
            {loading && results.length === 0 ? (
                <ActivityIndicator style={{ padding: 10 }} color={colors.primary} />
            ) : (
                results.map(u => (
                    <TouchableOpacity key={u.uid} style={styles.row} onPress={() => pick(u.username)} accessibilityRole="button" accessibilityLabel={`Mention ${u.name}, @${u.username}`}>
                        <Image source={u.avatar ? { uri: u.avatar } : PLACEHOLDER_AVATARS.client} style={styles.avatar} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
                                <VerificationBadgeInline isVerified={Boolean(u.isVerified)} size={13} />
                            </View>
                            <Text style={styles.handle} numberOfLines={1}>@{u.username}</Text>
                        </View>
                    </TouchableOpacity>
                ))
            )}
        </View>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    box: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        marginVertical: 6,
        overflow: 'hidden',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceLight },
    name: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
    handle: { fontSize: 12, color: colors.textSecondary },
});
