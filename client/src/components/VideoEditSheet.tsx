import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Switch, ActivityIndicator, ScrollView } from 'react-native';
import Slider from '@react-native-community/slider';
import { useVideoPlayer, VideoView } from 'expo-video';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from './CachedImage';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { videoFrame, MAX_VIDEO_SECONDS } from '../utils/videoUpload';

export type VideoEdits = {
    start: number;          // seconds
    end: number | null;     // seconds; null = play to the end
    muted: boolean;         // play without the original sound
    coverTime: number;      // seconds
    coverUri: string | null;
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const MIN_CLIP = 1;

/**
 * Basic video editing before posting: trim, choose the cover frame, mute the original sound.
 * Nothing is re-encoded on the phone; the edits are saved with the post and applied when it plays.
 */
export default function VideoEditSheet({
    visible,
    uri,
    durationSeconds,
    initial,
    onCancel,
    onDone,
}: {
    visible: boolean;
    uri: string;
    durationSeconds: number;
    initial: VideoEdits;
    onCancel: () => void;
    onDone: (edits: VideoEdits) => void;
}) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => getStyles(colors), [colors]);

    const [duration, setDuration] = useState(Math.max(durationSeconds || 0, 0));
    const [start, setStart] = useState(initial.start);
    const [end, setEnd] = useState<number>(initial.end ?? Math.min(duration || MAX_VIDEO_SECONDS, MAX_VIDEO_SECONDS));
    const [muted, setMuted] = useState(initial.muted);
    const [coverTime, setCoverTime] = useState(initial.coverTime);
    const [coverUri, setCoverUri] = useState<string | null>(initial.coverUri);
    const [coverLoading, setCoverLoading] = useState(false);

    const player = useVideoPlayer(uri, (p) => {
        p.loop = false;
        p.muted = initial.muted;
        p.timeUpdateEventInterval = 0.25;
    });

    // Learn the real duration once the video has loaded (the picker doesn't always report it)
    useEffect(() => {
        const sub = player.addListener('sourceLoad', ({ duration: d }) => {
            if (d && d > 0) {
                setDuration(d);
                setEnd(prev => (prev && prev <= d ? prev : Math.min(d, MAX_VIDEO_SECONDS)));
            }
        });
        return () => sub.remove();
    }, [player]);

    // Preview loops the trimmed part only
    const range = useRef({ start, end });
    range.current = { start, end };
    useEffect(() => {
        const sub = player.addListener('timeUpdate', ({ currentTime }) => {
            if (currentTime >= range.current.end || currentTime < range.current.start - 0.5) {
                player.currentTime = range.current.start;
            }
        });
        const ended = player.addListener('playToEnd', () => {
            player.currentTime = range.current.start;
            player.play();
        });
        return () => { sub.remove(); ended.remove(); };
    }, [player]);

    useEffect(() => {
        try { player.muted = muted; } catch (_) {}
    }, [player, muted]);

    useEffect(() => {
        if (!visible) { try { player.pause(); } catch (_) {} return; }
        try { player.currentTime = start; player.play(); } catch (_) {}
    }, [visible]);

    const total = Math.max(duration, MIN_CLIP);
    const clipLength = Math.max(0, end - start);
    const tooLong = clipLength > MAX_VIDEO_SECONDS;

    const pickCover = async (t: number) => {
        setCoverLoading(true);
        const frame = await videoFrame(uri, t);
        if (frame) setCoverUri(frame);
        setCoverLoading(false);
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
            <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={onCancel} accessibilityRole="button" style={styles.headerBtn}>
                        <Text style={styles.cancel}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Edit video</Text>
                    <TouchableOpacity
                        onPress={() => onDone({ start, end: end >= total - 0.25 ? null : end, muted, coverTime, coverUri })}
                        disabled={tooLong}
                        accessibilityRole="button"
                        style={styles.headerBtn}
                    >
                        <Text style={[styles.done, tooLong && { opacity: 0.4 }]}>Done</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.previewBox}>
                    <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
                    <TouchableOpacity
                        style={styles.muteChip}
                        onPress={() => setMuted(m => !m)}
                        accessibilityRole="button"
                        accessibilityLabel={muted ? 'Turn original sound on' : 'Mute original sound'}
                    >
                        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.controls}>
                    <View style={styles.section}>
                        <View style={styles.rowBetween}>
                            <Text style={styles.label}>Trim</Text>
                            <Text style={[styles.value, tooLong && { color: colors.error }]}>
                                {fmt(start)} – {fmt(end)} · {Math.round(clipLength)}s
                            </Text>
                        </View>
                        <Text style={styles.hint}>Start</Text>
                        <Slider
                            minimumValue={0}
                            maximumValue={total}
                            value={start}
                            onValueChange={(v) => setStart(Math.min(v, end - MIN_CLIP))}
                            onSlidingComplete={(v) => { try { player.currentTime = Math.min(v, end - MIN_CLIP); } catch (_) {} }}
                            minimumTrackTintColor={colors.primary}
                            maximumTrackTintColor={colors.border}
                            thumbTintColor={colors.primary}
                            accessibilityLabel="Trim start"
                        />
                        <Text style={styles.hint}>End</Text>
                        <Slider
                            minimumValue={0}
                            maximumValue={total}
                            value={end}
                            onValueChange={(v) => setEnd(Math.max(v, start + MIN_CLIP))}
                            minimumTrackTintColor={colors.primary}
                            maximumTrackTintColor={colors.border}
                            thumbTintColor={colors.primary}
                            accessibilityLabel="Trim end"
                        />
                        {tooLong ? (
                            <Text style={[styles.hint, { color: colors.error }]}>Clips can be up to {MAX_VIDEO_SECONDS} seconds. Move the start or end.</Text>
                        ) : null}
                    </View>

                    <View style={styles.section}>
                        <View style={styles.rowBetween}>
                            <Text style={styles.label}>Cover</Text>
                            <Text style={styles.value}>{fmt(coverTime)}</Text>
                        </View>
                        <View style={styles.coverRow}>
                            <View style={styles.coverThumb}>
                                {coverUri ? <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                                {coverLoading ? <ActivityIndicator color={colors.primary} /> : null}
                            </View>
                            <View style={{ flex: 1 }}>
                                <Slider
                                    minimumValue={0}
                                    maximumValue={total}
                                    value={coverTime}
                                    onValueChange={setCoverTime}
                                    onSlidingComplete={pickCover}
                                    minimumTrackTintColor={colors.primary}
                                    maximumTrackTintColor={colors.border}
                                    thumbTintColor={colors.primary}
                                    accessibilityLabel="Cover frame"
                                />
                                <Text style={styles.hint}>Slide to choose the picture people see before the video plays.</Text>
                            </View>
                        </View>
                    </View>

                    <View style={[styles.section, styles.rowBetween]}>
                        <View style={{ flex: 1, paddingRight: SPACING.md }}>
                            <Text style={styles.label}>Mute original sound</Text>
                            <Text style={styles.hint}>The video plays silently in the feed.</Text>
                        </View>
                        <Switch
                            value={muted}
                            onValueChange={setMuted}
                            trackColor={{ false: colors.border, true: colors.primaryLight }}
                            thumbColor={muted ? colors.primary : colors.surface}
                        />
                    </View>
                </ScrollView>
            </View>
        </Modal>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerBtn: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
    title: { fontSize: FONT_SIZES.md, fontWeight: '700', color: colors.textPrimary },
    cancel: { fontSize: FONT_SIZES.md, color: colors.textSecondary },
    done: { fontSize: FONT_SIZES.md, fontWeight: '700', color: colors.primary, textAlign: 'right' },
    previewBox: { width: '100%', maxWidth: 520, alignSelf: 'center', aspectRatio: 9 / 12, maxHeight: 420, backgroundColor: '#000' },
    muteChip: { position: 'absolute', right: SPACING.sm, bottom: SPACING.sm, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
    controls: { padding: SPACING.md, gap: SPACING.md, width: '100%', maxWidth: 640, alignSelf: 'center' },
    section: { backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: colors.border, padding: SPACING.md },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    label: { fontSize: FONT_SIZES.md, fontWeight: '700', color: colors.textPrimary },
    value: { fontSize: FONT_SIZES.sm, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
    hint: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
    coverRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.sm },
    coverThumb: { width: 64, height: 96, borderRadius: BORDER_RADIUS.sm, overflow: 'hidden', backgroundColor: colors.surfaceLight || colors.border, alignItems: 'center', justifyContent: 'center' },
});
