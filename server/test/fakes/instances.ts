import { FakeFirestore, FieldValue } from './firestore';
import { FakeAuth } from './auth';

// Single shared instances, swapped in for ../src/config/firebase by test/setup.ts
export const fakeDb = new FakeFirestore();
export const fakeAuth = new FakeAuth();

/** In-memory Cloud Storage: path -> { buffer, contentType, metadata } */
export const storedFiles = new Map<string, { buffer: Buffer; contentType?: string; metadata?: any }>();

const fakeBucket = {
    name: 'test-bucket.firebasestorage.app',
    file: (p: string) => ({
        name: p,
        save: async (buffer: Buffer, opts: any = {}) => {
            storedFiles.set(p, { buffer, contentType: opts.contentType, metadata: opts.metadata });
        },
        delete: async () => { storedFiles.delete(p); },
        exists: async () => [storedFiles.has(p)],
        getSignedUrl: async () => [`https://signed.example/${p}?expires=soon`],
    }),
    deleteFiles: async ({ prefix }: { prefix: string }) => {
        for (const key of [...storedFiles.keys()]) if (key.startsWith(prefix)) storedFiles.delete(key);
    },
};

export const fakeStorage = { bucket: (_name?: string) => fakeBucket };
export { FieldValue };
