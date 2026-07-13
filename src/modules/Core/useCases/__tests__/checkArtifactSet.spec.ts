import { describe, it, expect } from 'vitest';

import { check_artifact_set } from '../checkArtifactSet.ts';
import { assertOk } from '../../../../infra/errors/testing/assertOk.ts';

describe('check_artifact_set — C002 duplicate-id across the passed set', () => {
    it('distinct frontmatter ids → clean', () => {
        const report = assertOk(
            check_artifact_set({
                artifacts: [
                    { path: 'a.md', id: 'SPEC-a' },
                    { path: 'b.md', id: 'SPEC-b' },
                ],
            })
        );
        expect(report.diagnostics).toEqual([]);
        expect(report.level).toBe('clean');
    });

    it('two files claiming the same id → one C002 hard-error naming both paths', () => {
        const report = assertOk(
            check_artifact_set({
                artifacts: [
                    { path: 'a.md', id: 'SPEC-x' },
                    { path: 'b.md', id: 'SPEC-x' },
                ],
            })
        );
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C002']);
        expect(report.diagnostics[0].severity).toBe('hard-error');
        expect(report.diagnostics[0].message).toContain('a.md');
        expect(report.diagnostics[0].message).toContain('b.md');
        expect(report.level).toBe('blocking');
    });

    it('a third file on the same id reports against the first claimant', () => {
        const report = assertOk(
            check_artifact_set({
                artifacts: [
                    { path: 'a.md', id: 'SPEC-x' },
                    { path: 'b.md', id: 'SPEC-x' },
                    { path: 'c.md', id: 'SPEC-x' },
                ],
            })
        );
        expect(report.diagnostics).toHaveLength(2);
        expect(report.diagnostics.every((d) => d.message.includes('a.md'))).toBe(true);
    });

    it('a file with no frontmatter id claims no identity — never collides', () => {
        const report = assertOk(
            check_artifact_set({
                artifacts: [
                    { path: 'a.md', id: null },
                    { path: 'b.md', id: null },
                    { path: 'c.md', id: 'SPEC-x' },
                ],
            })
        );
        expect(report.diagnostics).toEqual([]);
    });
});
