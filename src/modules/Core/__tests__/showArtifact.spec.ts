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

let ws: string;
beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'swarm-show-'));
    mkdirSync(join(ws, 'specs', 'feat'), { recursive: true });
    mkdirSync(join(ws, 'tasks'), { recursive: true });
    mkdirSync(join(ws, 'reviews'), { recursive: true });
    writeFileSync(join(ws, 'specs', 'feat', 'spec.md'), SPEC);
    writeFileSync(join(ws, 'tasks', 'feat.md'), TASK);
    writeFileSync(join(ws, 'reviews', 'feat.md'), REVIEW);
});
afterEach(() => rmSync(ws, { recursive: true, force: true }));

describe('show_artifact', () => {
    it('checks — emits the contract version + the core checks (no file read)', () => {
        const r = show_artifact({ workspaceDir: ws, kind: 'checks' });
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            const value = r.value.value as { version: string; checks: unknown[] };
            expect(value.version).toMatch(/^\d+\.\d+\.\d+$/);
            expect(value.checks.length).toBeGreaterThan(0);
        }
    });

    it('task — parses scope, affected areas, and frontmatter id/source/status', () => {
        const r = show_artifact({ workspaceDir: ws, kind: 'task', ref: 'feat' });
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            const value = r.value.value as Record<string, unknown>;
            expect(value.id).toBe('TASK-feat');
            expect(value.source).toBe('SPEC-feat');
            expect(value.status).toBe('ready');
            expect(value.scope).toEqual(['AC-001', 'AC-002']);
            expect(value.affectedAreas).toEqual(['src/feat']);
        }
    });

    it('spec — resolves by frontmatter id and projects the requirements + verify commands', () => {
        const r = show_artifact({ workspaceDir: ws, kind: 'spec', ref: 'SPEC-feat' });
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            const value = r.value.value as { frontmatter: { id: string }; requirements: { id: string; verifyCommand: string | null }[] };
            expect(value.frontmatter.id).toBe('SPEC-feat');
            expect(value.requirements[0].id).toBe('AC-001');
            expect(value.requirements[0].verifyCommand).toBe('a-test');
        }
    });

    it('spec — also resolves by workspace-relative path', () => {
        const r = show_artifact({ workspaceDir: ws, kind: 'spec', ref: 'specs/feat/spec.md' });
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            expect((r.value.value as { frontmatter: { id: string } }).frontmatter.id).toBe('SPEC-feat');
        }
    });

    it('review — parses status, coverage rows, and verify blocks', () => {
        const r = show_artifact({ workspaceDir: ws, kind: 'review', ref: 'feat' });
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            const value = r.value.value as { status: string; coverageRows: { id: string; result: string }[] };
            expect(value.status).toBe('needs-human');
            expect(value.coverageRows[0]).toMatchObject({ id: 'AC-001', result: 'Pass' });
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
});
