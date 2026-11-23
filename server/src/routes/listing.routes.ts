import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../config/firebase';
import { authenticateUser, optionalAuthenticateUser } from '../utils/authMiddleware';
import { writeLimiter } from '../utils/rateLimiter';
import { getDisplayProfiles, usableImage } from '../utils/profiles';
import { isUploadRef, claimUploadedVideo, UploadError } from '../utils/fileStorage';

/**
 * Property listings: places for rent, short-let, sale, lease or hire, posted by vendors in
 * property-type categories (realtors, hosts, venues).
 *
 *   listings/{id}  ownerId, purpose, propertyType, title, description, price, pricePeriod, fees,
 *                  totalMoveIn (computed), bedrooms, bathrooms, furnished, amenities, area, city,
 *                  state, approxLocation (rounded, ~1 km), exactAddress (private), photos, videoUrl,
 *                  status available|taken|paused, availableFrom, expiresAt, createdAt, updatedAt
 *
 * Safety: the exact address is only ever returned to the agent and admins; a listing expires
 * after 30 days unless renewed; agents without the ID badge are labelled; at most 30 active
 * listings per account; listings can be reported. Only the server writes.
 */
const router = Router();

export const LISTING_DAYS = 30;
const MAX_ACTIVE = 30;
const MAX_PHOTOS = 15;
const DAY_MS = 86_400_000;

export const PURPOSES = ['rent', 'short-let', 'sale', 'lease', 'hire'] as const;
export const PROPERTY_TYPES = [
    'self-contain', 'room', 'flat', 'duplex', 'bungalow', 'terrace', 'house', 'studio',
    'shop', 'office', 'warehouse', 'land', 'event-space', 'other',
] as const;
export const PRICE_PERIODS = ['year', 'month', 'week', 'night', 'day', 'once'] as const;
export const AMENITIES = [
    'water', 'prepaid-meter', 'power-backup', 'parking', 'security', 'fenced', 'tiled',
    'pop-ceiling', 'wardrobe', 'kitchen-cabinets', 'air-conditioning', 'wifi', 'pool', 'gym',
    'serviced', 'pets-allowed', 'generator', 'cctv', 'elevator', 'balcony',
] as const;
const FURNISHED = ['furnished', 'semi-furnished', 'unfurnished'] as const;
const FEE_KEYS = ['agencyFee', 'cautionFee', 'serviceCharge', 'legalFee'] as const;

/** Main categories whose vendors can list places */
export const LISTING_CATEGORIES = ['Real Estate & Property', 'Travel & Hospitality', 'Events, Parties & Celebrations'];

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isHttps = (v: unknown) => typeof v === 'string' && v.length <= 2048 && /^https:\/\/[^\s]+$/i.test(v);
const money = (v: unknown): number | null => {
    if (v === undefined || v === null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s₦]/g, ''));
    return Number.isFinite(n) && n >= 0 && n <= 1e12 ? Math.round(n) : NaN;
};
const smallInt = (v: unknown, max = 50): number | null => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= max ? n : NaN;
};
const validId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);
const mainCategory = (c: unknown) => String(c ?? '').split(' - ')[0].trim();

class ListingError extends Error {
    constructor(public status: number, message: string) { super(message); }
}

