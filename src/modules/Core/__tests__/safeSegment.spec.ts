import { describe, it, expect } from 'vitest';

import { is_safe_segment } from '../services/safeSegment.ts';

describe('is_safe_segment', () => {
    it('accepts a conservative single path segment', () => {
        for (const ok of ['checkout', 'suspec-cli-m1', 'feature_x', 'v2.1', 'A1', 'TASK-checkout']) {
            expect(is_safe_segment(ok)).toBe(true);
        }
    });

    it('rejects anything that could escape its directory', () => {
        for (const bad of [
            '../escape',
            '..',
            'a/b',
            'a\\b',
            '/abs',
            '-leading-dash',
            '.hidden',
            '',
            'a..b',
            'a/../b',
        ]) {
            expect(is_safe_segment(bad)).toBe(false);
        }
    });
});
