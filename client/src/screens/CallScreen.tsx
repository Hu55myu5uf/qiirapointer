import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    Animated,
    Dimensions,
    StatusBar,
    SafeAreaView,
    Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallStore } from '../store/callStore';
import { useTheme } from '../context/ThemeContext';
import { PLACEHOLDER_AVATARS } from '../assets';
import { callAPI, authAPI, vendorAPI } from '../services/api';
import { VerificationBadgeInline, AvatarVerificationBadge } from '../components/VerificationBadge';

const { width, height } = Dimensions.get('window');

export default function CallScreen({ route, navigation }: any) {
    const { colors } = useTheme();
    const {
        callId,
        callType: initialCallType = 'voice',
        otherUserId,
        otherUserName = 'User',
        otherUserAvatar,
        isVerified: initialIsVerified = false,
        isAdmin: initialIsAdmin = false,
    } = route.params || {};

    const [isVerified, setIsVerified] = useState(Boolean(initialIsVerified));
    const [isAdmin, setIsAdmin] = useState(Boolean(initialIsAdmin));

    useEffect(() => {
        if (otherUserId && !isVerified) {
            vendorAPI.getById(otherUserId)
                .then(res => {
                    const v = res.data?.vendor;
                    if (v?.isVerified || v?.is_verified) setIsVerified(true);
                    if (v?.userInfo?.role === 'admin' || v?.role === 'admin') setIsAdmin(true);
                })
                .catch(() => {
                    authAPI.getUser(otherUserId)
                        .then(res => {
                            const u = res.data?.user;
                            if (u?.isVerified || u?.is_verified) setIsVerified(true);
                            if (u?.role === 'admin') setIsAdmin(true);
                        })
                        .catch(() => {});
                });
        }
    }, [otherUserId]);

    const {
        currentCall,
        isMuted,
        isSpeaker,
        isVideoEnabled,
        isFrontCamera,
        callDuration,
        toggleMute,
        toggleSpeaker,
        toggleVideo,
        toggleCamera,
        incrementDuration,
        endCurrentCall,
        setCurrentCall,
    } = useCallStore();

    const [callStatus, setCallStatus] = useState<'ringing' | 'connected' | 'ended'>(
        currentCall?.status === 'connected' ? 'connected' : 'ringing'
    );
    const [callType, setCallType] = useState<'voice' | 'video'>(initialCallType);

    // Visualizer Animations
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const wave1 = useRef(new Animated.Value(10)).current;
    const wave2 = useRef(new Animated.Value(25)).current;
    const wave3 = useRef(new Animated.Value(15)).current;
    const wave4 = useRef(new Animated.Value(30)).current;
    const wave5 = useRef(new Animated.Value(20)).current;

    // Pulse animation for avatar
    useEffect(() => {
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.15,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, []);

    // Audio Equalizer wave animations
    useEffect(() => {
        if (callStatus === 'connected' && !isMuted) {
            const createWaveAnim = (animVal: Animated.Value, minH: number, maxH: number, duration: number) => {
                return Animated.loop(
                    Animated.sequence([
                        Animated.timing(animVal, { toValue: maxH, duration, useNativeDriver: false }),
                        Animated.timing(animVal, { toValue: minH, duration, useNativeDriver: false }),
                    ])
                );
            };

            const anims = [
                createWaveAnim(wave1, 8, 38, 350),
                createWaveAnim(wave2, 12, 45, 420),
                createWaveAnim(wave3, 6, 28, 300),
                createWaveAnim(wave4, 15, 50, 480),
                createWaveAnim(wave5, 10, 35, 370),
            ];
            anims.forEach((a) => a.start());
            return () => anims.forEach((a) => a.stop());
        }
    }, [callStatus, isMuted]);

    // Duration timer interval
    useEffect(() => {
        let timer: any = null;
        if (callStatus === 'connected') {
            timer = setInterval(() => {
                incrementDuration();
            }, 1000);
        }
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [callStatus]);

    // Poll status from server if currently ringing
    useEffect(() => {
        if (!callId) return;

        const interval = setInterval(async () => {
            try {
                const res = await callAPI.getCallStatus(callId);
                const call = res.data.call;
                if (call) {
                    if (call.status === 'connected' && callStatus !== 'connected') {
                        setCallStatus('connected');
                        setCurrentCall(call);
                    } else if (call.status === 'rejected' || call.status === 'ended' || call.status === 'missed') {
                        setCallStatus('ended');
                        setTimeout(() => {
                            endCurrentCall();
                            navigation.goBack();
                        }, 1500);
                    }
                }
            } catch (error) {
                // If 404 or ended
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [callId, callStatus]);

    const handleEndCall = async () => {
        setCallStatus('ended');
        await endCurrentCall();
        setTimeout(() => {
            navigation.goBack();
        }, 500);
    };

    // Format duration to mm:ss
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0D0E12" />

            {/* Top Bar */}
            <View style={styles.topBar}>
                <TouchableOpacity
                    style={styles.minimizeBtn}
                    onPress={() => navigation.goBack()}
                    activeOpacity={0.7}
                >
                    <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
                    <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>

                <View style={styles.encryptionHeader}>
                    <Ionicons name="lock-closed" size={12} color="#B28A45" />
                    <Text style={styles.encryptionText}>End-to-End Encrypted</Text>
                </View>

                <View style={{ width: 60 }} />
            </View>

            {/* Main Content Area */}
            {callType === 'video' && isVideoEnabled ? (
                /* Video Call View */
                <View style={styles.videoContainer}>
                    {/* Remote Video Stream Simulation */}
                    <View style={styles.remoteVideo}>
                        <Image
                            source={otherUserAvatar ? { uri: otherUserAvatar } : PLACEHOLDER_AVATARS.client}
                            style={styles.remoteVideoBg}
                            blurRadius={Platform.OS === 'web' ? 10 : 15}
                        />
                        <View style={styles.videoOverlayInfo}>
                            <View style={{ position: 'relative' }}>
                                <Image
                                    source={otherUserAvatar ? { uri: otherUserAvatar } : PLACEHOLDER_AVATARS.client}
                                    style={styles.videoAvatar}
                                />
                                <AvatarVerificationBadge isVerified={isVerified} isAdmin={isAdmin} size={18} />
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={styles.videoName}>{otherUserName}</Text>
                                <VerificationBadgeInline isVerified={isVerified} isAdmin={isAdmin} size={18} />
                            </View>
                            <Text style={styles.videoStatus}>
                                {callStatus === 'connected' ? formatDuration(callDuration) : 'Connecting HD Video...'}
                            </Text>
                        </View>
                    </View>

                    {/* Local PIP Video Preview */}
                    <View style={styles.pipContainer}>
                        <View style={styles.pipVideo}>
                            <Ionicons
                                name={isFrontCamera ? 'person-circle-outline' : 'videocam-outline'}
                                size={32}
                                color="#B28A45"
                            />
                            <Text style={styles.pipLabel}>{isFrontCamera ? 'Front Camera' : 'Back Camera'}</Text>
                        </View>
                    </View>
                </View>
            ) : (
                /* Voice Call View */
                <View style={styles.voiceContainer}>
                    {/* User Profile / Status */}
                    <View style={styles.userInfoSection}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={styles.userName}>{otherUserName}</Text>
                            <VerificationBadgeInline isVerified={isVerified} isAdmin={isAdmin} size={22} />
                        </View>
                        <Text style={styles.callStateText}>
                            {callStatus === 'connected'
                                ? formatDuration(callDuration)
                                : callStatus === 'ended'
                                ? 'Call Ended'
                                : 'QIIRAPOINTER Ringing...'}
                        </Text>
                    </View>

                    {/* Animated Avatar */}
                    <View style={styles.avatarSection}>
                        {callStatus === 'ringing' && (
                            <Animated.View
                                style={[
                                    styles.pulsingRing,
                                    {
                                        transform: [{ scale: pulseAnim }],
                                    },
                                ]}
                            />
                        )}
                        <View style={{ position: 'relative' }}>
                            <Image
                                source={otherUserAvatar ? { uri: otherUserAvatar } : PLACEHOLDER_AVATARS.vendor}
                                style={styles.avatarLarge}
                            />
                            <AvatarVerificationBadge isVerified={isVerified} isAdmin={isAdmin} size={28} />
                        </View>
                    </View>

                    {/* Sound Waves Equalizer (Active when talking) */}
                    {callStatus === 'connected' && (
                        <View style={styles.waveformContainer}>
                            <Animated.View style={[styles.waveBar, { height: wave1 }]} />
                            <Animated.View style={[styles.waveBar, { height: wave2 }]} />
                            <Animated.View style={[styles.waveBar, { height: wave3 }]} />
                            <Animated.View style={[styles.waveBar, { height: wave4 }]} />
                            <Animated.View style={[styles.waveBar, { height: wave5 }]} />
                        </View>
                    )}
                </View>
            )}

            {/* Bottom Floating Control Dock */}
            <View style={styles.controlDockContainer}>
                <View style={styles.controlDock}>
                    {/* Mute Toggle */}
                    <TouchableOpacity
                        style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
                        onPress={toggleMute}
                        activeOpacity={0.7}
                    >
                        <Ionicons
                            name={isMuted ? 'mic-off' : 'mic'}
                            size={22}
                            color={isMuted ? '#EF4444' : '#FFFFFF'}
                        />
                        <Text style={styles.controlLabel}>{isMuted ? 'Muted' : 'Mute'}</Text>
                    </TouchableOpacity>

                    {/* Video Toggle */}
                    <TouchableOpacity
                        style={[styles.controlBtn, !isVideoEnabled && styles.controlBtnActive]}
                        onPress={() => {
                            if (callType === 'voice') {
                                setCallType('video');
                            } else {
                                toggleVideo();
                            }
                        }}
                        activeOpacity={0.7}
                    >
                        <Ionicons
                            name={callType === 'video' && isVideoEnabled ? 'videocam' : 'videocam-off'}
                            size={22}
                            color={callType === 'video' && isVideoEnabled ? '#10B981' : '#FFFFFF'}
                        />
                        <Text style={styles.controlLabel}>Video</Text>
                    </TouchableOpacity>

                    {/* Speaker Toggle */}
                    <TouchableOpacity
                        style={[styles.controlBtn, isSpeaker && styles.controlBtnActive]}
                        onPress={toggleSpeaker}
                        activeOpacity={0.7}
                    >
                        <Ionicons
                            name={isSpeaker ? 'volume-high' : 'volume-medium-outline'}
                            size={22}
                            color={isSpeaker ? '#B28A45' : '#FFFFFF'}
                        />
                        <Text style={styles.controlLabel}>Speaker</Text>
                    </TouchableOpacity>

                    {/* Flip Camera (if video) */}
                    {callType === 'video' && (
                        <TouchableOpacity
                            style={styles.controlBtn}
                            onPress={toggleCamera}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="camera-reverse-outline" size={22} color="#FFFFFF" />
                            <Text style={styles.controlLabel}>Flip</Text>
                        </TouchableOpacity>
                    )}

                    {/* Chat Shortcut */}
                    <TouchableOpacity
                        style={styles.controlBtn}
                        onPress={() => {
                            navigation.navigate('Chat', {
                                otherUserId,
                                otherUserName,
                                otherUserImage: otherUserAvatar,
                            });
                        }}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="chatbubble-outline" size={22} color="#FFFFFF" />
                        <Text style={styles.controlLabel}>Chat</Text>
                    </TouchableOpacity>

                    {/* End Call Button */}
                    <TouchableOpacity
                        style={[styles.controlBtn, styles.endCallBtn]}
                        onPress={handleEndCall}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="call" size={26} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0C10',
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 20 : 10,
        height: 60,
    },
    minimizeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.15)',
        gap: 4,
    },
    backBtnText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    encryptionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(178, 138, 69, 0.15)',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 16,
    },
    encryptionText: {
        color: '#B28A45',
        fontSize: 11,
        fontWeight: '600',
    },
    voiceContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingVertical: 40,
    },
    userInfoSection: {
        alignItems: 'center',
    },
    userName: {
        color: '#FFFFFF',
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    callStateText: {
        color: '#A0AEC0',
        fontSize: 16,
        fontWeight: '500',
    },
    avatarSection: {
        width: 180,
        height: 180,
        justifyContent: 'center',
        alignItems: 'center',
        marginVertical: 20,
    },
    pulsingRing: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        borderWidth: 2,
        borderColor: '#B28A45',
        opacity: 0.5,
    },
    avatarLarge: {
        width: 160,
        height: 160,
        borderRadius: 80,
        borderWidth: 3,
        borderColor: '#B28A45',
        backgroundColor: '#1E232A',
    },
    waveformContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 60,
    },
    waveBar: {
        width: 6,
        borderRadius: 3,
        backgroundColor: '#B28A45',
    },
    // Video Call
    videoContainer: {
        flex: 1,
        position: 'relative',
    },
    remoteVideo: {
        flex: 1,
        backgroundColor: '#111827',
        justifyContent: 'center',
        alignItems: 'center',
    },
    remoteVideoBg: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
        opacity: 0.4,
    },
    videoOverlayInfo: {
        alignItems: 'center',
    },
    videoAvatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 2,
        borderColor: '#B28A45',
        marginBottom: 12,
    },
    videoName: {
        color: '#FFFFFF',
        fontSize: 22,
        fontWeight: 'bold',
    },
    videoStatus: {
        color: '#9CA3AF',
        fontSize: 14,
        marginTop: 4,
    },
    pipContainer: {
        position: 'absolute',
        top: 20,
        right: 20,
        width: 110,
        height: 150,
        borderRadius: 16,
        backgroundColor: '#1F2937',
        borderWidth: 1.5,
        borderColor: '#B28A45',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 8,
    },
    pipVideo: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#111827',
    },
    pipLabel: {
        color: '#B28A45',
        fontSize: 9,
        fontWeight: 'bold',
        marginTop: 4,
    },
    // Floating Dock
    controlDockContainer: {
        paddingHorizontal: 16,
        paddingBottom: Platform.OS === 'ios' ? 24 : 20,
    },
    controlDock: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        backgroundColor: 'rgba(25, 30, 40, 0.9)',
        borderRadius: 36,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    controlBtn: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    controlBtnActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
    },
    controlLabel: {
        color: '#9CA3AF',
        fontSize: 9,
        fontWeight: '600',
        marginTop: 2,
    },
    endCallBtn: {
        backgroundColor: '#EF4444',
        width: 56,
        height: 56,
        borderRadius: 28,
    },
});
