import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { check_workspace } from '../useCases/checkWorkspace.ts';

let ws: string;

beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'swarm-ws-'));
});

afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
});

const CONFORMANT = `---
type: spec
id: SPEC-good
status: ready
sources:
  - ADR-0077
---

## Requirements

### AC-001 — does the thing
The tool must do the thing.
Verify with: a test.

## Non-goals

- not that.

## Open questions

- none
`;

function writeSpec(name: string, content: string): void {
    mkdirSync(join(ws, 'specs', name), { recursive: true });
    writeFileSync(join(ws, 'specs', name, 'spec.md'), content);
}

function withTemplates(): void {
    mkdirSync(join(ws, 'templates'), { recursive: true });
    writeFileSync(join(ws, 'templates', 'spec.md'), 'template\n');
}

describe('check_workspace', () => {
    it('a clean workspace yields a clean verdict', () => {
        writeSpec('good', CONFORMANT);
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.verdict).toBe('clean');
        expect(report.level).toBe('clean');
        expect(report.workspaceFindings).toEqual([]);
        expect(report.specs).toHaveLength(1);
    });

    it('a spec missing a Verify line makes the repo verdict blocking', () => {
        writeSpec('good', CONFORMANT);
        writeSpec('bad', CONFORMANT.replace('Verify with: a test.\n', ''));
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.verdict).toBe('blocking');
        expect(report.level).toBe('blocking');
        const bad = report.specs.find((s) => s.path.includes('/bad/'));
        expect(bad?.diagnostics.map((d) => d.code)).toContain('C003');
    });

    it('warnings alone keep the verdict clean but the level warning', () => {
        writeSpec('warn', CONFORMANT.replace(/## Non-goals\n\n- not that\.\n\n/, ''));
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.verdict).toBe('clean');
        expect(report.level).toBe('warning');
    });

    it('flags an unfilled placeholder in a live AGENTS.md and a missing templates dir (clauses a/b)', () => {
        writeSpec('good', CONFORMANT);
        writeFileSync(join(ws, 'AGENTS.md'), 'Repo guide with a {{leftover}} placeholder.\n');
        // no templates/ dir
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.verdict).toBe('blocking');
        expect(report.workspaceFindings.map((f) => f.code)).toEqual(
            expect.arrayContaining(['placeholder', 'missing-template'])
        );
        // the placeholder finding is actionable: it names the line and the next step
        const placeholder = report.workspaceFindings.find((finding) => finding.code === 'placeholder');
        expect(placeholder?.message).toContain('line 1');
        expect(placeholder?.message).toContain('fill them in');
    });

    it('flags a duplicate frontmatter id and a reused requirement id across specs (C002)', () => {
        writeSpec('one', CONFORMANT);
        writeSpec('two', CONFORMANT); // same SPEC-good id + same AC-001
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        const messages = report.workspaceFindings.filter((f) => f.code === 'C002').map((f) => f.message);
        expect(messages.some((m) => m.includes('frontmatter id'))).toBe(true);
        expect(messages.some((m) => m.includes('requirement id'))).toBe(true);
        expect(report.verdict).toBe('blocking');
    });

    it('exempts draft specs from cross-spec requirement-id reuse (C002), mirroring C007', () => {
        // Two fresh draft scaffolds both carry the stub AC-001 — distinct frontmatter ids, so only the
        // requirement-id rule is in play. A draft's stub ids are not finalized claims → no collision.
        const draft = (id: string) =>
            CONFORMANT.replace('id: SPEC-good', `id: ${id}`).replace('status: ready', 'status: draft');
        writeSpec('alpha', draft('SPEC-alpha'));
        writeSpec('beta', draft('SPEC-beta'));
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.workspaceFindings.filter((f) => f.code === 'C002')).toEqual([]);
        expect(report.verdict).toBe('clean');
    });

    it('still flags a reused requirement id between non-draft specs (only drafts are exempt)', () => {
        // a `done` spec and a `ready` spec, distinct frontmatter ids, both carrying AC-001 → C002 fires.
        writeSpec('a', CONFORMANT.replace('id: SPEC-good', 'id: SPEC-a').replace('status: ready', 'status: done'));
        writeSpec('b', CONFORMANT.replace('id: SPEC-good', 'id: SPEC-b'));
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        const c002 = report.workspaceFindings
            .filter((finding) => finding.code === 'C002')
            .map((finding) => finding.message);
        expect(c002.some((message) => message.includes('AC-001'))).toBe(true);
    });

    it('treats an unparseable spec as blocking', () => {
        writeSpec('broken', 'no frontmatter fence here\n');
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.verdict).toBe('blocking');
        expect(report.specs[0].level).toBe('blocking');
    });

    it('resolves workspace refs relative to the spec dir (C009 over the real tree)', () => {
        writeSpec('refs', CONFORMANT.replace('  - ADR-0077', '  - ADR-0077\n  - ./neighbor.md\n  - ./missing.md'));
        writeFileSync(join(ws, 'specs', 'refs', 'neighbor.md'), 'hi\n');
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        const refs = report.specs.find((s) => s.path.includes('/refs/'));
        // ./neighbor.md resolves (exists), ./missing.md does not → exactly one C009.
        expect(refs?.diagnostics.filter((d) => d.code === 'C009')).toHaveLength(1);
    });

    it('an empty workspace (no specs) is clean', () => {
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.specs).toEqual([]);
        expect(report.verdict).toBe('clean');
    });

    it('skips a specs subdir without a spec.md and tolerates a spec with no frontmatter id', () => {
        writeSpec('good', CONFORMANT);
        mkdirSync(join(ws, 'specs', 'notaspec'), { recursive: true }); // no spec.md → skipped
        writeSpec('noid', CONFORMANT.replace('id: SPEC-good\n', '').replace('AC-001', 'AC-099'));
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.specs).toHaveLength(2);
        expect(report.workspaceFindings).toEqual([]); // distinct ids → no C002 collisions
    });
});