/** Validate a create/edit body. `partial` allows leaving fields out (edits). */
function parseListing(b: any, partial: boolean) {
    const out: Record<string, any> = {};
    const need = (cond: boolean, msg: string) => { if (!cond) throw new ListingError(400, msg); };
    const has = (k: string) => b[k] !== undefined;

    if (!partial || has('purpose')) { need(PURPOSES.includes(b.purpose), `purpose must be one of: ${PURPOSES.join(', ')}`); out.purpose = b.purpose; }
    if (!partial || has('propertyType')) { need(PROPERTY_TYPES.includes(b.propertyType), 'Choose a property type'); out.propertyType = b.propertyType; }
    if (!partial || has('title')) {
        const t = str(b.title, 101);
        need(t.length >= 5 && t.length <= 100, 'Titles must be 5–100 characters');
        out.title = t;
    }
    if (!partial || has('description')) {
        const d = str(b.description, 3001);
        need(d.length <= 3000, 'Descriptions can be at most 3000 characters');
        out.description = d;
    }
    if (!partial || has('price')) {
        const p = money(b.price);
        need(p !== null && !Number.isNaN(p) && p > 0, 'Enter the price');
        out.price = p;
    }
    if (!partial || has('pricePeriod')) { need(PRICE_PERIODS.includes(b.pricePeriod), 'Choose how the price is charged (per year, month, night…)'); out.pricePeriod = b.pricePeriod; }
    if (has('fees') || !partial) {
        const fees: Record<string, number> = {};
        for (const k of FEE_KEYS) {
            const v = money(b.fees?.[k]);
            need(!Number.isNaN(v as number), `Invalid ${k}`);
            if (v) fees[k] = v;
        }
        out.fees = fees;
    }
    for (const k of ['bedrooms', 'bathrooms', 'toilets'] as const) {
        if (!partial || has(k)) {
            const v = smallInt(b[k]);
            need(!Number.isNaN(v as number), `Invalid number of ${k}`);
            out[k] = v;
        }
    }
    if (!partial || has('furnished')) {
        need(b.furnished === undefined || b.furnished === null || FURNISHED.includes(b.furnished), 'Invalid furnished option');
        out.furnished = b.furnished || null;
    }
    if (!partial || has('amenities')) {
        const list = Array.isArray(b.amenities) ? b.amenities : [];
        out.amenities = [...new Set(list.filter((a: any) => AMENITIES.includes(a)))];
    }
    if (!partial || has('area')) { const a = str(b.area, 81); need(a.length >= 2 && a.length <= 80, 'Enter the area or neighbourhood'); out.area = a; }
    if (!partial || has('city')) { out.city = str(b.city, 60); }
    if (!partial || has('state')) { const s = str(b.state, 41); need(s.length >= 2 && s.length <= 40, 'Enter the state'); out.state = s; }
    if (!partial || has('exactAddress')) { out.exactAddress = str(b.exactAddress, 200); }
    if (!partial || has('location')) {
        const loc = b.location;
        if (loc === null || loc === undefined) out.approxLocation = null;
        else {
            const lat = Number(loc.latitude), lng = Number(loc.longitude);
            need(Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180, 'Invalid location');
            // Rounded to about 1 km so the pin never reveals the exact building
            out.approxLocation = { latitude: Math.round(lat * 100) / 100, longitude: Math.round(lng * 100) / 100 };
        }
    }
    if (!partial || has('availableFrom')) {
        const d = b.availableFrom ? new Date(b.availableFrom) : null;
        need(!b.availableFrom || !isNaN(d!.getTime()), 'Invalid available-from date');
        out.availableFrom = d ? d.toISOString().slice(0, 10) : null;
    }
    if (!partial || has('photos')) {
        const photos = Array.isArray(b.photos) ? b.photos : [];
        need(photos.length >= 1, 'Add at least one photo');
        need(photos.length <= MAX_PHOTOS, `At most ${MAX_PHOTOS} photos`);
        need(photos.every(isHttps), 'Invalid photo');
        out.photos = photos;
    }
    return out;
}

/** Total paid to move in: the first period's price plus all one-off fees */
function totalMoveIn(price: number, fees: Record<string, number> = {}) {
    return Math.round((price || 0) + FEE_KEYS.reduce((s, k) => s + (Number(fees[k]) || 0), 0));
}

const isExpired = (l: any, now = Date.now()) => new Date(l.expiresAt).getTime() <= now;

