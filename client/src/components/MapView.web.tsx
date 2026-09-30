import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';

export const Marker: React.FC<any> = ({ children, title, description, coordinate }) => {
    return (
        <View style={styles.markerCard}>
            <View style={styles.markerHeader}>
                <Text style={styles.pinIcon}>📍</Text>
                <View style={styles.markerInfo}>
                    <Text style={styles.markerTitle}>{title || 'Vendor'}</Text>
                    {description ? <Text style={styles.markerDesc}>{description}</Text> : null}
                    {coordinate ? (
                        <Text style={styles.markerCoords}>
                            ({coordinate.latitude.toFixed(4)}, {coordinate.longitude.toFixed(4)})
                        </Text>
                    ) : null}
                </View>
            </View>
            {children}
        </View>
    );
};

export const Callout: React.FC<any> = ({ children, onPress }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.calloutWrapper}>
        {children}
    </TouchableOpacity>
);

interface MapViewProps {
    children?: React.ReactNode;
    style?: any;
    initialRegion?: {
        latitude: number;
        longitude: number;
        latitudeDelta?: number;
        longitudeDelta?: number;
    };
    showsUserLocation?: boolean;
    showsMyLocationButton?: boolean;
}

const MapView: React.FC<MapViewProps> = ({
    children,
    style,
    initialRegion,
    showsUserLocation = true,
}) => {
    const [viewTab, setViewTab] = useState<'map' | 'cards'>('map');
    const iframeRef = useRef<HTMLIFrameElement | null>(null);

    // Extract marker data from children
    const { markers, calloutHandlers } = useMemo(() => {
        const markersList: any[] = [];
        const handlers: Array<(() => void) | undefined> = [];

        React.Children.forEach(children, (child: any) => {
            if (!child) return;
            const props = child.props || {};
            if (props.coordinate && props.coordinate.latitude && props.coordinate.longitude) {
                // Find Callout child if any
                let calloutPress: (() => void) | undefined = undefined;
                if (props.children) {
                    React.Children.forEach(props.children, (subChild: any) => {
                        if (subChild && subChild.props && subChild.props.onPress) {
                            calloutPress = subChild.props.onPress;
                        }
                    });
                }

                handlers.push(calloutPress);
                markersList.push({
                    title: props.title || 'Vendor',
                    description: props.description || '',
                    latitude: Number(props.coordinate.latitude),
                    longitude: Number(props.coordinate.longitude),
                    index: markersList.length,
                });
            }
        });

        return { markers: markersList, calloutHandlers: handlers };
    }, [children]);

    // Handle postMessage events from Leaflet iframe
    useEffect(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined') return;

        const handleMessage = (event: MessageEvent) => {
            try {
                const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                if (data && data.type === 'QIIRA_MAP_MARKER_CLICK') {
                    const idx = Number(data.index);
                    const handler = calloutHandlers[idx];
                    if (handler) {
                        handler();
                    }
                }
            } catch (e) {
                // Ignore other messages
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [calloutHandlers]);

    // Calculate map center
    const centerLat = initialRegion?.latitude || (markers.length > 0 ? markers[0].latitude : 6.5244);
    const centerLng = initialRegion?.longitude || (markers.length > 0 ? markers[0].longitude : 3.3792);

    // Generate Leaflet Map HTML (100% free OpenStreetMap, no API keys)
    const mapHtml = useMemo(() => {
        const markersJson = JSON.stringify(markers);
        const userLocJson = initialRegion
            ? JSON.stringify({ latitude: initialRegion.latitude, longitude: initialRegion.longitude })
            : 'null';

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
        body, html, #map { width: 100%; height: 100%; overflow: hidden; background: #0f172a; }
        
        .gold-pin {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 38px;
            height: 38px;
            background: linear-gradient(135deg, #B28A45, #D4AF37);
            border: 2px solid #ffffff;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 4px 10px rgba(0,0,0,0.35);
            cursor: pointer;
            transition: transform 0.2s ease;
        }
        .gold-pin:hover {
            transform: rotate(-45deg) scale(1.15);
        }
        .gold-pin-icon {
            transform: rotate(45deg);
            font-size: 18px;
            line-height: 1;
        }

        .user-pin {
            width: 18px;
            height: 18px;
            background: #3b82f6;
            border: 3px solid #ffffff;
            border-radius: 50%;
            box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.35);
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.6); }
            70% { box-shadow: 0 0 0 14px rgba(59, 130, 246, 0); }
            100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }

        .leaflet-popup-content-wrapper {
            background: #1e293b;
            color: #f8fafc;
            border-radius: 12px;
            border: 1px solid #334155;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            padding: 4px;
        }
        .leaflet-popup-tip {
            background: #1e293b;
        }
        .popup-card {
            padding: 8px 4px;
            min-width: 170px;
        }
        .popup-title {
            font-size: 14px;
            font-weight: 700;
            color: #ffffff;
            margin-bottom: 2px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .popup-category {
            font-size: 12px;
            color: #B28A45;
            font-weight: 600;
            margin-bottom: 10px;
        }
        .popup-btn {
            display: block;
            width: 100%;
            padding: 8px 12px;
            background: linear-gradient(135deg, #B28A45, #9A7B38);
            color: #ffffff;
            font-size: 12px;
            font-weight: 600;
            text-align: center;
            border-radius: 6px;
            border: none;
            cursor: pointer;
            transition: opacity 0.2s ease;
        }
        .popup-btn:hover {
            opacity: 0.9;
        }
    </style>
</head>
<body>
    <div id="map"></div>
    <script>
        const markers = ${markersJson};
        const userLoc = ${userLocJson};
        const center = [${centerLat}, ${centerLng}];

        const map = L.map('map', {
            center: center,
            zoom: 13,
            zoomControl: true,
            attributionControl: false
        });

        // 100% Free OpenStreetMap standard tiles (Zero API key needed)
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        // Custom Gold Pin Icon
        const goldIcon = L.divIcon({
            className: 'custom-gold-marker',
            html: '<div class="gold-pin"><span class="gold-pin-icon">🏢</span></div>',
            iconSize: [38, 38],
            iconAnchor: [19, 38],
            popupAnchor: [0, -38]
        });

        // User Location Pin
        if (userLoc) {
            const userIcon = L.divIcon({
                className: 'custom-user-marker',
                html: '<div class="user-pin"></div>',
                iconSize: [18, 18],
                iconAnchor: [9, 9]
            });
            L.marker([userLoc.latitude, userLoc.longitude], { icon: userIcon })
                .addTo(map)
                .bindPopup('<b style="color:#3b82f6;">📍 Your Current Location</b>');
        }

        const bounds = [];
        if (userLoc) bounds.push([userLoc.latitude, userLoc.longitude]);

        // Add Markers
        markers.forEach((m) => {
            bounds.push([m.latitude, m.longitude]);
            const marker = L.marker([m.latitude, m.longitude], { icon: goldIcon }).addTo(map);
            
            const popupContent = document.createElement('div');
            popupContent.className = 'popup-card';
            popupContent.innerHTML = \`
                <div class="popup-title">🏢 \${m.title}</div>
                <div class="popup-category">\${m.description || 'Vendor'}</div>
                <button class="popup-btn" id="btn-\${m.index}">View Store & Products</button>
            \`;

            popupContent.querySelector('#btn-' + m.index).addEventListener('click', () => {
                window.parent.postMessage(JSON.stringify({
                    type: 'QIIRA_MAP_MARKER_CLICK',
                    index: m.index
                }), '*');
            });

            marker.bindPopup(popupContent);
        });

        // Auto-fit bounds if we have multiple points
        if (bounds.length > 1) {
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
        }
    </script>
</body>
</html>`;
    }, [markers, initialRegion, centerLat, centerLng]);

    return (
        <View style={[styles.container, style]}>
            {/* Map Header / Switcher */}
            <View style={styles.banner}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.bannerTitle}>🗺️ Interactive Map</Text>
                    <View style={styles.counterBadge}>
                        <Text style={styles.counterText}>{markers.length} Vendors</Text>
                    </View>
                </View>

                <View style={styles.tabToggle}>
                    <TouchableOpacity
                        style={[styles.toggleBtn, viewTab === 'map' && styles.toggleBtnActive]}
                        onPress={() => setViewTab('map')}
                    >
                        <Text style={[styles.toggleBtnText, viewTab === 'map' && styles.toggleBtnTextActive]}>
                            Map
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.toggleBtn, viewTab === 'cards' && styles.toggleBtnActive]}
                        onPress={() => setViewTab('cards')}
                    >
                        <Text style={[styles.toggleBtnText, viewTab === 'cards' && styles.toggleBtnTextActive]}>
                            List ({markers.length})
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Interactive Leaflet Map on Web */}
            {viewTab === 'map' ? (
                Platform.OS === 'web' ? (
                    <View style={styles.mapFrameWrapper}>
                        <iframe
                            ref={iframeRef as any}
                            srcDoc={mapHtml}
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                                display: 'block',
                            }}
                            title="Interactive Qiira Map"
                        />
                    </View>
                ) : (
                    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                        {children}
                    </ScrollView>
                )
            ) : (
                <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                    {children}
                </ScrollView>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f172a',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#334155',
        minHeight: 450,
    },
    banner: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        backgroundColor: '#1e293b',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    bannerTitle: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 15,
    },
    counterBadge: {
        backgroundColor: 'rgba(178, 138, 69, 0.2)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#B28A45',
    },
    counterText: {
        color: '#B28A45',
        fontSize: 11,
        fontWeight: '700',
    },
    tabToggle: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        borderRadius: 8,
        padding: 2,
        borderWidth: 1,
        borderColor: '#334155',
    },
    toggleBtn: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 6,
    },
    toggleBtnActive: {
        backgroundColor: '#B28A45',
    },
    toggleBtnText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#94a3b8',
    },
    toggleBtnTextActive: {
        color: '#ffffff',
    },
    mapFrameWrapper: {
        flex: 1,
        width: '100%',
        minHeight: 420,
        backgroundColor: '#0f172a',
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        gap: 12,
    },
    markerCard: {
        backgroundColor: '#1e293b',
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#334155',
        marginBottom: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    markerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    pinIcon: {
        fontSize: 24,
        marginRight: 10,
    },
    markerInfo: {
        flex: 1,
    },
    markerTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#ffffff',
    },
    markerDesc: {
        fontSize: 13,
        color: '#94a3b8',
        marginTop: 2,
    },
    markerCoords: {
        fontSize: 11,
        color: '#64748b',
        marginTop: 2,
    },
    calloutWrapper: {
        marginTop: 8,
    },
});

export default MapView;
