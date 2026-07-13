import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run } from '../check.ts';

function spec(id: string): string {
    return `---
type: spec
id: ${id}
status: ready
sources:
  - ADR-0077
---

## Intent

Prove the checker behavior.

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

## Source

SPEC-x

## Scope

AC-001, AC-002

## Do not change

None.

## Affected areas

Checker tests.

## Verify

Exit status: 0

\`\`\`text
Tests: 12 passed, 12 total
\`\`\`

## Agent instructions

Implement the scoped work.

## Findings

None.

## Run summary

Verification is recorded above.
`;

// A review whose Supported rows carry consistent verify blocks (cmd matches the spec's `a test.`).
const CLEAN_REVIEW = `---
type: review
id: REVIEW-feat
task: TASK-feat
decision: pending
---

## Requirement coverage

| ID | Assessment | Evidence |
|---|---|---|
| AC-001 | Supported | p |

\`\`\`verify id=AC-001 cmd="a test." result=pass
ok
\`\`\`

| AC-002 | Supported | p |

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

## Preservation guarantees

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

const unreadableFilesAreEnforced = (() => {
    const probeDir = mkdtempSync(join(tmpdir(), 'suspec-check-unreadable-probe-'));
    const probe = join(probeDir, 'probe.md');
    try {
        writeFileSync(probe, 'probe');
        chmodSync(probe, 0o000);
        try {
            readFileSync(probe, 'utf8');
            return false;
        } catch {
            return true;
        }
    } finally {
        chmodSync(probe, 0o600);
        rmSync(probeDir, { recursive: true, force: true });
    }
})();

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

    it('an unknown option fails before artifact loading', () => {
        const missing = join(dir, 'never-read.md');
        const { code, err } = capture(() => run(['--definitely-unknown', missing]));
        expect(code).toBe(2);
        expect(err).toContain('unknown option: --definitely-unknown');
        expect(err).not.toContain('file not found');
    });

    it.each([
        ['terminal --spec', ['review.md', '--spec'], '--spec'],
        ['terminal --task', ['review.md', '--task'], '--task'],
        ['--spec followed by another option', ['review.md', '--spec', '--task', 'task.md'], '--spec'],
        ['--task followed by help', ['review.md', '--task', '--help'], '--task'],
        ['empty --spec assignment', ['review.md', '--spec='], '--spec'],
        ['empty --task assignment', ['review.md', '--task='], '--task'],
    ])('%s fails as a missing option value before artifact loading', (_name, argv, flag) => {
        const { code, err } = capture(() => run(argv));
        expect(code).toBe(2);
        expect(err).toContain(`option ${flag} requires a value`);
        expect(err).not.toContain('file not found');
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

    it('a review alongside a missing path → only the file error, never a contradictory arity error', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const { code, err } = capture(() => run([review, join(dir, 'nope.md')]));
        expect(code).toBe(2);
        expect(err).toContain('file not found');
        expect(err).not.toContain('checked alone');
        expect(err).not.toContain('missing --spec');
    });

    it('a load failure with --json emits exactly one JSON document on stdout', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const { code, out } = capture(() => run([review, join(dir, 'nope.md'), '--json']));
        expect(code).toBe(2);
        expect(JSON.parse(out)).toMatchObject({ error: 'Usage' }); // throws on concatenated documents
    });

    it.skipIf(!unreadableFilesAreEnforced)('an unreadable primary emits structured JSON and exits 2', () => {
        const file = write('unreadable.md', CONFORMANT);
        chmodSync(file, 0o000);
        try {
            const { code, out } = capture(() => run([file, '--json']));
            expect(code).toBe(2);
            expect(JSON.parse(out)).toMatchObject({ error: 'Usage', message: expect.stringContaining('cannot read') });
        } finally {
            chmodSync(file, 0o600);
        }
    });

    it.each([
        {
            name: 'primary stat',
            argv: ['/virtual/spec.md', '--json'],
            isDirectory: () => {
                throw new Error('injected stat failure');
            },
            read: () => CONFORMANT,
        },
        {
            name: 'primary read',
            argv: ['/virtual/spec.md', '--json'],
            isDirectory: () => false,
            read: () => {
                throw new Error('injected read failure');
            },
        },
        {
            name: 'companion stat',
            argv: ['/virtual/review.md', '--spec', '/virtual/spec.md', '--json'],
            isDirectory: (path: string) => {
                if (path.endsWith('/spec.md')) throw new Error('injected stat failure');
                return false;
            },
            read: () => CLEAN_REVIEW.replace('task: TASK-feat\n', ''),
        },
        {
            name: 'companion read',
            argv: ['/virtual/review.md', '--spec', '/virtual/spec.md', '--json'],
            isDirectory: () => false,
            read: (path: string) => {
                if (path.endsWith('/spec.md')) throw new Error('injected read failure');
                return CLEAN_REVIEW.replace('task: TASK-feat\n', '');
            },
        },
    ])('$name failure emits the normal structured JSON error and exits 2', ({ argv, isDirectory, read }) => {
        const { code, out } = capture(() =>
            run(argv, {
                exists: () => true,
                identity: (path) => path,
                isDirectory,
                read,
            })
        );
        expect(code).toBe(2);
        expect(JSON.parse(out)).toMatchObject({ error: 'Usage', message: expect.stringContaining('cannot') });
    });

    it('keeps an injected read failure on the plain stderr-only error path', () => {
        const { code, out, err } = capture(() =>
            run(['/virtual/spec.md'], {
                exists: () => true,
                identity: (path) => path,
                isDirectory: () => false,
                read: () => {
                    throw new Error('injected read failure');
                },
            })
        );
        expect(code).toBe(2);
        expect(out).toBe('');
        expect(err).toContain('cannot read');
    });
});

describe('check command — `--contract` (the checks contract as JSON)', () => {
    it('dumps the contract: version + the core checks, C017 absent', () => {
        const { code, out } = capture(() => run(['--contract']));
        expect(code).toBe(0);
        const dump = JSON.parse(out) as { version: string; checks: { id: string; severity: string }[] };
        // Shape only — exact-version equality is Core's business (contractDump.spec.ts,
        // checksContract.spec.ts drift-guard); reaching into Core internals for the
        // constant would cross the module boundary.
        expect(dump.version).toMatch(/^\d+\.\d+\.\d+$/);
        const ids = dump.checks.map((check) => check.id);
        expect(ids).toContain('C001');
        expect(ids).toContain('C012');
        expect(ids).toContain('C020');
        expect(ids).not.toContain('C017');
        expect(dump.checks.find((check) => check.id === 'C016')?.severity).toBe('hard-error');
    });

    it('--contract takes no artifacts or companions → exit 2', () => {
        const file = write('ok.md', CONFORMANT);
        expect(capture(() => run(['--contract', file])).code).toBe(2);
        expect(capture(() => run(['--contract', '--spec', file])).code).toBe(2);
    });

    it('--contract --json is accepted because the contract dump is already JSON', () => {
        const { code, out } = capture(() => run(['--contract', '--json']));
        expect(code).toBe(0);
        const dump = JSON.parse(out) as { version: string };
        expect(dump.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
});

describe('check command — spec checking (frontmatter-sniffed)', () => {
    it('a conformant spec → exit 0', () => {
        const file = write('ok.md', CONFORMANT);
        const { code, out } = capture(() => run([file]));
        expect(code).toBe(0);
        expect(out).toContain('clean');
    });

    it('a spec missing a Verify line → exit 2 (C003 hard-error)', () => {
        const file = write('bad.md', CONFORMANT.replace('Verify with: a test.\n\n### AC-002', '\n### AC-002'));
        const { code } = capture(() => run([file]));
        expect(code).toBe(2);
    });

    it('a spec missing Intent → exit 2 (C021 hard-error)', () => {
        const file = write('bad-intent.md', CONFORMANT.replace('## Intent\n\nProve the checker behavior.\n\n', ''));
        const { code, out } = capture(() => run([file]));
        expect(code).toBe(2);
        expect(out).toContain('C021');
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

    it.each(['inventory', 'audit', 'research', 'inspection'])(
        'a type: %s file gets a clean "no checks for type" note (exit 0), never spec checker errors',
        (artifactType) => {
            const file = write(`a-${artifactType}.md`, `---\ntype: ${artifactType}\nid: X-001\n---\n\n# body\n`);
            const { code, out } = capture(() => run([file]));
            expect(code).toBe(0);
            expect(out).toContain(`no checks for type ${artifactType}`);
            expect(out).not.toContain('C00');
        }
    );

    it('rejects a type-less file instead of guessing a checker face', () => {
        const typeless = CONFORMANT.replace('type: spec\n', '');
        const file = write('typeless.md', typeless);
        const result = capture(() => run([file]));
        expect(result.code).toBe(2);
        expect(result.err).toContain('must declare a non-empty `type:`');
    });

    it('rejects unknown artifact types', () => {
        const file = write('unknown.md', '---\ntype: specc\nid: X\n---\n');
        const result = capture(() => run([file]));
        expect(result.code).toBe(2);
        expect(result.err).toContain('unknown type `specc`');
    });
});

