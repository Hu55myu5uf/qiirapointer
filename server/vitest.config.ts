import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['test/**/*.test.ts'],
        setupFiles: ['test/setup.ts'],
        // Each file gets a fresh module graph so in-memory server state doesn't leak between files
        isolate: true,
        pool: 'forks',
        testTimeout: 15000,
    },
});