function present(l: any, owner: any, opts: { private: boolean }) {
    const out: Record<string, any> = {
        id: l.id,
        ownerId: l.ownerId,
        purpose: l.purpose,
        propertyType: l.propertyType,
        title: l.title,
        description: l.description || '',
        price: l.price,
        pricePeriod: l.pricePeriod,
        currency: 'NGN',
        fees: l.fees || {},
        totalMoveIn: l.totalMoveIn,
        bedrooms: l.bedrooms ?? null,
        bathrooms: l.bathrooms ?? null,
        toilets: l.toilets ?? null,
        furnished: l.furnished || null,
        amenities: l.amenities || [],
        area: l.area,
        city: l.city || '',
        state: l.state,
        approxLocation: l.approxLocation || null,
        photos: (l.photos || []).map((p: string) => usableImage(p)).filter(Boolean),
        videoUrl: usableImage(l.videoUrl) || null,
        status: l.status,
        availableFrom: l.availableFrom || null,
        expiresAt: l.expiresAt,
        expired: isExpired(l),
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
        agent: owner ? {
            uid: owner.uid,
            name: owner.name,
            avatar: owner.avatar,
            username: owner.username || null,
            isVerified: Boolean(owner.isVerified),
        } : null,
    };
    if (opts.private) out.exactAddress = l.exactAddress || '';
    return out;
}

async function canList(uid: string): Promise<string | null> {
    const [u, v] = await Promise.all([db.collection('users').doc(uid).get(), db.collection('vendors').doc(uid).get()]);
    const user = u.data() || {};
    if (user.isSuspended) return 'Your account is suspended';
    if (user.role === 'admin') return null;
    if (user.role !== 'vendor') return 'Only vendor accounts can list places';
    if (!LISTING_CATEGORIES.includes(mainCategory(v.data()?.category))) {
        return `Listings are for vendors in ${LISTING_CATEGORIES.join(', ')}. Set your business category first.`;
    }
    return null;
}

async function load(id: string) {
    if (!validId(id)) return null;
    const snap = await db.collection('listings').doc(id).get();
    return snap.exists ? { id: snap.id, ...(snap.data() as any) } : null;
}

// ─── Browse ──────────────────────────────────────────────────────────────────

/**
 * GET /api/listings?purpose&type&state&q&minPrice&maxPrice&bedrooms&furnished&latitude&longitude&radius
 * Available, unexpired listings from active accounts. Newest first, or nearest when a location is sent.
 */
router.get('/', optionalAuthenticateUser, async (req: Request, res: Response) => {
    try {
        const q = req.query as Record<string, string>;
        const snap = await db.collection('listings').where('status', '==', 'available').limit(1000).get();
        const now = Date.now();
        let list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).filter(l => !isExpired(l, now));

        if (PURPOSES.includes(q.purpose as any)) list = list.filter(l => l.purpose === q.purpose);
        if (PROPERTY_TYPES.includes(q.type as any)) list = list.filter(l => l.propertyType === q.type);
        if (FURNISHED.includes(q.furnished as any)) list = list.filter(l => l.furnished === q.furnished);
        if (q.state) list = list.filter(l => String(l.state).toLowerCase() === String(q.state).toLowerCase().trim());
        const min = Number(q.minPrice), max = Number(q.maxPrice), beds = Number(q.bedrooms);
        if (Number.isFinite(min) && min > 0) list = list.filter(l => l.price >= min);
        if (Number.isFinite(max) && max > 0) list = list.filter(l => l.price <= max);
        if (Number.isFinite(beds) && beds > 0) list = list.filter(l => (l.bedrooms || 0) >= beds);
        if (q.q) {
            const s = String(q.q).toLowerCase().trim().slice(0, 60);
            list = list.filter(l => [l.title, l.description, l.area, l.city, l.state].some(x => String(x || '').toLowerCase().includes(s)));
        }

        const lat = Number(q.latitude), lng = Number(q.longitude), radius = Number(q.radius) || 0;
        if (Number.isFinite(lat) && Number.isFinite(lng) && q.latitude !== undefined) {
            const dist = (l: any) => {
                if (!l.approxLocation) return Infinity;
                const toRad = (x: number) => (x * Math.PI) / 180;
                const dLat = toRad(l.approxLocation.latitude - lat), dLng = toRad(l.approxLocation.longitude - lng);
                const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(l.approxLocation.latitude)) * Math.sin(dLng / 2) ** 2;
                return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            };
            list = list.map(l => ({ ...l, distanceMeters: dist(l) }));
            if (radius > 0) list = list.filter(l => l.distanceMeters <= radius);
            list.sort((a, b) => a.distanceMeters - b.distanceMeters);
        } else {
            list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        }

        const owners = await getDisplayProfiles(list.slice(0, 300).map(l => l.ownerId));
        const suspended = new Set<string>();
        await Promise.all([...owners.keys()].map(async uid => {
            const u = await db.collection('users').doc(uid).get();
            if (!u.exists || u.data()?.isSuspended) suspended.add(uid);
        }));
        const viewerBlocked = req.user ? (await getDisplayProfiles([req.user.uid])).get(req.user.uid)?.blockedUserIds || [] : [];
        const visible = list.slice(0, 300).filter(l => !suspended.has(l.ownerId) && !viewerBlocked.includes(l.ownerId));
        res.json({
            listings: visible.slice(0, 100).map(l => ({ ...present(l, owners.get(l.ownerId), { private: false }), distanceMeters: l.distanceMeters ?? null })),
            total: visible.length,
        });
    } catch (error: any) {
        console.error('List listings error:', error);
        res.status(500).json({ error: 'Failed to load listings' });
    }
});

