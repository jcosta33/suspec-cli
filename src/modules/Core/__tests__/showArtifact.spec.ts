import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { show_artifact } from '../useCases/showArtifact.ts';
import { isErr } from '../../../infra/errors/result.ts';

// ADR-0137 / SPEC-suspec-v2: `show` resolves every kind by id-or-slug against the STORE's flat
// `<kind>-*.md` files (archive/ as the fallback) — never the retired workspace tree. The one
// repo-file face left is `show <path>` (kind omitted, confined to the repo dir).

const SPEC = `---
type: spec
id: SPEC-feat
status: ready
sources:
  - self
---

## Requirements

### AC-001 — one
The tool must do it.
Verify with: a-test

## Non-goals

- none.

## Open questions

- none.

## Execution

- **2026-06-26 — v0 shipped.** Did the thing.

\`\`\`
## not a heading (inside a fence)
\`\`\`

## Dropped from sources

- none.
`;
const TASK = `---
type: task
id: TASK-feat
source:
  - SPEC-feat
scope: [AC-001, AC-002]
status: ready
---

# Task

## Do not change

- \`src/feat/frozen.ts\`

## Affected areas

- \`src/feat\`

## Run summary

- Changed files: \`src/feat/a.ts\`
`;
const REVIEW = `---
type: review
id: REVIEW-feat
task: TASK-feat
status: needs-human
---

# Review

## Requirement coverage

| ID | Result | Evidence | Human attention |
|---|---|---|---|
| AC-001 | Pass | pasted | no |

## Human attention

1. x
`;
// A cross-root task carrying an embedded spec slice (ADR-0100 `## Spec snapshot`).
const TASK_EMBEDDED = `---
type: task
id: TASK-xroot
source:
  - SPEC-remote
scope: [AC-001]
status: ready
---

# Task

## Spec snapshot

embedded-spec: SPEC-remote

- AC-001 — verify: \`a-test\`

## Affected areas

- \`src/x\`
`;
// A task-less 1:1 review naming its spec directly (review-to-spec, ADR-0103) + fast-track pins (ADR-0107).
const REVIEW_SPEC_KEYED = `---
type: review
id: REVIEW-byspec
spec: SPEC-feat
status: pass
reviewed_sha: abc1234
evidence_hash: deadbeefcafe0000
---

# Review

## Requirement coverage

| ID | Result | Evidence | Human attention |
|---|---|---|---|
| AC-001 | Pass | pasted | no |
`;
const RUN = `---
type: run
spec: SPEC-feat
worktree: /tmp/wt
branch: suspec/feat
status: exited
---

# Run — SPEC-feat

agent notes
`;
const FINDING = `---
type: finding
id: FIND-007
run: feat
severity: major
affected_areas:
  - src/feat
---

# Flaky retry loop

the close.
`;
const INTAKE = `---
type: intake
id: INTAKE-tick
ref: '#42'
---

# Ticket 42

snapshot body
`;

let root: string;
let repo: string;
let store: string;
beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'suspec-show-'));
    repo = join(root, 'repo');
    store = join(root, 'state', 'repo');
    mkdirSync(repo, { recursive: true });
    mkdirSync(join(store, 'archive'), { recursive: true });
    writeFileSync(join(store, 'spec-feat.md'), SPEC);
    writeFileSync(join(store, 'task-feat.md'), TASK);
    writeFileSync(join(store, 'task-xroot.md'), TASK_EMBEDDED);
    writeFileSync(join(store, 'review-feat.md'), REVIEW);
    writeFileSync(join(store, 'review-byspec.md'), REVIEW_SPEC_KEYED);
    writeFileSync(join(store, 'run-feat.md'), RUN);
    writeFileSync(join(store, 'finding-007.md'), FINDING);
    writeFileSync(join(store, 'intake-tick.md'), INTAKE);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const show = (kind: string, ref?: string) => show_artifact({ storeDir: store, repoDir: repo, kind, ref });

