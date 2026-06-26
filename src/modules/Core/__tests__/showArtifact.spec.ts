import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { show_artifact } from '../useCases/showArtifact.ts';
import { isErr } from '../../../infra/errors/result.ts';

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

let ws: string;
beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'corpus-show-'));
    mkdirSync(join(ws, 'specs', 'feat'), { recursive: true });
    mkdirSync(join(ws, 'tasks'), { recursive: true });
    mkdirSync(join(ws, 'reviews'), { recursive: true });
    writeFileSync(join(ws, 'specs', 'feat', 'spec.md'), SPEC);
    writeFileSync(join(ws, 'tasks', 'feat.md'), TASK);
    writeFileSync(join(ws, 'tasks', 'xroot.md'), TASK_EMBEDDED);
    writeFileSync(join(ws, 'reviews', 'feat.md'), REVIEW);
    writeFileSync(join(ws, 'reviews', 'byspec.md'), REVIEW_SPEC_KEYED);
});
afterEach(() => rmSync(ws, { recursive: true, force: true }));

describe('show_artifact', () => {
    it('accepts a file PATH with the kind omitted, inferring the kind from frontmatter type (R4-ISS-16)', () => {
        // `corpus show specs/feat/spec.md` (no `spec` kind) must work like `corpus check <path>`.
        const spec = show_artifact({ workspaceDir: ws, kind: 'specs/feat/spec.md' });
        expect(isErr(spec)).toBe(false);
        if (!isErr(spec)) {
            expect(spec.value.kind).toBe('spec');
            expect((spec.value.value as { requirements: unknown[] }).requirements).toHaveLength(1);
        }
        // ...and a task path infers the task kind (resolved via its basename stem).
        const task = show_artifact({ workspaceDir: ws, kind: 'tasks/feat.md' });
        expect(isErr(task)).toBe(false);
        if (!isErr(task)) {
            expect(task.value.kind).toBe('task');
        }
    });

    it('checks — emits the contract version + the core checks (no file read)', () => {
        const r = show_artifact({ workspaceDir: ws, kind: 'checks' });
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            const value = r.value.value as { version: string; checks: unknown[] };
            expect(value.version).toMatch(/^\d+\.\d+\.\d+$/);
            expect(value.checks.length).toBeGreaterThan(0);
        }
    });

    it('task — parses scope, affected areas, do-not-change, and frontmatter id/source/status', () => {
        const r = show_artifact({ workspaceDir: ws, kind: 'task', ref: 'feat' });
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
        const r = show_artifact({ workspaceDir: ws, kind: 'task', ref: 'xroot' });
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

    it('spec — resolves by frontmatter id and projects the requirements + verify commands', () => {
        const r = show_artifact({ workspaceDir: ws, kind: 'spec', ref: 'SPEC-feat' });
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
        const r = show_artifact({ workspaceDir: ws, kind: 'spec', ref: 'SPEC-feat' });
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
        writeFileSync(join(ws, 'specs', 'feat', 'spec.md'), noExec);
        const a = show_artifact({ workspaceDir: ws, kind: 'spec', ref: 'SPEC-noexec' });
        expect(isErr(a)).toBe(false);
        if (!isErr(a)) {
            expect((a.value.value as { execution: string | null }).execution).toBeNull();
        }
        // An Execution heading with no body (immediately followed by the next H2) reads as null, not ''.
        const emptyExec = `${noExec}\n## Execution\n\n## Dropped from sources\n\n- none.\n`;
        writeFileSync(join(ws, 'specs', 'feat', 'spec.md'), emptyExec);
        const b = show_artifact({ workspaceDir: ws, kind: 'spec', ref: 'SPEC-noexec' });
        expect(isErr(b)).toBe(false);
        if (!isErr(b)) {
            expect((b.value.value as { execution: string | null }).execution).toBeNull();
        }
    });

    it('spec — also resolves by workspace-relative path', () => {
        const r = show_artifact({ workspaceDir: ws, kind: 'spec', ref: 'specs/feat/spec.md' });
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            expect((r.value.value as { frontmatter: { id: string } }).frontmatter.id).toBe('SPEC-feat');
        }
    });

    it('task + spec resolve by EITHER the bare slug or the prefixed id (canonical-key, #blind-field-test)', () => {
        // The fixture file is the legacy bare tasks/feat.md; the TASK- id form must resolve it too.
        const t = show_artifact({ workspaceDir: ws, kind: 'task', ref: 'TASK-feat' });
        expect(isErr(t)).toBe(false);
        if (!isErr(t)) {
            expect((t.value.value as { id: string }).id).toBe('TASK-feat');
        }
        // The spec resolves by the bare slug, not only the SPEC- id (the MCP get_spec gap).
        const s = show_artifact({ workspaceDir: ws, kind: 'spec', ref: 'feat' });
        expect(isErr(s)).toBe(false);
        if (!isErr(s)) {
            expect((s.value.value as { frontmatter: { id: string } }).frontmatter.id).toBe('SPEC-feat');
        }
    });

    it('review — parses status, coverage rows, verify blocks, and the identity/staleness frontmatter', () => {
        const r = show_artifact({ workspaceDir: ws, kind: 'review', ref: 'feat' });
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            const value = r.value.value as {
                status: string;
                coverageRows: { id: string; result: string }[];
                frontmatter: { status: string | null; task: string | null; spec: string | null };
            };
            expect(value.status).toBe('needs-human');
            expect(value.coverageRows[0]).toMatchObject({ id: 'AC-001', result: 'Pass' });
            // The new frontmatter projection: a task-keyed review names its task; no `spec:`.
            expect(value.frontmatter.status).toBe('needs-human');
            expect(value.frontmatter.task).toBe('TASK-feat');
            expect(value.frontmatter.spec).toBeNull();
        }
    });

    it('review — the task-less 1:1 review names its spec + carries the fast-track pins (ADR-0103/0107)', () => {
        const r = show_artifact({ workspaceDir: ws, kind: 'review', ref: 'byspec' });
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            const fm = (r.value.value as {
                frontmatter: { spec: string | null; task: string | null; reviewedSha: string | null; evidenceHash: string | null };
            }).frontmatter;
            expect(fm.spec).toBe('SPEC-feat');
            expect(fm.task).toBeNull();
            expect(fm.reviewedSha).toBe('abc1234');
            expect(fm.evidenceHash).toBe('deadbeefcafe0000');
        }
    });

    it('errors (exit-2 path) on a missing task / unresolvable spec / unknown kind / missing ref', () => {
        expect(isErr(show_artifact({ workspaceDir: ws, kind: 'task', ref: 'nope' }))).toBe(true);
        expect(isErr(show_artifact({ workspaceDir: ws, kind: 'spec', ref: 'SPEC-nope' }))).toBe(true);
        expect(isErr(show_artifact({ workspaceDir: ws, kind: 'review', ref: 'nope' }))).toBe(true);
        expect(isErr(show_artifact({ workspaceDir: ws, kind: 'bogus' }))).toBe(true);
        expect(isErr(show_artifact({ workspaceDir: ws, kind: 'task' }))).toBe(true); // no ref
        expect(isErr(show_artifact({ workspaceDir: ws, kind: 'spec' }))).toBe(true);
        expect(isErr(show_artifact({ workspaceDir: ws, kind: 'review' }))).toBe(true);
    });

    it('confines reads to the workspace — a valid spec OUTSIDE the workspace is refused, not read (#42)', () => {
        const root = mkdtempSync(join(tmpdir(), 'corpus-show-root-'));
        try {
            const inner = join(root, 'ws');
            mkdirSync(inner, { recursive: true });
            writeFileSync(join(root, 'secret.md'), SPEC); // a VALID spec outside the workspace
            // Without confinement, `../secret.md` would resolve + read + project the outside file.
            expect(isErr(show_artifact({ workspaceDir: inner, kind: 'spec', ref: '../secret.md' }))).toBe(true);
            // Defense-in-depth on the stem forms (a `/` or `..` is rejected before the read).
            expect(isErr(show_artifact({ workspaceDir: inner, kind: 'task', ref: '../evil' }))).toBe(true);
            expect(isErr(show_artifact({ workspaceDir: inner, kind: 'review', ref: '../../evil' }))).toBe(true);
            expect(isErr(show_artifact({ workspaceDir: inner, kind: 'spec', ref: '/etc/passwd' }))).toBe(true);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