/** GET /api/listings/mine — all of your listings (including taken, paused and expired) */
router.get('/mine', authenticateUser, async (req: Request, res: Response) => {
    try {
        const uid = req.user!.uid;
        const snap = await db.collection('listings').where('ownerId', '==', uid).get();
        const me = (await getDisplayProfiles([uid])).get(uid);
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        res.json({ listings: list.map(l => present(l, me, { private: true })), canList: (await canList(uid)) === null });
    } catch (error: any) {
        console.error('My listings error:', error);
        res.status(500).json({ error: 'Failed to load your listings' });
    }
});

/** GET /api/listings/agent/:uid — an agent's available listings (for their store page) */
router.get('/agent/:uid', async (req: Request, res: Response) => {
    try {
        if (!validId(req.params.uid)) return res.status(400).json({ error: 'Invalid id' });
        const u = await db.collection('users').doc(req.params.uid).get();
        if (!u.exists || u.data()?.isSuspended) return res.json({ listings: [] });
        const snap = await db.collection('listings').where('ownerId', '==', req.params.uid).get();
        const owner = (await getDisplayProfiles([req.params.uid])).get(req.params.uid);
        const now = Date.now();
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
            .filter(l => l.status === 'available' && !isExpired(l, now))
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        res.json({ listings: list.map(l => present(l, owner, { private: false })) });
    } catch (error: any) {
        console.error('Agent listings error:', error);
        res.status(500).json({ error: 'Failed to load listings' });
    }
});

/** GET /api/listings/:id — taken listings stay visible (marked); paused/expired only to the agent and admins */
router.get('/:id', optionalAuthenticateUser, async (req: Request, res: Response) => {
    try {
        const l = await load(req.params.id);
        if (!l) return res.status(404).json({ error: 'Listing not found' });
        const isOwner = req.user?.uid === l.ownerId;
        const privileged = Boolean(isOwner || req.user?.isAdmin);
        const owner = await db.collection('users').doc(l.ownerId).get();
        const hidden = l.status === 'paused' || isExpired(l) || !owner.exists || owner.data()?.isSuspended;
        if (hidden && !privileged) return res.status(404).json({ error: 'Listing not found' });
        const p = (await getDisplayProfiles([l.ownerId])).get(l.ownerId);
        res.json({ listing: present(l, p, { private: privileged }), isOwner });
    } catch (error: any) {
        console.error('Get listing error:', error);
        res.status(500).json({ error: 'Failed to load listing' });
    }
});

// ─── Create & manage ────────────────────────────────────────────────────────

async function resolveVideo(v: unknown, uid: string): Promise<string | null> {
    if (v === undefined || v === null || v === '') return null;
    if (isUploadRef(v)) return claimUploadedVideo(String(v), uid, ['listings', uid], 'tour');
    if (isHttps(v)) return String(v);
    throw new ListingError(400, 'Invalid video');
}

