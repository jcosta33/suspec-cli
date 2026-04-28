import { to_slug, derive_names, next_duplicate_slug } from '../useCases/slug.ts';
import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';

import { describe, expect, it } from 'vitest';

describe('slug utility', () => {
    it('converts strings to valid agent worktree slugs', () => {
        expect(assertOk(to_slug('Hello World!'))).toBe('hello-world');
        expect(assertOk(to_slug('Fix: bug in the parser'))).toBe('fix-bug-in-the-parser');
        expect(assertOk(to_slug('  trim   spaces  '))).toBe('trim-spaces');
    });

    it('collapses multiple hyphens and strips trailing ones', () => {
        expect(assertOk(to_slug('a--b---c'))).toBe('a-b-c');
        expect(assertOk(to_slug('hello-'))).toBe('hello');
        expect(assertOk(to_slug('-hello'))).toBe('hello');
    });

    it('respects max length and strips trailing hyphens after slice', () => {
        const long = 'a'.repeat(100);
        expect(assertOk(to_slug(long, 10))).toBe('aaaaaaaaaa');
        expect(assertOk(to_slug('hello-world-foo', 15))).toBe('hello-world-foo');
        expect(assertOk(to_slug('hello-world-foo', 13))).toBe('hello-world-f');
        expect(assertOk(to_slug('hello-world-foo', 10))).toBe('hello-worl');
    });

    it('returns error on empty or invalid input', () => {
        expect(assertErr(to_slug(''))._tag).toBe('InvalidSlug');
        expect(assertErr(to_slug('!!!'))._tag).toBe('InvalidSlug');
        expect(assertErr(to_slug('   '))._tag).toBe('InvalidSlug');
    });
});

describe('derive_names', () => {
    it('produces branch, worktreePath, and taskFile from slug', () => {
        const result = derive_names('my-feature', 'swarm-cli', {});
        expect(result.branch).toBe('agent/my-feature');
        expect(result.worktreePath).toBe('../swarm-cli--my-feature');
        expect(result.taskFile).toBe('.agents/tasks/my-feature.md');
    });

    it('uses custom worktreeDirPattern when provided', () => {
        const result = derive_names('my-feature', 'swarm-cli', { worktreeDirPattern: 'wt/{slug}' });
        expect(result.worktreePath).toBe('wt/my-feature');
    });
});

describe('next_duplicate_slug', () => {
    it('appends -2 when base slug is taken', () => {
        expect(next_duplicate_slug('feature', new Set(['feature']))).toBe('feature-2');
    });

    it('increments until an available slug is found', () => {
        expect(next_duplicate_slug('feature', new Set(['feature', 'feature-2', 'feature-3']))).toBe('feature-4');
    });
});