describe('show_artifact — store resolution (ADR-0137)', () => {
    it('checks — emits the contract version + the core checks (no file read)', () => {
        const r = show('checks');
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            const value = r.value.value as { version: string; checks: unknown[] };
            expect(value.version).toMatch(/^\d+\.\d+\.\d+$/);
            expect(value.checks.length).toBeGreaterThan(0);
        }
    });

    it('task — resolves the STORE task-<slug>.md and parses scope, areas, do-not-change, frontmatter', () => {
        const r = show('task', 'feat');
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            const value = r.value.value as Record<string, unknown>;
            expect(value.id).toBe('TASK-feat');
            expect(value.source).toBe('SPEC-feat');
            expect(value.status).toBe('ready');
            expect(value.scope).toEqual(['AC-001', 'AC-002']);
            expect(value.affectedAreas).toEqual(['src/feat']);
            expect(value.doNotChange).toEqual(['src/feat/frozen.ts']);
            // Co-located task: no embedded slice.
            expect(value.embeddedSpecId).toBeNull();
            expect(value.embeddedRequirements).toEqual([]);
        }
    });

    it('task — projects the cross-root embedded spec slice when present (ADR-0100 `## Spec snapshot`)', () => {
        const r = show('task', 'xroot');
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            const value = r.value.value as {
                embeddedSpecId: string | null;
                embeddedRequirements: { id: string; verifyCommand: string | null }[];
            };
            expect(value.embeddedSpecId).toBe('SPEC-remote');
            expect(value.embeddedRequirements).toEqual([{ id: 'AC-001', verifyCommand: 'a-test' }]);
        }
    });

    it('spec — resolves from the store by frontmatter id and projects requirements + verify commands', () => {
        const r = show('spec', 'SPEC-feat');
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            const value = r.value.value as {
                frontmatter: { id: string };
                requirements: { id: string; verifyCommand: string | null }[];
            };
            expect(value.frontmatter.id).toBe('SPEC-feat');
            expect(value.requirements[0].id).toBe('AC-001');
            expect(value.requirements[0].verifyCommand).toBe('a-test');
        }
    });

    it('spec — surfaces the `## Execution` run-record, fence-aware, ending at the next H2 (ADR-0103/0104)', () => {
        const r = show('spec', 'SPEC-feat');
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            const execution = (r.value.value as { execution: string | null }).execution;
            expect(execution).toContain('v0 shipped');
            // A `## …` heading quoted inside a fence is NOT read as the section boundary…
            expect(execution).toContain('## not a heading (inside a fence)');
            // …and the real next H2 (`## Dropped from sources`) is excluded.
            expect(execution).not.toContain('Dropped from sources');
        }
    });

    it('spec — execution is null when there is no `## Execution` section, or it is empty', () => {
        const noExec = `---\ntype: spec\nid: SPEC-noexec\nstatus: ready\nsources:\n  - self\n---\n\n## Requirements\n\n### AC-001 — one\nThe tool must do it.\nVerify with: a-test\n\n## Open questions\n\n- none.\n`;
        writeFileSync(join(store, 'spec-noexec.md'), noExec);
        const a = show('spec', 'SPEC-noexec');
        expect(isErr(a)).toBe(false);
        if (!isErr(a)) {
            expect((a.value.value as { execution: string | null }).execution).toBeNull();
        }
        // An Execution heading with no body (immediately followed by the next H2) reads as null, not ''.
        const emptyExec = `${noExec}\n## Execution\n\n## Dropped from sources\n\n- none.\n`;
        writeFileSync(join(store, 'spec-noexec.md'), emptyExec);
        const b = show('spec', 'SPEC-noexec');
        expect(isErr(b)).toBe(false);
        if (!isErr(b)) {
            expect((b.value.value as { execution: string | null }).execution).toBeNull();
        }
    });

    it('task + spec resolve by EITHER the bare slug or the prefixed id (canonical-key, #blind-field-test)', () => {
        const t = show('task', 'TASK-feat');
        expect(isErr(t)).toBe(false);
        if (!isErr(t)) {
            expect((t.value.value as { id: string }).id).toBe('TASK-feat');
        }
        const s = show('spec', 'feat');
        expect(isErr(s)).toBe(false);
        if (!isErr(s)) {
            expect((s.value.value as { frontmatter: { id: string } }).frontmatter.id).toBe('SPEC-feat');
        }
    });

    it('review — parses status, coverage rows, and the identity/staleness frontmatter', () => {
        const r = show('review', 'feat');
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            const value = r.value.value as {
                status: string;
                coverageRows: { id: string; result: string }[];
                frontmatter: { status: string | null; task: string | null; spec: string | null };
            };
            expect(value.status).toBe('needs-human');
            expect(value.coverageRows[0]).toMatchObject({ id: 'AC-001', result: 'Pass' });
            expect(value.frontmatter.status).toBe('needs-human');
            expect(value.frontmatter.task).toBe('TASK-feat');
            expect(value.frontmatter.spec).toBeNull();
        }
    });

    it('review — the task-less 1:1 review names its spec + carries the fast-track pins (ADR-0103/0107)', () => {
        const r = show('review', 'REVIEW-byspec');
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            const fm = (
                r.value.value as {
                    frontmatter: {
                        spec: string | null;
                        task: string | null;
                        reviewedSha: string | null;
                        evidenceHash: string | null;
                    };
                }
            ).frontmatter;
            expect(fm.spec).toBe('SPEC-feat');
            expect(fm.task).toBeNull();
            expect(fm.reviewedSha).toBe('abc1234');
            expect(fm.evidenceHash).toBe('deadbeefcafe0000');
        }
    });

    it('run — projects the run record: frontmatter (spec, status, branch) + the agent body', () => {
        const r = show('run', 'feat');
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            expect(r.value.kind).toBe('run');
            const value = r.value.value as {
                path: string;
                archived: boolean;
                frontmatter: Record<string, unknown>;
                body: string;
            };
            expect(value.path).toBe(join(store, 'run-feat.md'));
            expect(value.archived).toBe(false);
            expect(value.frontmatter.spec).toBe('SPEC-feat');
            expect(value.frontmatter.status).toBe('exited');
            expect(value.body).toContain('agent notes');
        }
    });

    it('finding — resolves by FIND id or filename and projects severity, run, areas, body', () => {
        for (const ref of ['FIND-007', 'finding-007', 'finding-007.md']) {
            const r = show('finding', ref);
            expect(isErr(r)).toBe(false);
            if (!isErr(r)) {
                const value = r.value.value as Record<string, unknown>;
                expect(value.id).toBe('FIND-007');
                expect(value.title).toBe('Flaky retry loop');
                expect(value.severity).toBe('major');
                expect(value.run).toBe('feat');
                expect(value.affectedAreas).toEqual(['src/feat']);
                expect(value.body).toContain('the close.');
                expect(value.archived).toBe(false);
            }
        }
    });

    it('intake — projects the snapshot: frontmatter + body', () => {
        const r = show('intake', 'tick');
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            const value = r.value.value as { frontmatter: Record<string, unknown>; body: string };
            expect(value.frontmatter.id).toBe('INTAKE-tick');
            expect(value.body).toContain('snapshot body');
        }
    });

    it('archive/ is the fallback: an archived artifact still resolves and reads archived:true', () => {
        writeFileSync(join(store, 'archive', 'run-old.md'), RUN);
        writeFileSync(join(store, 'archive', 'finding-042.md'), FINDING.replace('FIND-007', 'FIND-042'));
        const run = show('run', 'old');
        expect(isErr(run)).toBe(false);
        if (!isErr(run)) {
            expect((run.value.value as { archived: boolean }).archived).toBe(true);
        }
        const finding = show('finding', 'FIND-042');
        expect(isErr(finding)).toBe(false);
        if (!isErr(finding)) {
            expect((finding.value.value as { archived: boolean }).archived).toBe(true);
        }
        // A spec resolves from archive/ too — the AC-004 resolver aimed at the archive dir.
        rmSync(join(store, 'spec-feat.md'));
        writeFileSync(join(store, 'archive', 'spec-feat.md'), SPEC);
        expect(isErr(show('spec', 'SPEC-feat'))).toBe(false);
    });

    it('an open artifact wins over an archived namesake — the root is scanned first', () => {
        writeFileSync(join(store, 'archive', 'run-feat.md'), RUN.replace('exited', 'live'));
        const r = show('run', 'feat');
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            const value = r.value.value as { archived: boolean; frontmatter: Record<string, unknown> };
            expect(value.archived).toBe(false);
            expect(value.frontmatter.status).toBe('exited');
        }
    });

    it('accepts a repo file PATH with the kind omitted, inferring the kind from frontmatter type (R4-ISS-16)', () => {
        // A promoted/committed spec in the repo stays reachable via the path face.
        mkdirSync(join(repo, 'docs'), { recursive: true });
        writeFileSync(join(repo, 'docs', 'feat.md'), SPEC);
        const spec = show_artifact({ storeDir: store, repoDir: repo, kind: 'docs/feat.md' });
        expect(isErr(spec)).toBe(false);
        if (!isErr(spec)) {
            expect(spec.value.kind).toBe('spec');
            expect((spec.value.value as { requirements: unknown[] }).requirements).toHaveLength(1);
        }
        // …and a run file projects through the raw face.
        writeFileSync(join(repo, 'docs', 'run.md'), RUN);
        const run = show_artifact({ storeDir: store, repoDir: repo, kind: 'docs/run.md' });
        expect(isErr(run)).toBe(false);
        if (!isErr(run)) {
            expect(run.value.kind).toBe('run');
        }
        // …and a finding file projects through the finding face.
        writeFileSync(join(repo, 'docs', 'find.md'), FINDING);
        const finding = show_artifact({ storeDir: store, repoDir: repo, kind: 'docs/find.md' });
        expect(isErr(finding)).toBe(false);
        if (!isErr(finding)) {
            expect(finding.value.kind).toBe('finding');
            expect((finding.value.value as { id: string }).id).toBe('FIND-007');
        }
    });

    it('the path face works with NO store at all (storeDir null) — checks too', () => {
        writeFileSync(join(repo, 'plan.md'), TASK);
        const task = show_artifact({ storeDir: null, repoDir: repo, kind: 'plan.md' });
        expect(isErr(task)).toBe(false);
        if (!isErr(task)) {
            expect(task.value.kind).toBe('task');
            expect((task.value.value as { id: string }).id).toBe('TASK-feat');
        }
        expect(isErr(show_artifact({ storeDir: null, repoDir: repo, kind: 'checks' }))).toBe(false);
    });

    it('a store kind with NO store errors cleanly (exit-2 path), naming the miss', () => {
        const r = show_artifact({ storeDir: null, repoDir: repo, kind: 'spec', ref: 'SPEC-feat' });
        expect(isErr(r)).toBe(true);
        if (isErr(r)) {
            expect(r.error.message).toContain('no store');
        }
    });

    it('errors (exit-2 path) on a missing artifact / unknown kind / missing ref — naming the store searched', () => {
        const miss = show('task', 'nope');
        expect(isErr(miss)).toBe(true);
        if (isErr(miss)) {
            expect(miss.error.message).toContain('task-*.md');
            expect(miss.error.message).toContain(store);
        }
        expect(isErr(show('spec', 'SPEC-nope'))).toBe(true);
        expect(isErr(show('review', 'nope'))).toBe(true);
        expect(isErr(show('run', 'nope'))).toBe(true);
        expect(isErr(show('finding', 'FIND-999'))).toBe(true);
        expect(isErr(show('intake', 'nope'))).toBe(true);
        expect(isErr(show('bogus'))).toBe(true);
        for (const kind of ['spec', 'run', 'review', 'task', 'finding', 'intake']) {
            expect(isErr(show(kind))).toBe(true); // no ref
        }
    });

    it('refs are ids/slugs, never paths — traversal-shaped refs are refused before any read (#42)', () => {
        writeFileSync(join(root, 'secret.md'), SPEC); // a VALID spec outside repo AND store
        expect(isErr(show('spec', '../secret.md'))).toBe(true);
        expect(isErr(show('task', '../evil'))).toBe(true);
        expect(isErr(show('review', '../../evil'))).toBe(true);
        expect(isErr(show('spec', '/etc/passwd'))).toBe(true);
        // The path face never escapes the repo dir either — a confined check, not a join.
        expect(isErr(show_artifact({ storeDir: store, repoDir: repo, kind: '../secret.md' }))).toBe(true);
    });

    it('a dir masquerading as an artifact file is skipped, not read', () => {
        mkdirSync(join(store, 'run-dir.md'));
        expect(isErr(show('run', 'dir'))).toBe(true);
    });

    it('a raw artifact with no (or an unterminated) frontmatter fence keeps its whole text as body', () => {
        // No fence at all: still resolves by filename slug; the body is the whole trimmed text.
        writeFileSync(join(store, 'run-bare.md'), 'just notes, no fence\n');
        const bare = show('run', 'bare');
        expect(isErr(bare)).toBe(false);
        if (!isErr(bare)) {
            expect((bare.value.value as { body: string }).body).toBe('just notes, no fence');
        }
        // An unterminated fence: keep everything rather than guess at a body split.
        writeFileSync(join(store, 'run-torn.md'), '---\ntype: run\nnever closed\n');
        const torn = show('run', 'torn');
        expect(isErr(torn)).toBe(false);
        if (!isErr(torn)) {
            expect((torn.value.value as { body: string }).body).toContain('never closed');
        }
    });

    it('a store spec the spec parser refuses surfaces the parse error (exit-2 path), not a crash', () => {
        writeFileSync(join(store, 'spec-broken.md'), 'no frontmatter at all\n');
        expect(isErr(show('spec', 'broken'))).toBe(true);
    });

    it('finding — a scalar affected_areas reads as a one-item list; absent fields read null', () => {
        writeFileSync(
            join(store, 'finding-008.md'),
            '---\ntype: finding\naffected_areas: src/solo\n---\n\nno heading, no id\n'
        );
        const r = show('finding', 'finding-008');
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            const value = r.value.value as Record<string, unknown>;
            expect(value.affectedAreas).toEqual(['src/solo']);
            expect(value.id).toBeNull();
            expect(value.severity).toBeNull();
            expect(value.run).toBeNull();
            expect(value.title).toBe(join(store, 'finding-008.md')); // no `# ` heading → path fallback
        }
    });

    it('the path face falls through to unknown-kind when the file is missing or not a Suspec artifact', () => {
        // No such file: the .md-shaped arg never becomes a kind.
        expect(isErr(show_artifact({ storeDir: store, repoDir: repo, kind: 'nope.md' }))).toBe(true);
        // A frontmatter type outside the artifact kinds is not projected.
        writeFileSync(join(repo, 'notes.md'), '---\ntype: memo\n---\n\nx\n');
        expect(isErr(show_artifact({ storeDir: store, repoDir: repo, kind: 'notes.md' }))).toBe(true);
        // No frontmatter type at all.
        writeFileSync(join(repo, 'plain.md'), 'no frontmatter\n');
        expect(isErr(show_artifact({ storeDir: store, repoDir: repo, kind: 'plain.md' }))).toBe(true);
    });
});
