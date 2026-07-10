import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run } from '../check.ts';
import { CONTRACT_VERSION } from '../../../Core/services/checksContract.ts';

function spec(id: string): string {
    return `---
type: spec
id: ${id}
status: ready
sources:
  - ADR-0077
---

## Requirements

### AC-001 — does it
The tool must do it.
Verify with: a test.

### AC-002 — does it too
The tool must also do it.
Verify with: a test.

## Non-goals

- nope.

## Open questions

- none
`;
}

const CONFORMANT = spec('SPEC-x');

const TASK = `---
type: task
id: TASK-feat
source:
  - SPEC-x
scope: [AC-001, AC-002]
status: review-ready
---

# Task

## Run summary
`;

// A review whose Pass rows carry consistent verify blocks (cmd matches the spec's `a test.`).
const CLEAN_REVIEW = `---
type: review
id: REVIEW-feat
task: TASK-feat
status: needs-human
---

## Requirement coverage

| ID | Result | Evidence | Human attention |
|---|---|---|---|
| AC-001 | Pass | p | no |

\`\`\`verify id=AC-001 cmd="a test." result=pass
ok
\`\`\`

| AC-002 | Pass | p | no |

\`\`\`verify id=AC-002 cmd="a test." result=pass
ok
\`\`\`
`;

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

let dir: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'suspec-check-cmd-'));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

function capture(fn: () => number): { out: string; err: string; code: number } {
    const out: string[] = [];
    const errs: string[] = [];
    const o = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        out.push(String(chunk));
        return true;
    });
    const e = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        errs.push(String(chunk));
        return true;
    });
    try {
        const code = fn();
        return { out: out.join(''), err: errs.join(''), code };
    } finally {
        o.mockRestore();
        e.mockRestore();
    }
}

function write(name: string, content: string): string {
    const path = join(dir, name);
    writeFileSync(path, content);
    return path;
}

describe('check command — invocation shapes (ADR-0143)', () => {
    it('no artifact named → exit 2 with the usage on stderr', () => {
        const { code, err } = capture(() => run([]));
        expect(code).toBe(2);
        expect(err).toContain('no artifact named');
        expect(err).toContain('suspec check <artifact>');
    });

    it('a missing file → exit 2 with a message on stderr', () => {
        const { code, err } = capture(() => run([join(dir, 'nope.md')]));
        expect(code).toBe(2);
        expect(err).toContain('file not found');
    });

    it('a directory arg → exit 2 with a clean message, not an EISDIR crash', () => {
        mkdirSync(join(dir, 'feature'), { recursive: true });
        const { code, err } = capture(() => run([join(dir, 'feature')]));
        expect(code).toBe(2);
        expect(err).toContain('it is a directory');
    });

    it('--spec/--task with a non-review primary → exit 2 (companions belong to a review)', () => {
        const file = write('ok.md', CONFORMANT);
        const other = write('task.md', TASK);
        const { code, err } = capture(() => run([file, '--spec', other, '--task', other]));
        expect(code).toBe(2);
        expect(err).toContain('--spec/--task accompany a review packet');
    });

    it('a review packet alongside another artifact → exit 2 (a review is checked alone)', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const other = write('ok.md', CONFORMANT);
        const { code, err } = capture(() => run([review, other]));
        expect(code).toBe(2);
        expect(err).toContain('checked alone');
    });
});

describe('check command — `--contract` (the checks contract as JSON)', () => {
    it('dumps the contract: version + the core checks, C017 absent', () => {
        const { code, out } = capture(() => run(['--contract']));
        expect(code).toBe(0);
        const dump = JSON.parse(out) as { version: string; checks: { id: string; severity: string }[] };
        expect(dump.version).toBe(CONTRACT_VERSION);
        const ids = dump.checks.map((check) => check.id);
        expect(ids).toContain('C001');
        expect(ids).toContain('C012');
        expect(ids).toContain('C020');
        expect(ids).not.toContain('C017');
        expect(dump.checks.find((check) => check.id === 'C016')?.severity).toBe('hard-error');
    });

    it('--contract takes no other arguments → exit 2', () => {
        const file = write('ok.md', CONFORMANT);
        expect(capture(() => run(['--contract', file])).code).toBe(2);
        expect(capture(() => run(['--contract', '--spec', file])).code).toBe(2);
    });
});

