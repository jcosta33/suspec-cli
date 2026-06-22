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

// A change plan whose `preserves:` ref points at a spec id, parameterized so a test can break it.
function changePlan(ref: string): string {
    return `---
type: change-plan
id: CHANGE-x
status: draft
kind: schema-change
preserves: [${ref}]
---

# Change Plan

## Behavioral preservation guarantees

| ID | Behavior | Verify with |
|---|---|---|
| ${ref} | thing | \`npm test -- a.spec.ts\` |

## Transformation waves

1. Move it. Green check: \`npm test -- a.spec.ts\`.
`;
}

function writeChangePlan(name: string, content: string): void {
    mkdirSync(join(ws, 'change-plans'), { recursive: true });
    writeFileSync(join(ws, 'change-plans', `${name}.md`), content);
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

    it('an unfilled AGENTS.md placeholder ALONE is a warning, not a blocking verdict — the day-one nudge (SW-006)', () => {
        // A freshly-scaffolded workspace (templates present, specs clean) whose AGENTS.md still carries the
        // kit's {{placeholder}}s must NOT fail the merge gate (exit 2) on boilerplate — it nudges the user
        // to finish setup (exit 1). Greeting a day-one user with a red blocking verdict was the worst
        // first impression in the field test.
        writeSpec('good', CONFORMANT);
        withTemplates();
        writeFileSync(join(ws, 'AGENTS.md'), 'Repo guide with a {{leftover}} placeholder.\n');
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.verdict).toBe('clean'); // the merge gate is NOT failed by an unfilled scaffold
        expect(report.level).toBe('warning'); // exit 1 — the finish-setup nudge
        const placeholder = report.workspaceFindings.find((finding) => finding.code === 'placeholder');
        expect(placeholder?.level).toBe('warning');
    });

    it('warns on a bloated AGENTS.md, never on a real-sized one (agents-oversize, #14)', () => {
        writeSpec('good', CONFORMANT);
        withTemplates();
        // A real bootloader (measured 45–101 lines) stays clean — the band is ~4× the convention.
        writeFileSync(join(ws, 'AGENTS.md'), `# Guide\n${'a working line\n'.repeat(100)}`);
        const realSized = assertOk(check_workspace({ workspaceDir: ws }));
        expect(realSized.workspaceFindings.find((f) => f.code === 'agents-oversize')).toBeUndefined();
        expect(realSized.verdict).toBe('clean');

        // A bloated AGENTS.md (well over the line band, under the byte band) nudges at warning on lines.
        writeFileSync(join(ws, 'AGENTS.md'), `# Guide\n${'a bloated line\n'.repeat(500)}`);
        const bloated = assertOk(check_workspace({ workspaceDir: ws }));
        const oversize = bloated.workspaceFindings.find((f) => f.code === 'agents-oversize');
        expect(oversize?.level).toBe('warning');
        expect(oversize?.message).toContain('always-loaded');
        expect(oversize?.message).toContain('lines');
        expect(bloated.verdict).toBe('clean'); // a warning, not a blocking gate failure

        // A few-but-enormous-line file trips the BYTE band (>24 KB) via the cheap stat, without slurping
        // the whole file to count lines — the KB measure is reported instead.
        writeFileSync(join(ws, 'AGENTS.md'), `# Guide\n${'x'.repeat(30000)}\n`);
        const bigBytes = assertOk(check_workspace({ workspaceDir: ws }));
        const byteOversize = bigBytes.workspaceFindings.find((f) => f.code === 'agents-oversize');
        expect(byteOversize?.level).toBe('warning');
        expect(byteOversize?.message).toContain('KB');
    });

    it('--no-workspace skips the AGENTS.md size check (validity off)', () => {
        writeSpec('good', CONFORMANT);
        writeFileSync(join(ws, 'AGENTS.md'), `# Guide\n${'x\n'.repeat(500)}`);
        const report = assertOk(check_workspace({ workspaceDir: ws, includeValidity: false }));
        expect(report.workspaceFindings).toEqual([]);
    });

    it('flags a duplicate frontmatter id but not a reused requirement id (C002, spec-scoped)', () => {
        writeSpec('one', CONFORMANT);
        writeSpec('two', CONFORMANT); // same SPEC-good frontmatter id + same AC-001
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        const messages = report.workspaceFindings.filter((f) => f.code === 'C002').map((f) => f.message);
        expect(messages.some((m) => m.includes('frontmatter id'))).toBe(true);
        // requirement ids are spec-scoped (ADR-0080) — a bare AC-001 in two specs is not a collision.
        expect(messages.some((m) => m.includes('requirement id'))).toBe(false);
        expect(report.verdict).toBe('blocking'); // the duplicate frontmatter id still blocks
    });

    it('does not flag a requirement id reused across specs (spec-scoped, ADR-0080)', () => {
        // Distinct frontmatter ids, both carrying AC-001, across non-draft specs — no C002. Requirement
        // ids are unique within a file (C001); cross-spec references qualify as SPEC-x#AC-NNN.
        writeSpec('a', CONFORMANT.replace('id: SPEC-good', 'id: SPEC-a').replace('status: ready', 'status: done'));
        writeSpec('b', CONFORMANT.replace('id: SPEC-good', 'id: SPEC-b'));
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.workspaceFindings.filter((f) => f.code === 'C002')).toEqual([]);
        expect(report.verdict).toBe('clean');
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

    it('resolves a ROOT-relative source too — `intake/x.md` at the workspace root from specs/<f>/spec.md (C009)', () => {
        // The doc-recommended layout sources a root-level intake; it must resolve from the workspace root,
        // not only the spec dir (the false negative that forced the undocumented `../../intake/x.md`).
        writeSpec('pulled', CONFORMANT.replace('  - ADR-0077', '  - intake/sup-204.md'));
        mkdirSync(join(ws, 'intake'), { recursive: true });
        writeFileSync(join(ws, 'intake', 'sup-204.md'), 'ticket\n');
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        const pulled = report.specs.find((s) => s.path.includes('/pulled/'));
        expect(pulled?.diagnostics.filter((d) => d.code === 'C009')).toHaveLength(0); // resolved at the root
        // ...and a genuinely-missing root ref still fails.
        writeSpec('broke', CONFORMANT.replace('  - ADR-0077', '  - intake/nope.md'));
        const report2 = assertOk(check_workspace({ workspaceDir: ws }));
        const broke = report2.specs.find((s) => s.path.includes('/broke/'));
        expect(broke?.diagnostics.filter((d) => d.code === 'C009')).toHaveLength(1);
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

    // AC-006 — the workspace verdict folds change-plan files' C010/C011 findings.
    it('an all-clean workspace with a valid change plan stays clean (AC-006)', () => {
        writeSpec('good', CONFORMANT); // defines SPEC-good#AC-001
        withTemplates();
        writeChangePlan('move-it', changePlan('SPEC-good#AC-001'));
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.changePlans).toHaveLength(1);
        expect(report.changePlans[0].diagnostics).toEqual([]);
        expect(report.verdict).toBe('clean');
        expect(report.level).toBe('clean');
    });

    it('an unresolved change-plan ref makes the repo verdict blocking (AC-006)', () => {
        writeSpec('good', CONFORMANT); // SPEC-good defines AC-001, not AC-999
        withTemplates();
        writeChangePlan('move-it', changePlan('SPEC-good#AC-999'));
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.changePlans[0].diagnostics.map((d) => d.code)).toEqual(['C010']);
        expect(report.changePlans[0].level).toBe('blocking');
        expect(report.verdict).toBe('blocking');
        expect(report.level).toBe('blocking');
    });

    it('a change plan with a C011 warning lifts the level to warning but keeps the verdict clean (AC-006)', () => {
        writeSpec('good', CONFORMANT);
        withTemplates();
        // a migration plan whose only ref is a plan-local PG (C010 clean) but with empty waves (C011 warn)
        writeChangePlan(
            'warn-it',
            `---
type: change-plan
id: CHANGE-w
kind: migration
preserves: [PG-001]
---

# Change Plan

## Behavioral preservation guarantees

| ID | Behavior | Verify with |
|---|---|---|
| PG-001 | local | \`t\` |

## Transformation waves
`
        );
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.changePlans[0].diagnostics.map((d) => d.code)).toEqual(['C011']);
        expect(report.verdict).toBe('clean'); // a warning does not block the merge
        expect(report.level).toBe('warning');
    });

    it('ignores a non-change-plan file in change-plans/ (e.g. a README)', () => {
        writeSpec('good', CONFORMANT);
        withTemplates();
        mkdirSync(join(ws, 'change-plans'), { recursive: true });
        writeFileSync(join(ws, 'change-plans', 'README.md'), '# Change plans live here\n');
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.changePlans).toEqual([]);
        expect(report.verdict).toBe('clean');
    });

    it('treats an unparseable change plan as blocking', () => {
        writeSpec('good', CONFORMANT);
        withTemplates();
        // type: change-plan in the head, but no closing frontmatter fence → parse failure
        writeChangePlan('broken', '---\ntype: change-plan\nid: X\nno closing fence\n');
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.changePlans[0].level).toBe('blocking');
        expect(report.verdict).toBe('blocking');
    });
});
