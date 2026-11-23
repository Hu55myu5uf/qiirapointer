/** Labels for property listings (values must match the server's listing.routes). */

export const LISTING_PURPOSES = [
    { key: 'rent', label: 'For rent' },
    { key: 'short-let', label: 'Short-let' },
    { key: 'sale', label: 'For sale' },
    { key: 'lease', label: 'For lease' },
    { key: 'hire', label: 'For hire' },
] as const;

export const PROPERTY_TYPES = [
    { key: 'self-contain', label: 'Self-contain' },
    { key: 'room', label: 'Room' },
    { key: 'flat', label: 'Flat / Apartment' },
    { key: 'studio', label: 'Studio' },
    { key: 'duplex', label: 'Duplex' },
    { key: 'bungalow', label: 'Bungalow' },
    { key: 'terrace', label: 'Terrace' },
    { key: 'house', label: 'House' },
    { key: 'shop', label: 'Shop' },
    { key: 'office', label: 'Office' },
    { key: 'warehouse', label: 'Warehouse' },
    { key: 'land', label: 'Land' },
    { key: 'event-space', label: 'Event space / Hall' },
    { key: 'other', label: 'Other' },
] as const;

export const PRICE_PERIODS = [
    { key: 'year', label: 'per year', short: '/yr' },
    { key: 'month', label: 'per month', short: '/mo' },
    { key: 'week', label: 'per week', short: '/wk' },
    { key: 'night', label: 'per night', short: '/night' },
    { key: 'day', label: 'per day', short: '/day' },
    { key: 'once', label: 'one-off (sale)', short: '' },
] as const;

export const FURNISHED_OPTIONS = [
    { key: 'furnished', label: 'Furnished' },
    { key: 'semi-furnished', label: 'Semi-furnished' },
    { key: 'unfurnished', label: 'Unfurnished' },
] as const;

export const AMENITIES = [
    { key: 'water', label: 'Water', icon: 'water-outline' },
    { key: 'prepaid-meter', label: 'Prepaid meter', icon: 'flash-outline' },
    { key: 'power-backup', label: 'Power backup', icon: 'battery-charging-outline' },
    { key: 'generator', label: 'Generator', icon: 'cog-outline' },
    { key: 'parking', label: 'Parking', icon: 'car-outline' },
    { key: 'security', label: 'Security', icon: 'shield-checkmark-outline' },
    { key: 'cctv', label: 'CCTV', icon: 'videocam-outline' },
    { key: 'fenced', label: 'Fenced / gated', icon: 'lock-closed-outline' },
    { key: 'tiled', label: 'Tiled floors', icon: 'grid-outline' },
    { key: 'pop-ceiling', label: 'POP ceiling', icon: 'layers-outline' },
    { key: 'wardrobe', label: 'Wardrobes', icon: 'shirt-outline' },
    { key: 'kitchen-cabinets', label: 'Kitchen cabinets', icon: 'restaurant-outline' },
    { key: 'air-conditioning', label: 'Air conditioning', icon: 'snow-outline' },
    { key: 'wifi', label: 'Wi-Fi', icon: 'wifi-outline' },
    { key: 'balcony', label: 'Balcony', icon: 'sunny-outline' },
    { key: 'elevator', label: 'Elevator', icon: 'swap-vertical-outline' },
    { key: 'pool', label: 'Pool', icon: 'water' },
    { key: 'gym', label: 'Gym', icon: 'barbell-outline' },
    { key: 'serviced', label: 'Serviced', icon: 'sparkles-outline' },
    { key: 'pets-allowed', label: 'Pets allowed', icon: 'paw-outline' },
] as const;

export const FEE_FIELDS = [
    { key: 'agencyFee', label: 'Agency fee' },
    { key: 'cautionFee', label: 'Caution / deposit' },
    { key: 'serviceCharge', label: 'Service charge' },
    { key: 'legalFee', label: 'Legal / agreement fee' },
] as const;

export const NIGERIAN_STATES = [
    'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River',
    'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano',
    'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo',
    'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
];

/** Main categories whose vendors can list places (same as the server) */
export const LISTING_CATEGORIES = ['Real Estate & Property', 'Travel & Hospitality', 'Events, Parties & Celebrations'];

export const labelOf = (list: readonly { key: string; label: string }[], key?: string | null) =>
    list.find(x => x.key === key)?.label || key || '';

export function naira(n?: number | null): string {
    if (n === undefined || n === null || !Number.isFinite(n)) return '';
    return '₦' + Math.round(n).toLocaleString('en-NG');
}

export function priceLabel(price: number, period?: string): string {
    const p = PRICE_PERIODS.find(x => x.key === period);
    return `${naira(price)}${p?.short ? ` ${p.short}` : ''}`;
}