describe('check command — the type sniff reads the whole frontmatter fence as YAML', () => {
    it('a quoted `type: "review"` dispatches as a review, never the "no checks" skip (exit 2 naming --spec)', () => {
        const review = write('review.md', CLEAN_REVIEW.replace('type: review', 'type: "review"'));
        const { code, err, out } = capture(() => run([review]));
        expect(code).toBe(2);
        expect(err).toContain('missing --spec');
        expect(out).not.toContain('no checks for type');
    });

    it('a quoted `type: "spec"` (and an inline-commented one) runs the spec checks', () => {
        const quoted = write('quoted.md', CONFORMANT.replace('type: spec', 'type: "spec"'));
        const quotedRun = capture(() => run([quoted]));
        expect(quotedRun.code).toBe(0);
        expect(quotedRun.out).toContain('clean');
        expect(quotedRun.out).not.toContain('no checks for type');
        const commented = write('commented.md', CONFORMANT.replace('type: spec', 'type: spec # canonical'));
        const commentedRun = capture(() => run([commented]));
        expect(commentedRun.code).toBe(0);
        expect(commentedRun.out).not.toContain('no checks for type');
    });

    it('a leading UTF-8 BOM never blinds the sniff — a BOM-prefixed review still dispatches (exit 2 naming --spec)', () => {
        const review = write('bom.md', `\uFEFF${CLEAN_REVIEW}`);
        const { code, err, out } = capture(() => run([review]));
        expect(code).toBe(2);
        expect(err).toContain('missing --spec');
        expect(out).not.toContain('no checks for type');
    });

    it('rejects an empty quoted type', () => {
        const file = write('empty-type.md', CONFORMANT.replace('type: spec', 'type: ""'));
        const { code, err } = capture(() => run([file]));
        expect(code).toBe(2);
        expect(err).toContain('must declare a non-empty `type:`');
    });

    it('a `type:` past the 12th line of a long frontmatter still dispatches (exit 2 naming --spec)', () => {
        const filler = Array.from({ length: 11 }, (_, i) => `f${i + 1}: x`).join('\n');
        const review = write('deep.md', CLEAN_REVIEW.replace('type: review', `${filler}\ntype: review`));
        const { code, err } = capture(() => run([review]));
        expect(code).toBe(2);
        expect(err).toContain('missing --spec');
    });

    it('a `type:` line in the body cannot satisfy the required frontmatter type', () => {
        const typeless = CONFORMANT.replace('type: spec\n', '');
        const file = write('body-type.md', `${typeless}\ntype: review\n`);
        const { code, err } = capture(() => run([file]));
        expect(code).toBe(2);
        expect(err).not.toContain('missing --spec');
        expect(err).toContain('must declare a non-empty `type:`');
    });

    it('rejects a fence-less file through the strict parser', () => {
        const file = write('nofence.md', 'type: review\n\n# not frontmatter\n');
        const { code, err, out } = capture(() => run([file]));
        expect(code).toBe(2);
        expect(err).not.toContain('missing --spec');
        expect(out).not.toContain('no checks for type');
        expect(err).toContain('frontmatter fence');
    });
});

