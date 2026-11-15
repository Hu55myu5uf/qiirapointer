/**
 * Map tile source.
 *
 * OpenStreetMap's public tile servers do not allow use by apps (their usage policy forbids heavy or
 * production traffic), so the released app uses MapTiler. Set EXPO_PUBLIC_MAPTILER_KEY (client/.env
 * for development, EAS environment variables for builds). Without a key — local development only —
 * it falls back to OpenStreetMap so the map still works.
 *
 * MapTiler keys are meant to be embedded in apps; restrict the key to the app in the MapTiler
 * dashboard (Allowed HTTP origins / app identifiers) to prevent misuse.
 */
const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY || '';

export const MAP_TILES = MAPTILER_KEY
    ? {
        url: `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${encodeURIComponent(MAPTILER_KEY)}`,
        attribution: '© MapTiler © OpenStreetMap contributors',
        maxZoom: 20,
    }
    : {
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
    };
