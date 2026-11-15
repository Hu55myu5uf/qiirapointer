import React from 'react';
import { Image as ExpoImage, ImageProps as ExpoImageProps } from 'expo-image';
import type { ImageResizeMode, ImageSourcePropType, StyleProp, ImageStyle } from 'react-native';

/**
 * Drop-in replacement for React Native's <Image> backed by expo-image:
 * - photos are cached in memory and on disk (no re-downloading on every screen visit)
 * - downscaled to the size they are shown at (less memory on cheaper phones)
 * - a short fade-in instead of a pop
 *
 * Accepts the React Native props this app uses (resizeMode, source, style, onError, …).
 */
type Props = Omit<ExpoImageProps, 'source' | 'style' | 'contentFit'> & {
    source?: ImageSourcePropType | { uri?: string } | null;
    style?: StyleProp<ImageStyle>;
    resizeMode?: ImageResizeMode;
    contentFit?: ExpoImageProps['contentFit'];
};

const FIT: Record<string, ExpoImageProps['contentFit']> = {
    cover: 'cover',
    contain: 'contain',
    stretch: 'fill',
    center: 'scale-down',
    repeat: 'cover',
};

export default function CachedImage({ resizeMode, contentFit, source, style, ...rest }: Props) {
    // An empty or missing uri renders nothing instead of a broken request
    const src: any = source && typeof source === 'object' && 'uri' in (source as any) && !(source as any).uri ? null : source;
    return (
        <ExpoImage
            source={src}
            style={style as any}
            contentFit={contentFit || FIT[resizeMode || 'cover']}
            cachePolicy="memory-disk"
            transition={150}
            recyclingKey={typeof src === 'object' && src?.uri ? src.uri : undefined}
            {...rest}
        />
    );
}

export { CachedImage as Image };