describe('check command — task checking (C022-C024)', () => {
    it('checks a complete task directly', () => {
        const file = write('task.md', TASK);
        const { code, out } = capture(() => run([file]));
        expect(code).toBe(0);
        expect(out).toContain('clean');
    });

    it('C022 rejects missing required structure', () => {
        const file = write('task.md', TASK.replace('## Source\n\nSPEC-x\n\n', ''));
        const { code, out } = capture(() => run([file]));
        expect(code).toBe(2);
        expect(out).toContain('C022');
    });

    it.each(['tests passed', 'TEST PASSED.', 'all checks succeeded', 'CHECKS SUCCEEDED.'])(
        'C023 rejects a numeric exit plus a sole generic fenced claim: %s',
        (claim) => {
            const file = write('task.md', TASK.replace('Tests: 12 passed, 12 total', claim));
            const { code, out } = capture(() => run([file]));
            expect(code).toBe(2);
            expect(out).toContain('C023');
        }
    );

    it('C023 still rejects an unfenced bare verification claim', () => {
        const file = write(
            'task.md',
            TASK.replace('```text\nTests: 12 passed, 12 total\n```', 'Tests: 12 passed, 12 total')
        );
        const { code, out } = capture(() => run([file]));
        expect(code).toBe(2);
        expect(out).toContain('C023');
    });

    it('C024 rejects an unresolved blocking decision at closed', () => {
        const file = write(
            'task.md',
            TASK.replace('status: review-ready', 'status: closed').replace(
                '## Findings\n\nNone.',
                '## Findings\n\n- Blocking: choose an API.'
            )
        );
        const { code, out } = capture(() => run([file]));
        expect(code).toBe(2);
        expect(out).toContain('C024');
    });
});

