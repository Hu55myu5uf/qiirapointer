import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

let NativeMapView: any = null;
let NativeMarker: any = null;
let NativeCallout: any = null;

try {
    const Maps = require('react-native-maps');
    NativeMapView = Maps.default;
    NativeMarker = Maps.Marker;
    NativeCallout = Maps.Callout;
} catch (e) {
    console.warn('react-native-maps could not be loaded natively:', e);
}

export const Marker: React.FC<any> = (props) => {
    if (NativeMarker) {
        return <NativeMarker {...props} />;
    }
    return null;
};

export const Callout: React.FC<any> = (props) => {
    if (NativeCallout) {
        return <NativeCallout {...props} />;
    }
    return null;
};

const MapView: React.FC<any> = (props) => {
    if (NativeMapView) {
        return <NativeMapView {...props} />;
    }
    return (
        <View style={[styles.fallbackContainer, props.style]}>
            <Text style={styles.fallbackText}>Map view is not available</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    fallbackContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f3f4f6',
        padding: 20,
    },
    fallbackText: {
        color: '#6b7280',
        fontSize: 14,
    },
});

export default MapView;
