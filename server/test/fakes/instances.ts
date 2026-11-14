import { FakeFirestore, FieldValue } from './firestore';
import { FakeAuth } from './auth';

// Single shared instances, swapped in for ../src/config/firebase by test/setup.ts
export const fakeDb = new FakeFirestore();
export const fakeAuth = new FakeAuth();
export const fakeStorage = {
    bucket: () => ({
        name: 'test-bucket',
        file: (p: string) => ({
            name: p,
            save: async () => {},
            delete: async () => {},
            exists: async () => [false],
            makePublic: async () => {},
            getSignedUrl: async () => [`https://signed.example/${p}`],
            publicUrl: () => `https://public.example/${p}`,
        }),
    }),
};
export { FieldValue };
