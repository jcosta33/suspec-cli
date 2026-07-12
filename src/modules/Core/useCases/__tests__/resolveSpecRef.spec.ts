import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { build_spec_ref_resolver } from '../resolveSpecRef.ts';
import { find_sibling_spec_files } from '../findSpecFiles.ts';

let dir: string;

const SPEC = `---
type: spec
id: SPEC-checkout
status: ready
sources:
  - ADR-0077
---

## Requirements

### AC-002 — order record
The tool must write it.
Verify with: a test.

### AC-003 — ledger
The tool must append it.
Verify with: a test.

## Non-goals

- none.

## Open questions

- none.
`;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'suspec-resolve-'));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('build_spec_ref_resolver', () => {
    it('resolves a SPEC-x#AC-NNN ref the indexed spec defines, and rejects an absent one', () => {
        const specPath = join(dir, 'spec.md');
        writeFileSync(specPath, SPEC);
        const resolves = build_spec_ref_resolver([specPath]);
        expect(resolves('SPEC-checkout', 'AC-002')).toBe(true);
        expect(resolves('SPEC-checkout', 'AC-003')).toBe(true);
        expect(resolves('SPEC-checkout', 'AC-999')).toBe(false); // anchor absent
        expect(resolves('SPEC-absent', 'AC-002')).toBe(false); // spec absent
    });

    it('resolves the numeric shorthand SPEC-NNN to the unique SPEC-NNN-<slug> spec, never ambiguously', () => {
        // Change-plan guarantee tables write `SPEC-001#AC-001` while the spec id is
        // `SPEC-001-ai-rpg-dialogue` — the natural numeric shorthand must resolve to the unique extension.
        const a = join(dir, 'a.md');
        writeFileSync(a, SPEC.replace('id: SPEC-checkout', 'id: SPEC-001-ai-rpg-dialogue'));
        const resolves = build_spec_ref_resolver([a]);
        expect(resolves('SPEC-001', 'AC-002')).toBe(true); // SPEC-001 → SPEC-001-ai-rpg-dialogue
        expect(resolves('SPEC-001-ai-rpg-dialogue', 'AC-002')).toBe(true); // full id still resolves (exact)
        expect(resolves('SPEC-001', 'AC-999')).toBe(false); // resolved spec, but anchor absent
        // Ambiguous: two specs extend SPEC-002- → the shorthand does NOT resolve (never a guess).
        const b = join(dir, 'b.md');
        const c = join(dir, 'c.md');
        const d = join(dir, 'd.md');
        writeFileSync(b, SPEC.replace('id: SPEC-checkout', 'id: SPEC-002-alpha'));
        writeFileSync(c, SPEC.replace('id: SPEC-checkout', 'id: SPEC-002-beta'));
        expect(build_spec_ref_resolver([b, c])('SPEC-002', 'AC-002')).toBe(false);
        // An EXACT id wins even when extensions also exist (no shorthand resolution needed).
        writeFileSync(d, SPEC.replace('id: SPEC-checkout', 'id: SPEC-002'));
        expect(build_spec_ref_resolver([b, c, d])('SPEC-002', 'AC-002')).toBe(true);
    });

    it('skips a spec that does not parse and one with no frontmatter id', () => {
        const noFence = join(dir, 'a.md');
        writeFileSync(noFence, 'no frontmatter fence here\n');
        const noId = join(dir, 'b.md');
        writeFileSync(noId, SPEC.replace('id: SPEC-checkout\n', ''));
        const resolves = build_spec_ref_resolver([noFence, noId]);
        expect(resolves('SPEC-checkout', 'AC-002')).toBe(false);
    });
});

describe('find_sibling_spec_files', () => {
    it('returns [] when the change plan has no existing parent directory', () => {
        // planDir = dir/absent/deeper, so parentDir = dir/absent (does not exist) → no siblings, no crash
        expect(find_sibling_spec_files(join(dir, 'absent', 'deeper', 'change-plan.md'))).toEqual([]);
    });

    it('finds sibling */spec.md beside a change plan (the fixture layout)', () => {
        mkdirSync(join(dir, 'transformation'), { recursive: true });
        mkdirSync(join(dir, 'checkout'), { recursive: true });
        writeFileSync(join(dir, 'checkout', 'spec.md'), SPEC);
        const planPath = join(dir, 'transformation', 'change-plan.md');
        writeFileSync(planPath, '---\ntype: change-plan\nid: X\n---\n# x\n');
        // a non-directory sibling is tolerated (skipped), not a crash
        writeFileSync(join(dir, 'README.md'), 'hi\n');
        expect(find_sibling_spec_files(planPath)).toEqual([join(dir, 'checkout', 'spec.md')]);
    });

    it('rejects a sibling directory named spec.md', () => {
        mkdirSync(join(dir, 'transformation'), { recursive: true });
        mkdirSync(join(dir, 'checkout', 'spec.md'), { recursive: true });
        const planPath = join(dir, 'transformation', 'change-plan.md');
        writeFileSync(planPath, '---\ntype: change-plan\nid: X\n---\n# x\n');
        expect(find_sibling_spec_files(planPath)).toEqual([]);
    });

    it('finds siblings from a bare or ./-prefixed argv path — the resolve-before-dirname regression pin', () => {
        // Without resolve(), dirname-of-dirname on `change-plan.md` collapses to `.` twice —
        // landing in the plan's OWN directory and silently finding zero siblings (false-C010).
        // realpath: chdir lands in the kernel-resolved dir (macOS tmpdir is a /var symlink),
        // so the returned sibling paths are realpath-based too.
        const realDir = realpathSync(dir);
        mkdirSync(join(realDir, 'transformation'), { recursive: true });
        mkdirSync(join(realDir, 'checkout'), { recursive: true });
        writeFileSync(join(realDir, 'checkout', 'spec.md'), SPEC);
        writeFileSync(join(realDir, 'transformation', 'change-plan.md'), '---\ntype: change-plan\nid: X\n---\n# x\n');
        const cwd = process.cwd();
        try {
            process.chdir(join(realDir, 'transformation'));
            expect(find_sibling_spec_files('change-plan.md')).toEqual([join(realDir, 'checkout', 'spec.md')]);
            expect(find_sibling_spec_files('./change-plan.md')).toEqual([join(realDir, 'checkout', 'spec.md')]);
        } finally {
            process.chdir(cwd);
        }
    });
});
