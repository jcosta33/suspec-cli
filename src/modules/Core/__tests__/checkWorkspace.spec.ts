import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { check_workspace } from '../useCases/checkWorkspace.ts';

let ws: string;

beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'suspec-ws-'));
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

    it('C017: flags a bundled reference the SKILL.md never names, but not a named one (orphan-only)', () => {
        writeSpec('good', CONFORMANT);
        withTemplates();
        const skill = join(ws, '.agents', 'skills', 'write-spec');
        mkdirSync(join(skill, 'references'), { recursive: true });
        // The SKILL.md points at one reference (named) and forgets the other (orphan).
        writeFileSync(join(skill, 'SKILL.md'), '# write-spec\n\nLoad `references/checklist.md` before you start.\n');
        writeFileSync(join(skill, 'references', 'checklist.md'), '# checklist\n'); // named → not flagged
        writeFileSync(join(skill, 'references', 'orphan.md'), '# nobody points here\n'); // orphan → C017
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        const c017 = report.workspaceFindings.filter((f) => f.code === 'C017');
        expect(c017).toHaveLength(1);
        expect(c017[0].level).toBe('warning');
        expect(c017[0].message).toContain('orphan.md');
        expect(c017[0].message).not.toContain('checklist.md'); // the named reference is NOT flagged
        expect(report.verdict).toBe('clean'); // a warning, not a blocking gate failure
    });

    it('C017: a skill whose SKILL.md names every bundled reference yields no orphan (0-FP)', () => {
        writeSpec('good', CONFORMANT);
        withTemplates();
        const skill = join(ws, '.agents', 'skills', 'review-output');
        mkdirSync(join(skill, 'references'), { recursive: true });
        writeFileSync(join(skill, 'SKILL.md'), '# review-output\n\nUse `references/task-template.md`.\n');
        writeFileSync(join(skill, 'references', 'task-template.md'), '# template\n');
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.workspaceFindings.filter((f) => f.code === 'C017')).toEqual([]);
    });

    it('C017: recurses into a nested references subdir, and skips skills with no SKILL.md or no references dir', () => {
        writeSpec('good', CONFORMANT);
        withTemplates();
        // (a) a skill dir with NO SKILL.md → skipped (no crash)
        mkdirSync(join(ws, '.agents', 'skills', 'no-guide', 'references'), { recursive: true });
        writeFileSync(join(ws, '.agents', 'skills', 'no-guide', 'references', 'x.md'), 'x\n');
        // (b) a skill with a SKILL.md but NO references dir → skipped
        mkdirSync(join(ws, '.agents', 'skills', 'no-refs'), { recursive: true });
        writeFileSync(join(ws, '.agents', 'skills', 'no-refs', 'SKILL.md'), '# no-refs\n');
        // (c) a skill whose references hold a NESTED subdir — the walker recurses; the deep orphan fires
        const deep = join(ws, '.agents', 'skills', 'deep');
        mkdirSync(join(deep, 'references', 'sub'), { recursive: true });
        writeFileSync(join(deep, 'SKILL.md'), '# deep\n\nSee `references/sub/named.md`.\n');
        writeFileSync(join(deep, 'references', 'sub', 'named.md'), '# named\n'); // named → not orphan
        writeFileSync(join(deep, 'references', 'sub', 'buried.md'), '# buried\n'); // nested orphan → C017
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        const c017 = report.workspaceFindings.filter((f) => f.code === 'C017');
        expect(c017.map((f) => f.message).join(' ')).toContain('buried.md');
        expect(c017).toHaveLength(1); // only the nested orphan; (a)/(b) skipped, named.md not flagged
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

    // Supersede resolution advisory (ADR-0106 item 4, ungated by ADR-0108). Advisory: a warning, no
    // C-id, never blocking — until measured 0-FP and promoted.
    it('a superseded spec whose superseded_by resolves to a real spec raises no supersede finding', () => {
        // SPEC-new is the live replacement; SPEC-old points at it and is marked superseded in place.
        writeSpec('new', CONFORMANT.replace('id: SPEC-good', 'id: SPEC-new'));
        writeSpec(
            'old',
            CONFORMANT.replace('id: SPEC-good', 'id: SPEC-old\nsuperseded_by: SPEC-new').replace(
                'status: ready',
                'status: superseded'
            )
        );
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.workspaceFindings.filter((f) => f.code.startsWith('supersede'))).toEqual([]);
        expect(report.verdict).toBe('clean');
    });

    it('flags an unresolved superseded_by as a warning, never blocking', () => {
        writeSpec(
            'old',
            CONFORMANT.replace('id: SPEC-good', 'id: SPEC-old\nsuperseded_by: SPEC-ghost').replace(
                'status: ready',
                'status: superseded'
            )
        );
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        const finding = report.workspaceFindings.find((f) => f.code === 'supersede-unresolved');
        expect(finding?.level).toBe('warning');
        expect(finding?.message).toContain('SPEC-ghost');
        expect(report.verdict).toBe('clean'); // advisory — it does not block the merge
        expect(report.level).toBe('warning');
    });

    it('flags a status: superseded spec that names no superseded_by replacement', () => {
        writeSpec('old', CONFORMANT.replace('id: SPEC-good', 'id: SPEC-old').replace('status: ready', 'status: superseded'));
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        const finding = report.workspaceFindings.find((f) => f.code === 'supersede-missing-pointer');
        expect(finding?.level).toBe('warning');
        expect(report.verdict).toBe('clean');
    });

    it('a living spec with no supersession raises no supersede finding (the common case)', () => {
        writeSpec('good', CONFORMANT.replace('status: ready', 'status: active'));
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.workspaceFindings.filter((f) => f.code.startsWith('supersede'))).toEqual([]);
        expect(report.verdict).toBe('clean');
    });

    // Duplicate-content advisory (ADR-0106 item 3) — exact duplicates only, advisory, never blocking.
    const writeFinding = (name: string, body: string): void => {
        mkdirSync(join(ws, 'findings'), { recursive: true });
        writeFileSync(join(ws, 'findings', name), `---\ntype: finding\nid: F-${name}\n---\n\n${body}\n`);
    };

    it('flags two findings with an identical body as duplicate-content (warning, never blocking)', () => {
        writeSpec('good', CONFORMANT);
        withTemplates();
        writeFinding('a.md', 'The token expiry check uses < not <=, so a token is valid one second too long.');
        writeFinding('b.md', 'The token expiry check uses < not <=, so a token is valid one second too long.');
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        const dup = report.workspaceFindings.find((f) => f.code === 'duplicate-content');
        expect(dup?.level).toBe('warning');
        expect(dup?.message).toContain('findings/a.md');
        expect(dup?.message).toContain('findings/b.md');
        expect(report.verdict).toBe('clean'); // advisory — duplication does not block the merge
    });

    it('does not flag distinct findings, a README, or an empty-body finding', () => {
        writeSpec('good', CONFORMANT);
        withTemplates();
        writeFinding('a.md', 'A real lesson about caching.');
        writeFinding('b.md', 'A different lesson about retries.');
        writeFileSync(join(ws, 'findings', 'README.md'), '# findings\n'); // placeholder — never compared
        writeFinding('empty.md', ''); // empty body — never a duplicate
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.workspaceFindings.filter((f) => f.code === 'duplicate-content')).toEqual([]);
    });

    // Stale-candidate-finding (SPEC-findings-adjudication-gate AC-003) — adjudication is part of
    // Close; a candidate older than the 30-day window warns, advisory, never blocking.
    const writeCandidate = (name: string, status: string, date: string, reviewed?: string): void => {
        mkdirSync(join(ws, 'findings'), { recursive: true });
        const rev = reviewed === undefined ? '' : `reviewed: ${reviewed}\n`;
        writeFileSync(
            join(ws, 'findings', name),
            `---\ntype: finding\nid: F-${name}\nstatus: ${status}\ndate: ${date}\n${rev}---\n\nA lesson.\n`
        );
    };

    it('warns on a candidate finding older than 30 days, keyed on reviewed: over date:', () => {
        writeSpec('good', CONFORMANT);
        withTemplates();
        const now = new Date('2026-07-03T00:00:00Z');
        writeCandidate('old.md', 'candidate', '2026-05-01'); // 63 days by date:
        writeCandidate('refreshed.md', 'candidate', '2026-05-01', '2026-06-20'); // 13 days by reviewed:
        writeCandidate('fresh.md', 'candidate', '2026-06-25'); // 8 days
        writeCandidate('accepted-old.md', 'accepted', '2026-01-01'); // adjudicated — never flagged
        const report = assertOk(check_workspace({ workspaceDir: ws, now }));
        const stale = report.workspaceFindings.filter((f) => f.code === 'stale-candidate-finding');
        expect(stale).toHaveLength(1);
        expect(stale[0].level).toBe('warning');
        expect(stale[0].message).toContain('findings/old.md');
        expect(report.verdict).toBe('clean'); // advisory — never blocks
    });

    it('never flags a candidate with no recorded date (no guessing)', () => {
        writeSpec('good', CONFORMANT);
        withTemplates();
        mkdirSync(join(ws, 'findings'), { recursive: true });
        writeFileSync(join(ws, 'findings', 'undated.md'), '---\ntype: finding\nid: F-u\nstatus: candidate\n---\n\nA lesson.\n');
        const report = assertOk(check_workspace({ workspaceDir: ws, now: new Date('2026-07-03T00:00:00Z') }));
        expect(report.workspaceFindings.filter((f) => f.code === 'stale-candidate-finding')).toEqual([]);
    });

    // promotion-or-die (ADR-0106 item 6) — a named finding candidate must land in findings/, advisory.
    it('flags a finding candidate named in ## Execution with no findings/<slug>.md', () => {
        writeSpec('feat', `${CONFORMANT}\n## Execution\n\n- Finding candidates: cache-bug, retry-storm\n`);
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        const flagged = report.workspaceFindings.filter((f) => f.code === 'unpromoted-finding');
        expect(flagged.map((f) => f.message.includes('cache-bug') || f.message.includes('retry-storm'))).toContain(true);
        expect(flagged.every((f) => f.level === 'warning')).toBe(true);
        expect(report.verdict).toBe('clean'); // advisory — never blocks the merge
    });

    it('does not flag a finding candidate that was promoted (findings/<slug>.md exists)', () => {
        writeSpec('feat', `${CONFORMANT}\n## Execution\n\n- Finding candidates: cache-bug\n`);
        mkdirSync(join(ws, 'findings'), { recursive: true });
        writeFileSync(join(ws, 'findings', 'cache-bug.md'), '---\ntype: finding\nid: F-cache\n---\n\nthe lesson\n');
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.workspaceFindings.filter((f) => f.code === 'unpromoted-finding')).toEqual([]);
    });

    it('flags nothing when no spec names a finding candidate', () => {
        writeSpec('feat', CONFORMANT); // no ## Execution / Finding candidates line
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.workspaceFindings.filter((f) => f.code === 'unpromoted-finding')).toEqual([]);
    });

    it('does not flag an unfilled template placeholder Finding-candidates line', () => {
        writeSpec('feat', `${CONFORMANT}\n## Execution\n\n- Finding candidates: {{slugs of durable lessons — promote or omit}}\n`);
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.workspaceFindings.filter((f) => f.code === 'unpromoted-finding')).toEqual([]);
    });

    it('treats a prose phrase (spaces) as no slugs — 0-FP, not four spurious word-warnings', () => {
        writeSpec('feat', `${CONFORMANT}\n## Execution\n\n- Finding candidates: caching strategy matters here\n`);
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.workspaceFindings.filter((f) => f.code === 'unpromoted-finding')).toEqual([]);
    });

    it('rejects path-shaped tokens (no traversal reaches existsSync)', () => {
        writeSpec('feat', `${CONFORMANT}\n## Execution\n\n- Finding candidates: ../../etc/passwd, sub/dir, /abs\n`);
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.workspaceFindings.filter((f) => f.code === 'unpromoted-finding')).toEqual([]);
    });

    it('accepts a comma-separated list of clean slugs (backticks tolerated)', () => {
        writeSpec('feat', `${CONFORMANT}\n## Execution\n\n- Finding candidates: \`cache-bug\`, retry_storm\n`);
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        const flagged = report.workspaceFindings.filter((f) => f.code === 'unpromoted-finding').map((f) => f.message);
        expect(flagged.some((m) => m.includes('cache-bug'))).toBe(true);
        expect(flagged.some((m) => m.includes('retry_storm'))).toBe(true);
    });

    // ADR-0110 — the incomplete-execution-digest advisory (0-FP: only a half-stamped entry flags).
    const digestFindings = (): string[] =>
        assertOk(check_workspace({ workspaceDir: ws })).workspaceFindings
            .filter((f) => f.code === 'incomplete-execution-digest')
            .map((f) => f.message);

    it('does NOT flag an Execution entry with a COMPLETE digest (both pins filled)', () => {
        writeSpec('feat', `${CONFORMANT}\n## Execution\n\n- **2026-06-26 — shipped** (suspec-cli \`abc1234\`).\n  - reviewed-sha: \`abc1234\` · evidence-hash: \`deadbeefcafe0000\`\n`);
        withTemplates();
        expect(digestFindings()).toEqual([]);
    });

    it('does NOT flag a prose Execution entry with NO digest (legacy / simple 1:1 work)', () => {
        writeSpec('feat', `${CONFORMANT}\n## Execution\n\n- **2026-06-26 — shipped** (suspec-cli \`abc1234\`).\n  - Run summary: changed login.ts; ran the suite.\n`);
        withTemplates();
        expect(digestFindings()).toEqual([]);
    });

    it('FLAGS a half-stamped Execution entry (one pin, not the other) as a warning, never blocking', () => {
        writeSpec('feat', `${CONFORMANT}\n## Execution\n\n- **2026-06-26 — shipped** (suspec-cli \`abc1234\`).\n  - reviewed-sha: \`abc1234\`\n`);
        withTemplates();
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        const finding = report.workspaceFindings.find((f) => f.code === 'incomplete-execution-digest');
        expect(finding?.level).toBe('warning');
        expect(finding?.message).toMatch(/one staleness pin but not the other/);
        expect(report.verdict).not.toBe('blocking');
    });

    it('does NOT flag pins left as unfilled {{placeholders}} (a freshly-scaffolded spec)', () => {
        writeSpec('feat', `${CONFORMANT}\n## Execution\n\n- **{{date}} — {{summary}}**\n  - reviewed-sha: {{code SHA reviewed}} · evidence-hash: {{written by suspec stamp}}\n`);
        withTemplates();
        expect(digestFindings()).toEqual([]);
    });

    // ADR-0116 (spec side) — an `active` spec MUST carry a `## Execution` section; SPEC-method-gates AC-005,
    // the tractable core. Advisory (0-FP: only an in-force `active` status is gated), never blocking.
    const noExecutionFindings = (): { message: string; level: 'blocking' | 'warning' }[] =>
        assertOk(check_workspace({ workspaceDir: ws })).workspaceFindings.filter(
            (f) => f.code === 'active-spec-no-execution'
        );

    it('does NOT flag an active spec that carries a ## Execution section', () => {
        writeSpec(
            'shipped',
            `${CONFORMANT.replace('status: ready', 'status: active')}\n## Execution\n\n- **2026-06-26 — shipped** (suspec-cli \`abc1234\`).\n`
        );
        withTemplates();
        expect(noExecutionFindings()).toEqual([]);
    });

    it('FLAGS an active spec with NO ## Execution section as a warning, never blocking (ADR-0116)', () => {
        writeSpec('shipped', CONFORMANT.replace('status: ready', 'status: active')); // active, no ## Execution
        withTemplates();
        const finding = noExecutionFindings();
        expect(finding).toHaveLength(1);
        expect(finding[0].level).toBe('warning');
        expect(finding[0].message).toContain('status: active');
        expect(finding[0].message).toContain('## Execution');
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.verdict).toBe('clean'); // advisory — it does not block the merge
        expect(report.level).toBe('warning');
    });

    it('does NOT flag a draft or ready spec with no ## Execution (only active is gated)', () => {
        writeSpec('drafting', CONFORMANT.replace('status: ready', 'status: draft')); // draft, no Execution
        writeSpec('ready', CONFORMANT); // status: ready, no Execution
        withTemplates();
        expect(noExecutionFindings()).toEqual([]);
    });

    it('does NOT count a ## Execution heading quoted inside a fenced code block (reuses ADR-0110 parse, 0-FP)', () => {
        // The section list excludes fenced examples, so a `## Execution` shown as example text is not a real
        // section — an active spec whose only Execution heading is fenced still trips the invariant.
        writeSpec(
            'shipped',
            `${CONFORMANT.replace('status: ready', 'status: active')}\n## Notes\n\n\`\`\`md\n## Execution\n\`\`\`\n`
        );
        withTemplates();
        const finding = noExecutionFindings();
        expect(finding).toHaveLength(1);
        expect(finding[0].level).toBe('warning');
    });

    // ADR-0116 (spec side, OTHER direction) — FINDING-0116-checker-misses-nonactive-execution: a spec that
    // HAS a `## Execution` section but is NOT status: active is shipped-but-not-marked-in-force, the inverse
    // of active-spec-no-execution. Advisory (warning), never blocking. `superseded` is exempt (a superseded
    // spec recording what it shipped before replacement is coherent); only draft/ready/done flag.
    const nonactiveExecutionFindings = (): { message: string; level: 'blocking' | 'warning' }[] =>
        assertOk(check_workspace({ workspaceDir: ws })).workspaceFindings.filter(
            (f) => f.code === 'nonactive-spec-with-execution'
        );

    it('FLAGS a ready spec WITH a ## Execution section as a warning, never blocking (FINDING-0116)', () => {
        // status: ready (the CONFORMANT default) + a real ## Execution section = shipped but not in-force.
        writeSpec('shipped', `${CONFORMANT}\n## Execution\n\n- **2026-06-26 — shipped** (suspec-cli \`abc1234\`).\n`);
        withTemplates();
        const finding = nonactiveExecutionFindings();
        expect(finding).toHaveLength(1);
        expect(finding[0].level).toBe('warning');
        expect(finding[0].message).toContain('## Execution');
        expect(finding[0].message).toContain('not status: active');
        const report = assertOk(check_workspace({ workspaceDir: ws }));
        expect(report.verdict).toBe('clean'); // advisory — it does not block the merge
        expect(report.level).toBe('warning');
    });

    it('FLAGS a done spec WITH a ## Execution section as a warning (FINDING-0116)', () => {
        writeSpec(
            'shipped',
            `${CONFORMANT.replace('status: ready', 'status: done')}\n## Execution\n\n- **2026-06-26 — shipped** (suspec-cli \`abc1234\`).\n`
        );
        withTemplates();
        const finding = nonactiveExecutionFindings();
        expect(finding).toHaveLength(1);
        expect(finding[0].level).toBe('warning');
    });

    it('does NOT flag an active spec WITH a ## Execution section (the happy path — in-force + shipped)', () => {
        writeSpec(
            'shipped',
            `${CONFORMANT.replace('status: ready', 'status: active')}\n## Execution\n\n- **2026-06-26 — shipped** (suspec-cli \`abc1234\`).\n`
        );
        withTemplates();
        expect(nonactiveExecutionFindings()).toEqual([]);
    });

    it('does NOT flag a draft spec with NO ## Execution section (nothing shipped, nothing owed)', () => {
        writeSpec('drafting', CONFORMANT.replace('status: ready', 'status: draft')); // draft, no Execution
        writeSpec('ready', CONFORMANT); // status: ready, no Execution
        withTemplates();
        expect(nonactiveExecutionFindings()).toEqual([]);
    });

    it('does NOT flag a superseded spec WITH a ## Execution section (exempt — historical shipped record)', () => {
        // A superseded spec recording what it shipped before being replaced is coherent, not a forgotten
        // status flip; superseded is deliberately exempt (it carries its own supersede-* advisories).
        writeSpec(
            'old',
            `${CONFORMANT.replace('id: SPEC-good', 'id: SPEC-old\nsuperseded_by: SPEC-new').replace(
                'status: ready',
                'status: superseded'
            )}\n## Execution\n\n- **2026-06-26 — shipped** (suspec-cli \`abc1234\`).\n`
        );
        writeSpec('new', CONFORMANT.replace('id: SPEC-good', 'id: SPEC-new')); // the live replacement
        withTemplates();
        expect(nonactiveExecutionFindings()).toEqual([]);
    });
});