// Whether the temp volume resolves paths case-insensitively (e.g. macOS APFS) — probed once
// at collection time, so the case-variant test below skips (not silently passes) on
// case-sensitive volumes such as CI's ext4, where a case variant aliases nothing.
const caseInsensitiveVolume = (() => {
    const probe = mkdtempSync(join(tmpdir(), 'suspec-check-case-probe-'));
    try {
        writeFileSync(join(probe, 'probe.md'), '');
        return existsSync(join(probe, 'PROBE.MD'));
    } finally {
        rmSync(probe, { recursive: true, force: true });
    }
})();

describe('check command — multiple positionals (exit = max severity; C002 across the set)', () => {
    it('checks every named file in one process; exit is the max across them', () => {
        const good = write('good.md', CONFORMANT);
        const bad = write('bad.md', spec('SPEC-y').replace('Verify with: a test.\n\n### AC-002', '\n### AC-002'));
        const { code, out } = capture(() => run([good, bad]));
        expect(code).toBe(2); // max(0 from good, 2 from bad)
        expect(out).toContain('good.md');
        expect(out).toContain('bad.md');
    });

    it('--json emits one parseable JSON Lines record per report', () => {
        const first = write('first.md', CONFORMANT);
        const second = write('second.md', spec('SPEC-y'));
        const { code, out } = capture(() => run([first, second, '--json']));
        const reports = out
            .split('\n')
            .filter((line) => line.length > 0)
            .map((line) => JSON.parse(line) as { path: string; level: string });

        expect(code).toBe(0);
        expect(reports).toEqual([
            expect.objectContaining({ path: first, level: 'clean' }),
            expect.objectContaining({ path: second, level: 'clean' }),
        ]);
    });

    it('clean + warning → exit 1', () => {
        const good = write('good.md', CONFORMANT);
        const warn = write('warn.md', spec('SPEC-y').replace('sources:\n  - ADR-0077', 'sources: []'));
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

    it('the same MISSING path passed twice is deduped — one "file not found" report, not two', () => {
        // A path that stats to nothing falls back to its resolved spelling as the dedup key,
        // so the per-file load error reports once.
        const missing = join(dir, 'nope.md');
        const { code, err } = capture(() => run([missing, missing]));
        expect(code).toBe(2);
        expect(err.match(/file not found/g)).toHaveLength(1);
    });

    it('the same file under two spellings (a redundant `./` segment) is deduped — no self-collision C002', () => {
        const a = write('a.md', CONFORMANT);
        const aliased = `${dir}/./a.md`; // resolves to the same file as `a`
        const { code, out } = capture(() => run([a, aliased]));
        expect(code).toBe(0);
        expect(out).not.toContain('C002');
    });

    it('the same file behind a symlink alias is deduped — one inode is one artifact, no C002', () => {
        const a = write('a.md', CONFORMANT);
        const alias = join(dir, 'alias.md');
        symlinkSync(a, alias);
        const { code, out } = capture(() => run([a, alias]));
        expect(code).toBe(0);
        expect(out).not.toContain('C002');
    });

    it.skipIf(!caseInsensitiveVolume)(
        'the same file under a case-variant spelling is deduped on a case-insensitive volume — no C002',
        () => {
            const a = write('a.md', CONFORMANT);
            const variant = join(dir, 'A.MD'); // resolves to the same file as `a` on this volume
            const { code, out } = capture(() => run([a, variant]));
            expect(code).toBe(0);
            expect(out).not.toContain('C002');
        }
    );
});

describe('check command — review packets need explicit companions (ADR-0143 D3)', () => {
    it('a review without --spec → exit 2 naming --spec', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const { code, err } = capture(() => run([review]));
        expect(code).toBe(2);
        expect(err).toContain('missing --spec');
    });

    it('a task-referencing review with --spec but no --task → exit 2 naming --task (Q2)', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const specPath = write('spec.md', CONFORMANT);
        const { code, err } = capture(() => run([review, '--spec', specPath]));
        expect(code).toBe(2);
        expect(err).toContain('missing --task');
        expect(err).toContain('TASK-feat');
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

    it('a companion path that is a directory → exit 2 saying so, never "not found"', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const { code, err } = capture(() => run([review, '--spec', dir]));
        expect(code).toBe(2);
        expect(err).toContain('--spec');
        expect(err).toContain('it is a directory');
        expect(err).not.toContain('not found');
    });

    it('a review with both companions runs the reconcile → clean review exits 0 (Q1)', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const specPath = write('spec.md', CONFORMANT);
        const taskPath = write('task.md', TASK);
        const { code, out } = capture(() => run([review, '--spec', specPath, '--task', taskPath]));
        expect(code).toBe(0);
        expect(out).toContain('clean');
    });

    it('rejects a --spec companion whose declared artifact type is not spec', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const specPath = write('not-a-spec.md', CONFORMANT.replace('type: spec', 'type: task'));
        const taskPath = write('task.md', TASK);
        const { code, err } = capture(() => run([review, '--spec', specPath, '--task', taskPath]));
        expect(code).toBe(2);
        expect(err).toContain('--spec companion must have `type: spec`');
    });

    it('rejects a type-less --spec companion', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const specPath = write('type-less-spec.md', CONFORMANT.replace('type: spec\n', ''));
        const taskPath = write('task.md', TASK);
        const { code, err } = capture(() => run([review, '--spec', specPath, '--task', taskPath]));
        expect(code).toBe(2);
        expect(err).toContain('--spec companion must have `type: spec`');
    });

    it.each([
        ['draft', CONFORMANT.replace('status: ready', 'status: draft')],
        ['missing', CONFORMANT.replace('status: ready\n', '')],
    ])('rejects a --spec companion whose status is %s', (_name, specSource) => {
        const review = write('review.md', CLEAN_REVIEW);
        const specPath = write('spec.md', specSource);
        const taskPath = write('task.md', TASK);
        const { code, err } = capture(() => run([review, '--spec', specPath, '--task', taskPath]));
        expect(code).toBe(2);
        expect(err).toContain('--spec companion must have `status: ready`');
    });

    it('rejects an invalid --spec status option before companion reconciliation', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const specPath = write('spec.md', CONFORMANT.replace('status: ready', 'status: Ready'));
        const taskPath = write('task.md', TASK);
        const { code, err } = capture(() => run([review, '--spec', specPath, '--task', taskPath]));
        expect(code).toBe(2);
        expect(err).toContain('frontmatter `status:` must be draft or ready');
    });

    it.each([
        {
            name: 'review task ref',
            reviewSource: CLEAN_REVIEW.replace('task: TASK-feat', 'task:\n  - TASK-feat\n  - TASK-other'),
            specSource: CONFORMANT,
            taskSource: TASK,
            message: 'frontmatter `task:` must be a scalar',
        },
        {
            name: 'spec type',
            reviewSource: CLEAN_REVIEW,
            specSource: CONFORMANT.replace('type: spec', 'type:\n  - spec\n  - task'),
            taskSource: TASK,
            message: 'frontmatter `type:` must be a scalar',
        },
        {
            name: 'spec id',
            reviewSource: CLEAN_REVIEW,
            specSource: CONFORMANT.replace('id: SPEC-x', 'id:\n  - SPEC-x\n  - SPEC-other'),
            taskSource: TASK,
            message: 'frontmatter `id:` must be a scalar',
        },
        {
            name: 'task type',
            reviewSource: CLEAN_REVIEW,
            specSource: CONFORMANT,
            taskSource: TASK.replace('type: task', 'type:\n  - task\n  - review'),
            message: 'frontmatter `type:` must be a scalar',
        },
        {
            name: 'task id',
            reviewSource: CLEAN_REVIEW,
            specSource: CONFORMANT,
            taskSource: TASK.replace('id: TASK-feat', 'id:\n  - TASK-feat\n  - TASK-other'),
            message: 'frontmatter `id:` must be a scalar',
        },
    ])('rejects a list-shaped singular companion field: $name', ({ reviewSource, specSource, taskSource, message }) => {
        const review = write('review.md', reviewSource);
        const specPath = write('spec.md', specSource);
        const taskPath = write('task.md', taskSource);
        const { code, err } = capture(() => run([review, '--spec', specPath, '--task', taskPath]));
        expect(code).toBe(2);
        expect(err).toContain(message);
    });

    it('rejects a --task companion whose artifact type is not task', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const specPath = write('spec.md', CONFORMANT);
        const taskPath = write('not-a-task.md', CONFORMANT.replace('id: SPEC-x', 'id: TASK-feat'));
        const { code, err } = capture(() => run([review, '--spec', specPath, '--task', taskPath]));
        expect(code).toBe(2);
        expect(err).toContain('--task companion must have `type: task`');
    });

    it('rejects a --task companion with no scoped requirements', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const specPath = write('spec.md', CONFORMANT);
        const taskPath = write('task.md', TASK.replace('scope: [AC-001, AC-002]\n', ''));
        const { code, err } = capture(() => run([review, '--spec', specPath, '--task', taskPath]));
        expect(code).toBe(2);
        expect(err).toContain('--task companion must name at least one requirement in `scope:`');
    });

    it('rejects a --task companion sourced from a different spec', () => {
        const review = write('review.md', CLEAN_REVIEW);
        const specPath = write('spec.md', CONFORMANT);
        const taskPath = write('task.md', TASK.replace('SPEC-x', 'SPEC-other'));
        const { code, err } = capture(() => run([review, '--spec', specPath, '--task', taskPath]));
        expect(code).toBe(2);
        expect(err).toContain('does not name handed spec `SPEC-x` in `source:`');
    });

    it('a task-less review with --spec only runs spec-keyed → C012 keys on the full spec set (Q3)', () => {
        // A 1:1 review with no `task:` frontmatter, covering only AC-001 of the two-AC spec.
        const taskless = CLEAN_REVIEW.replace('task: TASK-feat\n', '').replace(
            /\| AC-002 \| Supported \| p \|[\s\S]*?```\n/,
            ''
        );
        const review = write('review.md', taskless);
        const specPath = write('spec.md', CONFORMANT);
        const { code, out } = capture(() => run([review, '--spec', specPath]));
        expect(code).toBe(1);
        expect(out).toContain('C012');
        expect(out).toContain('AC-002');
        expect(out).not.toContain('C020');
    });

    it('a task-less review handed a --task anyway → exit 2 (a companion nothing references, Q4)', () => {
        const taskless = CLEAN_REVIEW.replace('task: TASK-feat\n', '');
        const review = write('review.md', taskless);
        const specPath = write('spec.md', CONFORMANT);
        const taskPath = write('task.md', TASK);
        const { code, err } = capture(() => run([review, '--spec', specPath, '--task', taskPath]));
        expect(code).toBe(2);
        expect(err).toContain('references no task');
    });

    it('an empty-Evidence Supported row → C016 blocks (exit 2)', () => {
        const review = write(
            'review.md',
            CLEAN_REVIEW.replace('| AC-001 | Supported | p |', '| AC-001 | Supported |  |')
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
decision: pending
---

## Requirement coverage

| ID | Assessment | Evidence |
|---|---|---|
| AC-001 | Supported | p |

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

    it.each([
        ['empty id', (source: string) => source.replace('id: REVIEW-feat', 'id: ""')],
        ['invalid decision', (source: string) => source.replace('decision: pending', 'decision: approved')],
        [
            'inexact coverage section',
            (source: string) => source.replace('## Requirement coverage', '## requirement coverage'),
        ],
        ['invalid assessment', (source: string) => source.replace('| Supported |', '| Passing |')],
        [
            'waiver before acceptance',
            (source: string) => source.replace('decision: pending', 'decision: pending\nwaivers: [AC-001]'),
        ],
        [
            'missing accepted waiver',
            (source: string) =>
                source.replace('decision: pending', 'decision: accepted').replace('| Supported |', '| Unverified |'),
        ],
        [
            'unrelated accepted waiver',
            (source: string) => source.replace('decision: pending', 'decision: accepted\nwaivers: [AC-099]'),
        ],
        [
            'duplicate accepted waiver',
            (source: string) =>
                source
                    .replace('decision: pending', 'decision: accepted\nwaivers: [AC-001, AC-001]')
                    .replace('| Supported |', '| Unsupported |'),
        ],
        [
            'accepted open decision',
            (source: string) =>
                `${source.replace('decision: pending', 'decision: accepted')}\n## Open decisions\n\nChoose a rollout.\n`,
        ],
    ])('a structural review error ($name) emits AppError JSON, not a C-code report', (_name, mutate) => {
        const review = write('review.md', mutate(CLEAN_REVIEW));
        const specPath = write('spec.md', CONFORMANT);
        const taskPath = write('task.md', TASK);
        const { code, out } = capture(() => run([review, '--spec', specPath, '--task', taskPath, '--json']));
        expect(code).toBe(2);
        const error = JSON.parse(out) as { error: string; message: string; diagnostics?: unknown };
        expect(error.error).toBe('ParseFailure');
        expect(error.message.length).toBeGreaterThan(0);
        expect(error.diagnostics).toBeUndefined();
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
