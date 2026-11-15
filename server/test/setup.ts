import { vi, beforeEach } from 'vitest';

process.env.NODE_ENV = 'test';

// Never touch the real Firebase / Supabase projects from tests
vi.mock('../src/config/firebase', async () => {
    const m = await import('./fakes/instances');
    return { auth: m.fakeAuth, db: m.fakeDb, storage: m.fakeStorage, FieldValue: m.FieldValue, default: {} };
});
vi.mock('../src/config/supabase', async () => {
    const m = await import('./fakes/supabase');
    return { default: m.default };
});
// No real push notifications
vi.mock('node-fetch', () => ({ default: async () => ({ json: async () => ({ data: { status: 'ok' } }) }) }));

beforeEach(async () => {
    const m = await import('./fakes/instances');
    m.fakeDb.reset();
    m.fakeAuth.reset();
    m.storedFiles.clear();
    // In-process caches must not leak between tests
    (await import('../src/utils/profiles')).clearProfileCache();
    (await import('../src/utils/vendors')).invalidateVendorList();
});