describe('check command — spec checking (frontmatter-sniffed)', () => {
    it('a conformant spec → exit 0', () => {
        const file = write('ok.md', CONFORMANT);
        const { code, out } = capture(() => run([file]));
        expect(code).toBe(0);
        expect(out).toContain('clean');
    });

    it('a spec with only a warning (empty Non-goals → C005) → exit 1', () => {
        const file = write('warn.md', CONFORMANT.replace('- nope.', ''));
        const { code, out } = capture(() => run([file]));
        expect(code).toBe(1);
        expect(out).toContain('C005');
    });

    it('a spec missing a Verify line → exit 2 (C003 hard-error)', () => {
        const file = write('bad.md', CONFORMANT.replace('Verify with: a test.\n\n### AC-002', '\n### AC-002'));
        const { code } = capture(() => run([file]));
        expect(code).toBe(2);
    });

    it('--json emits the machine report', () => {
        const file = write('ok.md', CONFORMANT);
        const { code, out } = capture(() => run([file, '--json']));
        expect(code).toBe(0);
        expect(JSON.parse(out)).toMatchObject({ level: 'clean', diagnostics: [] });
    });

    it('C009 resolves artifact-relative: a ref beside the spec resolves; a root-style ref does not', () => {
        mkdirSync(join(dir, 'specs', 'feat'), { recursive: true });
        mkdirSync(join(dir, 'intake'), { recursive: true });
        writeFileSync(join(dir, 'intake', 'sup-204.md'), 'ticket\n');
        // artifact-relative: ../../intake/sup-204.md resolves from specs/feat/spec.md → clean
        const good = join(dir, 'specs', 'feat', 'spec.md');
        writeFileSync(good, CONFORMANT.replace('- ADR-0077', '- ../../intake/sup-204.md'));
        expect(capture(() => run([good])).code).toBe(0);
        // a bare root-style ref is NOT resolved against any inferred root → C009 blocking
        const bad = join(dir, 'specs', 'feat', 'spec2.md');
        writeFileSync(bad, spec('SPEC-y').replace('- ADR-0077', '- intake/sup-204.md'));
        const { code, out } = capture(() => run([bad]));
        expect(code).toBe(2);
        expect(out).toContain('C009');
    });

    it.each(['task', 'finding', 'adr', 'intake', 'inventory'])(
        'a type: %s file gets a clean "no checks for type" note (exit 0), never spec-check category errors',
        (artifactType) => {
            const file = write(`a-${artifactType}.md`, `---\ntype: ${artifactType}\nid: X-001\n---\n\n# body\n`);
            const { code, out } = capture(() => run([file]));
            expect(code).toBe(0);
            expect(out).toContain(`no checks for type ${artifactType}`);
            expect(out).not.toContain('C00');
        }
    );
});

describe('check command — multiple positionals (exit = max severity; C002 across the set)', () => {
    it('checks every named file in one process; exit is the max across them', () => {
        const good = write('good.md', CONFORMANT);
        const bad = write('bad.md', spec('SPEC-y').replace('Verify with: a test.\n\n### AC-002', '\n### AC-002'));
        const { code, out } = capture(() => run([good, bad]));
        expect(code).toBe(2); // max(0 from good, 2 from bad)
        expect(out).toContain('good.md');
        expect(out).toContain('bad.md');
    });

    it('clean + warning → exit 1', () => {
        const good = write('good.md', CONFORMANT);
        const warn = write('warn.md', spec('SPEC-y').replace('- nope.', ''));
        expect(capture(() => run([good, warn])).code).toBe(1);
    });

    it('two artifacts claiming the same frontmatter id → C002 duplicate-id (exit 2)', () => {
        const a = write('a.md', CONFORMANT);
        const b = write('b.md', CONFORMANT);
        const { code, out } = capture(() => run([a, b]));
        expect(code).toBe(2);
        expect(out).toContain('C002');
        expect(out).toContain('duplicate-id');
    });

    it('the same path passed twice is deduped — no self-collision C002', () => {
        const a = write('a.md', CONFORMANT);
        const { code, out } = capture(() => run([a, a]));
        expect(code).toBe(0);
        expect(out).not.toContain('C002');
    });
});

