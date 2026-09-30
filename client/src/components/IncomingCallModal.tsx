import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Image,
    Animated,
    Dimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallStore } from '../store/callStore';
import { useTheme } from '../context/ThemeContext';
import { PLACEHOLDER_AVATARS } from '../assets';
import { SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { VerificationBadgeInline, AvatarVerificationBadge } from '../components/VerificationBadge';

const { width } = Dimensions.get('window');

interface IncomingCallModalProps {
    navigation?: any;
    onAcceptCall?: () => void;
}

export default function IncomingCallModal({ navigation, onAcceptCall }: IncomingCallModalProps) {
    const { colors } = useTheme();
    const { incomingCall, answerIncomingCall, rejectIncomingCall } = useCallStore();

    // Pulse animation for avatar ring
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (incomingCall) {
            const pulse = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.25,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                ])
            );
            pulse.start();
            return () => pulse.stop();
        }
    }, [incomingCall]);

    if (!incomingCall) return null;

    const isVerified = Boolean((incomingCall as any).isVerified);
    const isAdmin = (incomingCall as any).isAdmin || (incomingCall as any).role === 'admin';

    const handleAccept = async () => {
        await answerIncomingCall();
        if (onAcceptCall) {
            onAcceptCall();
        } else if (navigation) {
            navigation.navigate('CallScreen', {
                callId: incomingCall.id,
                callType: incomingCall.callType,
                otherUserId: incomingCall.callerId,
                otherUserName: incomingCall.callerName,
                otherUserAvatar: incomingCall.callerAvatar,
                isVerified,
                isAdmin,
                isIncoming: true,
            });
        }
    };

    const handleReject = async () => {
        await rejectIncomingCall();
    };

    return (
        <Modal
            visible={Boolean(incomingCall)}
            transparent
            animationType="slide"
            statusBarTranslucent
        >
            <View style={styles.overlay}>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
                    {/* Top Call Info */}
                    <View style={styles.header}>
                        <View style={styles.badge}>
                            <Ionicons
                                name={incomingCall.callType === 'video' ? 'videocam' : 'call'}
                                size={14}
                                color={colors.primary}
                            />
                            <Text style={[styles.badgeText, { color: colors.primary }]}>
                                Incoming {incomingCall.callType === 'video' ? 'Video' : 'Voice'} Call
                            </Text>
                        </View>
                    </View>

                    {/* Caller Avatar with Animated Pulse */}
                    <View style={styles.avatarWrapper}>
                        <Animated.View
                            style={[
                                styles.pulseRing,
                                {
                                    borderColor: colors.primary,
                                    transform: [{ scale: pulseAnim }],
                                },
                            ]}
                        />
                        <View style={{ position: 'relative' }}>
                            <Image
                                source={
                                    incomingCall.callerAvatar
                                        ? { uri: incomingCall.callerAvatar }
                                        : PLACEHOLDER_AVATARS.client
                                }
                                style={styles.avatar}
                            />
                            <AvatarVerificationBadge isVerified={isVerified} isAdmin={isAdmin} size={24} />
                        </View>
                    </View>

                    {/* Caller Name */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: SPACING.md }}>
                        <Text style={[styles.callerName, { color: colors.textPrimary, marginTop: 0 }]}>
                            {incomingCall.callerName || 'QIIRAPOINTER User'}
                        </Text>
                        <VerificationBadgeInline isVerified={isVerified} isAdmin={isAdmin} size={20} />
                    </View>
                    <Text style={[styles.callingSubtext, { color: colors.textSecondary }]}>
                        QIIRAPOINTER Online Call...
                    </Text>

                    {/* Action Buttons */}
                    <View style={styles.actionRow}>
                        {/* Decline */}
                        <TouchableOpacity
                            style={[styles.btnCircle, styles.btnDecline]}
                            onPress={handleReject}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="call-outline" size={28} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
                            <Text style={styles.btnLabel}>Decline</Text>
                        </TouchableOpacity>

                        {/* Accept */}
                        <TouchableOpacity
                            style={[styles.btnCircle, styles.btnAccept]}
                            onPress={handleAccept}
                            activeOpacity={0.8}
                        >
                            <Ionicons
                                name={incomingCall.callType === 'video' ? 'videocam' : 'call'}
                                size={28}
                                color="#FFFFFF"
                            />
                            <Text style={styles.btnLabel}>Accept</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: SPACING.lg,
    },
    card: {
        width: Math.min(width - 40, 360),
        borderRadius: 24,
        paddingVertical: 32,
        paddingHorizontal: 24,
        alignItems: 'center',
        borderWidth: 1.5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    header: {
        marginBottom: 20,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
        backgroundColor: 'rgba(212, 175, 55, 0.15)',
    },
    badgeText: {
        fontSize: 12,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    avatarWrapper: {
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    pulseRing: {
        position: 'absolute',
        width: 116,
        height: 116,
        borderRadius: 58,
        borderWidth: 2,
        opacity: 0.6,
    },
    avatar: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: '#222',
    },
    callerName: {
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 4,
        textAlign: 'center',
    },
    callingSubtext: {
        fontSize: 13,
        marginBottom: 32,
    },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        paddingHorizontal: 20,
    },
    btnCircle: {
        width: 68,
        height: 68,
        borderRadius: 34,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 6,
    },
    btnDecline: {
        backgroundColor: '#EF4444',
    },
    btnAccept: {
        backgroundColor: '#10B981',
    },
    btnLabel: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: 'bold',
        marginTop: 2,
    },
});
