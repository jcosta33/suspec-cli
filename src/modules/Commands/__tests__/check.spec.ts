import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run } from '../useCases/check.ts';

const CONFORMANT = `---
type: spec
id: SPEC-x
status: ready
sources:
  - ADR-0077
---

## Requirements

### AC-001 — does it
The tool must do it.
Verify with: a test.

## Non-goals

- nope.

## Open questions

- none
`;

let dir: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'suspec-check-cmd-'));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

async function capture(fn: () => Promise<number>): Promise<{ out: string; err: string; code: number }> {
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
        const code = await fn();
        return { out: out.join(''), err: errs.join(''), code };
    } finally {
        o.mockRestore();
        e.mockRestore();
    }
}

function writeSpec(name: string, content: string): string {
    const path = join(dir, `${name}.md`);
    writeFileSync(path, content);
    return path;
}

// A spec the change plan's preserves-ref resolves against (SPEC-cart defines AC-001).
const CART_SPEC = `---
type: spec
id: SPEC-cart
status: ready
sources:
  - ADR-0077
---

## Requirements

### AC-001 — submit
The tool must submit it.
Verify with: a test.

## Non-goals

- none

## Open questions

- none
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

describe('check command — change-plan routing (C010/C011, AC-001/002)', () => {
    it('a valid change plan (preserves-ref resolves against a sibling spec) → exit 0', async () => {
        // sibling layout: change-plans/move/change-plan.md beside specs that resolve SPEC-cart
        mkdirSync(join(dir, 'specs', 'cart'), { recursive: true });
        writeFileSync(join(dir, 'specs', 'cart', 'spec.md'), CART_SPEC);
        mkdirSync(join(dir, 'change-plans'), { recursive: true });
        const planPath = join(dir, 'change-plans', 'change-plan.md');
        writeFileSync(planPath, changePlan('SPEC-cart#AC-001'));
        const { code, out } = await capture(() => run([planPath], dir));
        expect(code).toBe(0);
        expect(out).toContain('clean');
    });

    it('a change plan with an unresolvable preserves-ref → exit 2 (C010 hard-error)', async () => {
        mkdirSync(join(dir, 'specs', 'cart'), { recursive: true });
        writeFileSync(join(dir, 'specs', 'cart', 'spec.md'), CART_SPEC);
        mkdirSync(join(dir, 'change-plans'), { recursive: true });
        const planPath = join(dir, 'change-plans', 'change-plan.md');
        writeFileSync(planPath, changePlan('SPEC-cart#AC-999'));
        const { code, out } = await capture(() => run([planPath], dir));
        expect(code).toBe(2);
        expect(out).toContain('C010');
    });

    it('--json emits the change-plan check result', async () => {
        mkdirSync(join(dir, 'change-plans'), { recursive: true });
        const planPath = join(dir, 'change-plans', 'change-plan.md');
        writeFileSync(planPath, changePlan('PG-001')); // plan-local PG → C010 clean
        const { code, out } = await capture(() => run([planPath, '--json'], dir));
        expect(code).toBe(0);
        expect(JSON.parse(out)).toMatchObject({ level: 'clean', diagnostics: [] });
    });

    it('a type: spec file is unaffected (still runs the spec checks, not the change-plan checks)', async () => {
        const file = writeSpec('still-a-spec', CONFORMANT);
        const { code, out } = await capture(() => run([file], dir));
        expect(code).toBe(0);
        expect(out).toContain('clean');
        expect(out).not.toContain('C010');
    });
});

describe('check command (direct surface, AC-001/005)', () => {
    it('lints a conformant spec file → exit 0', async () => {
        const file = writeSpec('ok', CONFORMANT);
        const { code, out } = await capture(() => run([file]));
        expect(code).toBe(0);
        expect(out).toContain('clean');
    });

    it('a spec missing a Verify line → exit 2', async () => {
        const file = writeSpec('bad', CONFORMANT.replace('Verify with: a test.', ''));
        const { code } = await capture(() => run([file]));
        expect(code).toBe(2);
    });

    it('a missing file → exit 2 with a message on stderr', async () => {
        const { code, err } = await capture(() => run([join(dir, 'nope.md')]));
        expect(code).toBe(2);
        expect(err).toContain('file not found');
    });

    it('#93: checks multiple files in one invocation; exit code is the max across them', async () => {
        const good = writeSpec('good', CONFORMANT);
        const bad = writeSpec('badv', CONFORMANT.replace('Verify with: a test.', '')); // missing Verify → C003 hard-error
        const { code, out } = await capture(() => run([good, bad]));
        expect(code).toBe(2); // max(0 from good, 2 from bad)
        expect(out).toContain('good.md'); // both reports render in the one run
        expect(out).toContain('badv.md');
    });

    it('a directory arg → exit 2 with a clean message, not an EISDIR crash', async () => {
        mkdirSync(join(dir, 'specs', 'feature'), { recursive: true });
        const { code, err } = await capture(() => run([join(dir, 'specs', 'feature')]));
        expect(code).toBe(2);
        expect(err).toContain('it is a directory');
    });

    it('--json emits machine output that parses', async () => {
        const file = writeSpec('ok', CONFORMANT);
        const { code, out } = await capture(() => run([file, '--json']));
        expect(code).toBe(0);
        expect(JSON.parse(out)).toMatchObject({ level: 'clean', diagnostics: [] });
    });

    it('--json=true (equals form) still produces JSON, not human output', async () => {
        const file = writeSpec('ok', CONFORMANT);
        const { code, out } = await capture(() => run([file, '--json=true']));
        expect(code).toBe(0);
        expect(JSON.parse(out)).toMatchObject({ level: 'clean' });
    });

    it('resolves a workspace ref relative to the spec file (C009) → exit 2 when missing', async () => {
        const file = writeSpec('refs', CONFORMANT.replace('  - ADR-0077', '  - ADR-0077\n  - ./missing.md'));
        const { code } = await capture(() => run([file]));
        expect(code).toBe(2);
    });
});

// ADR-0137: `check` with no args lints the STORE's artifacts — there is no workspace tree.
describe('check with no args — the store lint face (ADR-0137)', () => {
    let stateRoot: string;
    let savedStateDir: string | undefined;
    beforeEach(() => {
        stateRoot = join(dir, 'state');
        savedStateDir = process.env.SUSPEC_STATE_DIR;
        process.env.SUSPEC_STATE_DIR = stateRoot;
    });
    afterEach(() => {
        if (savedStateDir === undefined) {
            delete process.env.SUSPEC_STATE_DIR;
        } else {
            process.env.SUSPEC_STATE_DIR = savedStateDir;
        }
    });

    function seed_store(): string {
        const repo = join(dir, 'proj');
        mkdirSync(repo, { recursive: true });
        const store = join(stateRoot, 'proj');
        mkdirSync(store, { recursive: true });
        writeFileSync(join(store, '.repo-path'), `${repo}\n`);
        return store;
    }

    it('no store yet → clean exit 0 with a friendly note (the store is never created)', async () => {
        const repo = join(dir, 'proj');
        mkdirSync(repo, { recursive: true });
        const { code, out } = await capture(() => run([], repo));
        expect(code).toBe(0);
        expect(out).toContain('no store for this repo yet');
        expect(existsSync(stateRoot)).toBe(false);
    });

    it("lints the store's artifacts: a broken backlog spec blocks (exit 2)", async () => {
        const store = seed_store();
        writeFileSync(join(store, 'spec-broken.md'), 'no frontmatter at all');
        const { code, out } = await capture(() => run([], join(dir, 'proj')));
        expect(code).toBe(2);
        expect(out).toContain('spec-broken.md');
    });

    it('a store whose artifacts lint clean exits 0 and lists them', async () => {
        const store = seed_store();
        writeFileSync(join(store, 'notes.md'), 'origin\n');
        writeFileSync(
            join(store, 'spec-ok.md'),
            CONFORMANT.replace('  - ADR-0077', '  - notes.md').replace('id: SPEC-x', 'id: SPEC-ok')
        );
        const { code, out } = await capture(() => run([], join(dir, 'proj')));
        expect(code).toBe(0);
        expect(out).toContain('spec-ok.md');
        expect(out).toContain('store lint');
    });

    it('--json emits the machine store-lint report', async () => {
        seed_store();
        const { code, out } = await capture(() => run(['--json'], join(dir, 'proj')));
        expect(code).toBe(0);
        expect(JSON.parse(out)).toMatchObject({ level: 'clean', artifacts: [] });
    });
});

// AC-015: the interactive surface never engages when output is machine-bound (`--json`) or piped
// (no TTY); the same guard protects every command, exercised here on `check` as the representative.
describe('check never engages the TUI under --json or a non-TTY (AC-015)', () => {
    const originalIsTTY = process.stdout.isTTY;
    afterEach(() => {
        process.stdout.isTTY = originalIsTTY;
    });

    it('-i with --json takes the direct path on a TTY (emits JSON, no prompt)', async () => {
        process.stdout.isTTY = true;
        const file = writeSpec('ok', CONFORMANT);
        const { code, out } = await capture(() => run([file, '-i', '--json']));
        expect(code).toBe(0);
        expect(JSON.parse(out)).toMatchObject({ level: 'clean' });
    });

    it('-i without a TTY takes the direct path (renders text, no prompt)', async () => {
        process.stdout.isTTY = false;
        const file = writeSpec('ok', CONFORMANT);
        const { code, out } = await capture(() => run([file, '-i']));
        expect(code).toBe(0);
        expect(out).toContain('clean');
    });
});

describe('check --staleness (ADR-0108 item 4)', () => {
    it('skips gracefully (exit 0) when there is no git repository', async () => {
        // `dir` is a bare tmpdir, not a git repo → staleness cannot run; it reports a skip, never errors.
        const { code, out } = await capture(() => run(['--staleness'], dir));
        expect(code).toBe(0);
        expect(out).toContain('skipped: no git repository');
    });

    const git = (repo: string, args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
    function gitRepo(): string {
        const repo = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-check-stale-')));
        git(repo, ['init']);
        git(repo, ['config', 'user.email', 't@e.com']);
        git(repo, ['config', 'user.name', 'T']);
        return repo;
    }
    function writeStaleSpec(repo: string, snapshot: string | null, area = 'src/a.ts'): void {
        mkdirSync(join(repo, 'specs', 'x'), { recursive: true });
        const snap = snapshot !== null ? `snapshot: ${snapshot}\n` : '';
        writeFileSync(
            join(repo, 'specs', 'x', 'spec.md'),
            `---\ntype: spec\nid: SPEC-x\nstatus: active\n${snap}sources:\n  - self\n---\n\n## Affected areas\n\n- \`${area}\`\n`
        );
    }

    it('lists a spec whose area drifted since its snapshot', async () => {
        const repo = gitRepo();
        mkdirSync(join(repo, 'src'), { recursive: true });
        writeFileSync(join(repo, 'src', 'a.ts'), 'v1\n');
        git(repo, ['add', '.']);
        git(repo, ['commit', '-m', 'code']);
        const sha = git(repo, ['rev-parse', 'HEAD']).trim();
        writeStaleSpec(repo, sha);
        writeFileSync(join(repo, 'src', 'a.ts'), 'v2\n'); // drift after the snapshot
        const { code, out } = await capture(() => run(['--staleness'], repo));
        rmSync(repo, { recursive: true, force: true });
        expect(code).toBe(0);
        expect(out).toContain('1 possibly stale');
        expect(out).toContain('src/a.ts');
    });

    it('reports nothing-to-check (--json) when no spec records a snapshot', async () => {
        const repo = gitRepo();
        git(repo, ['commit', '--allow-empty', '-m', 'init']);
        writeStaleSpec(repo, null); // no snapshot → not scanned
        const { out } = await capture(() => run(['--staleness', '--json'], repo));
        rmSync(repo, { recursive: true, force: true });
        const parsed = JSON.parse(out) as { stale: unknown[]; scanned: number };
        expect(parsed.scanned).toBe(0);
        expect(parsed.stale).toEqual([]);
    });
});