describe('check command — review packets need explicit companions (ADR-0143 D3)', () => {
    it('a review without --spec and --task → exit 2 naming both flags', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const { code, err } = capture(() => run([review]));
        expect(code).toBe(2);
        expect(err).toContain('--spec and --task');
    });

    it('a review with --spec but no --task → exit 2 naming --task', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const specPath = write('spec.md', CONFORMANT);
        const { code, err } = capture(() => run([review, '--spec', specPath]));
        expect(code).toBe(2);
        expect(err).toContain('missing --task');
        expect(err).not.toContain('missing --spec');
    });

    it('a review with --task but no --spec → exit 2 naming --spec', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const taskPath = write('task.md', TASK);
        const { code, err } = capture(() => run([review, '--task', taskPath]));
        expect(code).toBe(2);
        expect(err).toContain('missing --spec');
    });

    it('a companion path that does not exist → exit 2 naming the flag', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const specPath = write('spec.md', CONFORMANT);
        const { code, err } = capture(() => run([review, '--spec', specPath, '--task', join(dir, 'nope.md')]));
        expect(code).toBe(2);
        expect(err).toContain('--task file not found');
    });

    it('a review with both companions runs the reconcile → clean review exits 0', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const specPath = write('spec.md', CONFORMANT);
        const taskPath = write('task.md', TASK);
        const { code, out } = capture(() => run([review, '--spec', specPath, '--task', taskPath]));
        expect(code).toBe(0);
        expect(out).toContain('clean');
    });

    it('an empty-Evidence Pass row → C016 blocks (exit 2)', () => {
        const review = write(
            'review.md',
            CLEAN_REVIEW.replace('| AC-001 | Pass | p | no |', '| AC-001 | Pass |  | no |')
        );
        const specPath = write('spec.md', CONFORMANT);
        const taskPath = write('task.md', TASK);
        const { code, out } = capture(() => run([review, '--spec', specPath, '--task', taskPath]));
        expect(code).toBe(2);
        expect(out).toContain('C016');
    });

    it('a review whose task: ref mismatches the handed packet → C020 blocks (exit 2)', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const specPath = write('spec.md', CONFORMANT);
        const taskPath = write('task.md', TASK.replace('id: TASK-feat', 'id: TASK-other'));
        const { code, out } = capture(() => run([review, '--spec', specPath, '--task', taskPath]));
        expect(code).toBe(2);
        expect(out).toContain('C020');
    });

    it('a coverage gap → C012 warning (exit 1) with --json machine output', () => {
        const gappy = `---
type: review
id: REVIEW-feat
task: TASK-feat
status: needs-human
---

## Requirement coverage

| ID | Result | Evidence | Human attention |
|---|---|---|---|
| AC-001 | Pass | p | no |

\`\`\`verify id=AC-001 cmd="a test." result=pass
ok
\`\`\`
`;
        const review = write('review.md', gappy);
        const specPath = write('spec.md', CONFORMANT);
        const taskPath = write('task.md', TASK);
        const { code, out } = capture(() => run([review, '--spec', specPath, '--task', taskPath, '--json']));
        expect(code).toBe(1);
        const report = JSON.parse(out) as { level: string; diagnostics: { code: string }[] };
        expect(report.level).toBe('warning');
        expect(report.diagnostics.some((d) => d.code === 'C012')).toBe(true);
    });
});

describe('check command — change-plan routing (C010/C011)', () => {
    it('a valid change plan (preserves-ref resolves against a sibling spec) → exit 0', () => {
        mkdirSync(join(dir, 'cart'), { recursive: true });
        writeFileSync(join(dir, 'cart', 'spec.md'), spec('SPEC-cart'));
        mkdirSync(join(dir, 'plans'), { recursive: true });
        const planPath = join(dir, 'plans', 'change-plan.md');
        writeFileSync(planPath, changePlan('SPEC-cart#AC-001'));
        const { code, out } = capture(() => run([planPath]));
        expect(code).toBe(0);
        expect(out).toContain('clean');
    });

    it('a change plan with an unresolvable preserves-ref → exit 2 (C010 hard-error)', () => {
        mkdirSync(join(dir, 'cart'), { recursive: true });
        writeFileSync(join(dir, 'cart', 'spec.md'), spec('SPEC-cart'));
        mkdirSync(join(dir, 'plans'), { recursive: true });
        const planPath = join(dir, 'plans', 'change-plan.md');
        writeFileSync(planPath, changePlan('SPEC-cart#AC-999'));
        const { code, out } = capture(() => run([planPath]));
        expect(code).toBe(2);
        expect(out).toContain('C010');
    });

    it('--json emits the change-plan check result (plan-local PG ref → clean)', () => {
        mkdirSync(join(dir, 'plans'), { recursive: true });
        const planPath = join(dir, 'plans', 'change-plan.md');
        writeFileSync(planPath, changePlan('PG-001'));
        const { code, out } = capture(() => run([planPath, '--json']));
        expect(code).toBe(0);
        expect(JSON.parse(out)).toMatchObject({ level: 'clean', diagnostics: [] });
    });
});
