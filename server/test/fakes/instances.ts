import { FakeFirestore, FieldValue } from './firestore';
import { FakeAuth } from './auth';

// Single shared instances, swapped in for ../src/config/firebase by test/setup.ts
export const fakeDb = new FakeFirestore();
export const fakeAuth = new FakeAuth();

/** In-memory Cloud Storage: path -> { buffer, contentType, metadata } */
export const storedFiles = new Map<string, { buffer: Buffer; contentType?: string; metadata?: any }>();

/** The options of the last signed link issued, so tests can check what it allows. */
export const lastSignedUrl: { path?: string; options?: any } = {};

const fakeFile = (p: string): any => ({
    name: p,
    save: async (buffer: Buffer, opts: any = {}) => {
        storedFiles.set(p, { buffer, contentType: opts.contentType, metadata: opts.metadata });
    },
    delete: async () => { storedFiles.delete(p); },
    exists: async () => [storedFiles.has(p)],
    getSignedUrl: async (options: any = {}) => {
        lastSignedUrl.path = p;
        lastSignedUrl.options = options;
        return [`https://signed.example/${p}?action=${options.action || 'read'}&expires=soon`];
    },
    getMetadata: async () => {
        const f = storedFiles.get(p);
        if (!f) throw new Error('No such object');
        return [{ size: String(f.buffer.length), contentType: f.contentType }];
    },
    download: async (opts: { start?: number; end?: number } = {}) => {
        const f = storedFiles.get(p);
        if (!f) throw new Error('No such object');
        const start = opts.start ?? 0;
        const end = opts.end === undefined ? f.buffer.length : opts.end + 1;
        return [f.buffer.subarray(start, end)];
    },
    copy: async (dest: any) => {
        const f = storedFiles.get(p);
        if (!f) throw new Error('No such object');
        storedFiles.set(dest.name, { buffer: Buffer.from(f.buffer), contentType: f.contentType, metadata: f.metadata });
    },
    setMetadata: async (meta: any) => {
        const f = storedFiles.get(p);
        if (!f) throw new Error('No such object');
        storedFiles.set(p, { ...f, contentType: meta.contentType ?? f.contentType, metadata: meta });
    },
});

const fakeBucket = {
    name: 'test-bucket.firebasestorage.app',
    file: (p: string) => fakeFile(p),
    deleteFiles: async ({ prefix }: { prefix: string }) => {
        for (const key of [...storedFiles.keys()]) if (key.startsWith(prefix)) storedFiles.delete(key);
    },
};

export const fakeStorage = { bucket: (_name?: string) => fakeBucket };
export { FieldValue };