router.post('/', authenticateUser, writeLimiter, async (req: Request, res: Response) => {
    try {
        const uid = req.user!.uid;
        const blocked = await canList(uid);
        if (blocked) return res.status(403).json({ error: blocked });
        const active = (await db.collection('listings').where('ownerId', '==', uid).get()).docs
            .filter(d => d.data().status !== 'taken' && !isExpired(d.data()));
        if (active.length >= MAX_ACTIVE) return res.status(400).json({ error: `You can have at most ${MAX_ACTIVE} active listings. Mark some as taken or delete them.` });

        const data = parseListing(req.body || {}, false);
        const videoUrl = await resolveVideo(req.body?.videoUrl, uid);
        const now = new Date();
        const id = `lst_${now.getTime().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
        const listing = {
            id,
            ownerId: uid,
            ...data,
            videoUrl,
            totalMoveIn: totalMoveIn(data.price, data.fees),
            status: 'available',
            expiresAt: new Date(now.getTime() + LISTING_DAYS * DAY_MS).toISOString(),
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
        };
        await db.collection('listings').doc(id).set(listing);
        const me = (await getDisplayProfiles([uid])).get(uid);
        res.status(201).json({ listing: present(listing, me, { private: true }) });
    } catch (error: any) {
        if (error instanceof ListingError || error instanceof UploadError) return res.status((error as any).status).json({ error: error.message });
        console.error('Create listing error:', error);
        res.status(500).json({ error: 'Failed to create listing' });
    }
});

async function ownedListing(req: Request, res: Response) {
    const l = await load(req.params.id);
    if (!l) { res.status(404).json({ error: 'Listing not found' }); return null; }
    if (l.ownerId !== req.user!.uid && !req.user!.isAdmin) { res.status(403).json({ error: 'Only the agent who listed it can change it' }); return null; }
    return l;
}

router.put('/:id', authenticateUser, writeLimiter, async (req: Request, res: Response) => {
    try {
        const l = await ownedListing(req, res);
        if (!l) return;
        const data = parseListing(req.body || {}, true);
        if (req.body?.videoUrl !== undefined) data.videoUrl = await resolveVideo(req.body.videoUrl, l.ownerId);
        const merged = { ...l, ...data };
        const update = { ...data, totalMoveIn: totalMoveIn(merged.price, merged.fees), updatedAt: new Date().toISOString() };
        await db.collection('listings').doc(l.id).set(update, { merge: true });
        res.json({ success: true });
    } catch (error: any) {
        if (error instanceof ListingError || error instanceof UploadError) return res.status((error as any).status).json({ error: error.message });
        console.error('Edit listing error:', error);
        res.status(500).json({ error: 'Failed to update listing' });
    }
});

/** POST /api/listings/:id/status { status: available | taken | paused } */
router.post('/:id/status', authenticateUser, writeLimiter, async (req: Request, res: Response) => {
    try {
        const l = await ownedListing(req, res);
        if (!l) return;
        const status = req.body?.status;
        if (!['available', 'taken', 'paused'].includes(status)) return res.status(400).json({ error: 'status must be available, taken or paused' });
        await db.collection('listings').doc(l.id).set({ status, updatedAt: new Date().toISOString() }, { merge: true });
        res.json({ success: true, status });
    } catch (error: any) {
        console.error('Listing status error:', error);
        res.status(500).json({ error: 'Failed to update listing' });
    }
});

/** POST /api/listings/:id/renew — visible for another 30 days from now */
router.post('/:id/renew', authenticateUser, writeLimiter, async (req: Request, res: Response) => {
    try {
        const l = await ownedListing(req, res);
        if (!l) return;
        const expiresAt = new Date(Date.now() + LISTING_DAYS * DAY_MS).toISOString();
        await db.collection('listings').doc(l.id).set({ expiresAt, renewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
        res.json({ success: true, expiresAt });
    } catch (error: any) {
        console.error('Renew listing error:', error);
        res.status(500).json({ error: 'Failed to renew listing' });
    }
});

router.delete('/:id', authenticateUser, async (req: Request, res: Response) => {
    try {
        const l = await ownedListing(req, res);
        if (!l) return;
        await db.collection('listings').doc(l.id).delete();
        res.json({ success: true });
    } catch (error: any) {
        console.error('Delete listing error:', error);
        res.status(500).json({ error: 'Failed to delete listing' });
    }
});

export default router;
