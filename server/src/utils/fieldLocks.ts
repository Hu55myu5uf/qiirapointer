/**
 * Once-a-month changes for a vendor's identity fields (business name, category, phone number,
 * profile photo), so a store can't keep changing who it appears to be.
 *
 * vendors/{uid}.fieldChangedAt = { businessName: ISO, category: ISO, ... } records the last
 * change of each field. Filling a field for the first time is free; changing it again within
 * 30 days is refused. Admins acting on someone else's store are not limited.
 */
export const LOCK_DAYS = 30;
export const LOCKED_FIELDS = ['businessName', 'category', 'phoneNumber', 'businessImage'] as const;
export type LockedField = typeof LOCKED_FIELDS[number];

export const FIELD_LABELS: Record<LockedField, string> = {
    businessName: 'business name',
    category: 'category',
    phoneNumber: 'phone number',
    businessImage: 'profile photo',
};

const DAY_MS = 86_400_000;
const norm = (v: unknown) => String(v ?? '').trim();

export type LockResult =
    | { ok: true; changed: boolean }
    | { ok: false; field: LockedField; nextAllowedAt: string; message: string };

/** Is changing `field` from `current` to `next` allowed now? */
export function checkFieldLock(
    field: LockedField,
    current: unknown,
    next: unknown,
    changedAt: Record<string, string> | undefined,
    bypass: boolean,
    now = new Date(),
): LockResult {
    if (norm(current) === norm(next)) return { ok: true, changed: false };
    if (bypass || !norm(current)) return { ok: true, changed: true }; // admin, or first time filled in
    const last = changedAt?.[field];
    if (last) {
        const nextAllowed = new Date(new Date(last).getTime() + LOCK_DAYS * DAY_MS);
        if (nextAllowed > now) {
            return {
                ok: false,
                field,
                nextAllowedAt: nextAllowed.toISOString(),
                message: `You can change your ${FIELD_LABELS[field]} once every ${LOCK_DAYS} days. Next change: ${nextAllowed.toDateString()}.`,
            };
        }
    }
    return { ok: true, changed: true };
}

/** When each locked field can next be changed (only fields that are currently locked) */
export function lockedUntil(changedAt: Record<string, string> | undefined, now = new Date()): Partial<Record<LockedField, string>> {
    const out: Partial<Record<LockedField, string>> = {};
    for (const f of LOCKED_FIELDS) {
        const last = changedAt?.[f];
        if (!last) continue;
        const next = new Date(new Date(last).getTime() + LOCK_DAYS * DAY_MS);
        if (next > now) out[f] = next.toISOString();
    }
    return out;
}
