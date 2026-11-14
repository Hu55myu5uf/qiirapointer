/**
 * Supabase stand-in: every query resolves to "no data". Supabase is being removed (Phase 2);
 * until then this keeps tests independent of it and guarantees nothing reaches the live project.
 */
const RESULT = { data: null, error: { message: 'supabase disabled in tests' }, count: 0 };

function chain(): any {
    const fn: any = () => chain();
    return new Proxy(fn, {
        get(_t, prop) {
            if (prop === 'then') return (resolve: any) => resolve(RESULT);
            return () => chain();
        },
    });
}

const fakeSupabase: any = new Proxy({}, {
    get(_t, prop) {
        if (prop === 'storage') {
            return {
                listBuckets: async () => ({ data: [], error: null }),
                createBucket: async () => ({ data: null, error: null }),
                from: () => ({
                    upload: async () => ({ data: null, error: { message: 'supabase disabled in tests' } }),
                    getPublicUrl: () => ({ data: { publicUrl: '' } }),
                    remove: async () => ({ data: null, error: null }),
                }),
            };
        }
        return () => chain();
    },
});

export default fakeSupabase;
