import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

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

    // Extract marker data from children
    const { markers, calloutHandlers } = useMemo(() => {
        const markersList: any[] = [];
        const handlers: Array<(() => void) | undefined> = [];

        React.Children.forEach(children, (child: any) => {
            if (!child) return;
            const props = child.props || {};
            if (props.coordinate && props.coordinate.latitude && props.coordinate.longitude) {
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

    const handleWebViewMessage = (event: any) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data && data.type === 'QIIRA_MAP_MARKER_CLICK') {
                const idx = Number(data.index);
                const handler = calloutHandlers[idx];
                if (handler) {
                    handler();
                }
            }
        } catch (e) {
            // ignore
        }
    };

    const centerLat = initialRegion?.latitude || (markers.length > 0 ? markers[0].latitude : 6.5244);
    const centerLng = initialRegion?.longitude || (markers.length > 0 ? markers[0].longitude : 3.3792);

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
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #map { width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .custom-pin {
            width: 34px; height: 34px; border-radius: 50% 50% 50% 0;
            background: linear-gradient(135deg, #0D9488 0%, #115E59 100%);
            transform: rotate(-45deg); display: flex; align-items: center; justify-content: center;
            box-shadow: 0 4px 12px rgba(13, 148, 136, 0.4); border: 2px solid #ffffff;
        }
        .pin-inner { transform: rotate(45deg); color: #fff; font-size: 14px; font-weight: bold; }
        .user-pin {
            width: 18px; height: 18px; border-radius: 50%;
            background: #2563EB; border: 3px solid #ffffff;
            box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.35);
        }
        .leaflet-popup-content-wrapper {
            border-radius: 14px; padding: 4px; box-shadow: 0 10px 25px rgba(0,0,0,0.15);
        }
        .popup-card { padding: 8px 12px; }
        .popup-title { font-weight: 700; font-size: 14px; color: #111827; margin-bottom: 2px; }
        .popup-desc { font-size: 12px; color: #4B5563; margin-bottom: 8px; }
        .popup-btn {
            display: inline-block; background: #0D9488; color: #ffffff !important;
            padding: 5px 12px; border-radius: 8px; font-size: 11px; font-weight: 700;
            text-decoration: none; cursor: pointer;
        }
    </style>
</head>
<body>
    <div id="map"></div>
    <script>
        var map = L.map('map', { zoomControl: true }).setView([${centerLat}, ${centerLng}], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(map);

        var markers = ${markersJson};
        var userLoc = ${userLocJson};

        if (userLoc && ${showsUserLocation ? 'true' : 'false'}) {
            var userIcon = L.divIcon({ className: 'user-pin-wrap', html: '<div class="user-pin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
            L.marker([userLoc.latitude, userLoc.longitude], { icon: userIcon }).addTo(map).bindPopup('<b>Your Location</b>');
        }

        var bounds = [];
        if (userLoc) bounds.push([userLoc.latitude, userLoc.longitude]);

        markers.forEach(function(m) {
            var pinIcon = L.divIcon({
                className: 'pin-wrap',
                html: '<div class="custom-pin"><span class="pin-inner">★</span></div>',
                iconSize: [34, 34],
                iconAnchor: [17, 34],
                popupAnchor: [0, -32]
            });

            var popupContent = '<div class="popup-card">' +
                '<div class="popup-title">' + (m.title || 'Vendor') + '</div>' +
                (m.description ? '<div class="popup-desc">' + m.description + '</div>' : '') +
                '<a class="popup-btn" onclick="sendMarkerClick(' + m.index + ')">View Details →</a>' +
                '</div>';

            L.marker([m.latitude, m.longitude], { icon: pinIcon })
                .addTo(map)
                .bindPopup(popupContent);

            bounds.push([m.latitude, m.longitude]);
        });

        if (bounds.length > 1) {
            map.fitBounds(bounds, { padding: [40, 40] });
        }

        function sendMarkerClick(index) {
            var msg = JSON.stringify({ type: 'QIIRA_MAP_MARKER_CLICK', index: index });
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(msg);
            }
        }
    </script>
</body>
</html>`;
    }, [centerLat, centerLng, markers, initialRegion, showsUserLocation]);

    return (
        <View style={[styles.container, style]}>
            {/* View Selector Tabs */}
            <View style={styles.tabBar}>
                <TouchableOpacity
                    style={[styles.tabButton, viewTab === 'map' && styles.tabButtonActive]}
                    onPress={() => setViewTab('map')}
                >
                    <Text style={[styles.tabText, viewTab === 'map' && styles.tabTextActive]}>
                        🗺️ Live Interactive Map
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabButton, viewTab === 'cards' && styles.tabButtonActive]}
                    onPress={() => setViewTab('cards')}
                >
                    <Text style={[styles.tabText, viewTab === 'cards' && styles.tabTextActive]}>
                        📋 Locations List ({markers.length})
                    </Text>
                </TouchableOpacity>
            </View>

            {viewTab === 'map' ? (
                <View style={styles.mapFrame}>
                    <WebView
                        originWhitelist={['*']}
                        source={{ html: mapHtml }}
                        style={styles.webview}
                        onMessage={handleWebViewMessage}
                        javaScriptEnabled={true}
                        domStorageEnabled={true}
                    />
                </View>
            ) : (
                <ScrollView style={styles.cardsScrollView} contentContainerStyle={styles.cardsContent}>
                    {children}
                </ScrollView>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        overflow: 'hidden',
    },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        padding: 6,
        gap: 8,
    },
    tabButton: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        backgroundColor: '#F3F4F6',
    },
    tabButtonActive: {
        backgroundColor: '#0D9488',
    },
    tabText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#4B5563',
    },
    tabTextActive: {
        color: '#FFFFFF',
    },
    mapFrame: {
        flex: 1,
        width: '100%',
        minHeight: 350,
    },
    webview: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    cardsScrollView: {
        flex: 1,
    },
    cardsContent: {
        padding: 12,
    },
    markerCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    markerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    pinIcon: {
        fontSize: 22,
        marginRight: 10,
    },
    markerInfo: {
        flex: 1,
    },
    markerTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
    },
    markerDesc: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 2,
    },
    markerCoords: {
        fontSize: 11,
        color: '#9CA3AF',
        marginTop: 2,
    },
    calloutWrapper: {
        marginTop: 4,
    },
});

export default MapView;
