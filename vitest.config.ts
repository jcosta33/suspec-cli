import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        exclude: ['**/node_modules/**', '**/dist/**', '.worktrees/**', 'scaffold/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'json'],
            include: ['src/modules/**/*'],
            exclude: ['src/modules/**/index.ts', 'src/modules/**/*.spec.ts', 'src/modules/**/*.md', 'src/modules/**/*.json'],
            all: true,
        },
    },
});
