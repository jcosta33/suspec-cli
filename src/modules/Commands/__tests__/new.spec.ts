import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';

import { run } from '../useCases/new.ts';

const SPEC_X = `---
type: spec
id: SPEC-x
status: ready
---

## Requirements

### AC-001 — one
The tool must do one.
Verify with: a test.

### AC-002 — two
The tool must do two.
Verify with: a test.
`;

let root: string;
let repo: string;
let store: string;
let savedStateDir: string | undefined;

beforeEach(() => {
    root = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-new-cmd-'));
    repo = join(root, 'proj');
    mkdirSync(repo, { recursive: true });
    const stateRoot = join(root, 'state');
    store = join(stateRoot, basename(repo));
    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, '.repo-path'), `${repo}\n`);
    writeFileSync(join(store, 'spec-x.md'), SPEC_X);
    savedStateDir = process.env.SUSPEC_STATE_DIR;
    process.env.SUSPEC_STATE_DIR = stateRoot;
});
afterEach(() => {
    if (savedStateDir === undefined) {
        delete process.env.SUSPEC_STATE_DIR;
    } else {
        process.env.SUSPEC_STATE_DIR = savedStateDir;
    }
    rmSync(root, { recursive: true, force: true });
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

describe('new command — task slices land IN THE STORE (ADR-0137)', () => {
    it('cuts a task slice with the named scope into the store, not the repo', async () => {
        const { code } = await capture(() => run(['task', '--from', 'SPEC-x', '--scope', 'AC-001,AC-002'], repo));
        expect(code).toBe(0);
        const slice = readFileSync(join(store, 'task-x.md'), 'utf8');
        expect(slice).toContain('scope: [AC-001, AC-002]');
        expect(slice).toContain('- AC-001');
        // Nothing lands in the repo — the store is the packet's home.
        expect(existsSync(join(repo, 'tasks'))).toBe(false);
    });

    it('cuts an empty-scope slice without inventing ids', async () => {
        const { code } = await capture(() => run(['task', '--from', 'SPEC-x'], repo));
        expect(code).toBe(0);
        expect(readFileSync(join(store, 'task-x.md'), 'utf8')).toContain('scope: []');
    });

    it('--id cuts a distinctly-named second slice from one spec, normalizing to TASK-<slug>', async () => {
        const first = await capture(() => run(['task', '--from', 'SPEC-x', '--scope', 'AC-001'], repo));
        expect(first.code).toBe(0);
        const second = await capture(() =>
            run(['task', '--from', 'SPEC-x', '--scope', 'AC-002', '--id', 'x-part-two'], repo)
        );
        expect(second.code).toBe(0);
        expect(existsSync(join(store, 'task-x.md'))).toBe(true);
        const part2 = readFileSync(join(store, 'task-x-part-two.md'), 'utf8');
        expect(part2).toContain('id: TASK-x-part-two');
        expect(part2).toContain('- AC-002');

        // A prefixed / mixed-case --id normalizes at the command surface to the canonical TASK-<lower>.
        const third = await capture(() => run(['task', '--from', 'SPEC-x', '--id', 'TASK-X-Part-Three'], repo));
        expect(third.code).toBe(0);
        expect(readFileSync(join(store, 'task-x-part-three.md'), 'utf8')).toContain('id: TASK-x-part-three');
    });

    it('a second default-id cut auto-suffixes and says so — never a silent collision', async () => {
        const first = await capture(() => run(['task', '--from', 'SPEC-x', '--scope', 'AC-001'], repo));
        expect(first.code).toBe(0);
        const second = await capture(() => run(['task', '--from', 'SPEC-x', '--scope', 'AC-002'], repo));
        expect(second.code).toBe(0);
        expect(existsSync(join(store, 'task-x.md'))).toBe(true);
        expect(existsSync(join(store, 'task-x-2.md'))).toBe(true);
        expect(second.out).toContain('auto-suffixed to TASK-x-2');
        // An explicit --id keeps exact-collision semantics: same id twice still errors.
        const clash = await capture(() => run(['task', '--from', 'SPEC-x', '--id', 'x-2'], repo));
        expect(clash.code).not.toBe(0);
    });

    it('an empty --id is a usage error, not a task-.md artifact', async () => {
        const { code, err } = await capture(() => run(['task', '--from', 'SPEC-x', '--id', ''], repo));
        expect(code).toBe(2);
        expect(err).toContain('--id');
        expect(existsSync(join(store, 'task-.md'))).toBe(false);
    });

    it('--force re-cuts over an existing slice — the empty-scope-stub recovery', async () => {
        expect((await capture(() => run(['task', '--from', 'SPEC-x'], repo))).code).toBe(0);
        const second = await capture(() => run(['task', '--from', 'SPEC-x', '--scope', 'AC-001'], repo));
        expect(second.code).toBe(0);
        expect(second.out).toContain('--force to replace the original');
        const forced = await capture(() => run(['task', '--from', 'SPEC-x', '--scope', 'AC-001', '--force'], repo));
        expect(forced.code).toBe(0);
        expect(readFileSync(join(store, 'task-x.md'), 'utf8')).toContain('scope: [AC-001]');
    });

    it('task with no --from → usage error', async () => {
        const { code, err } = await capture(() => run(['task'], repo));
        expect(code).toBe(2);
        expect(err).toContain('usage');
    });

    it('task from a missing store spec → exit 2', async () => {
        expect((await capture(() => run(['task', '--from', 'SPEC-missing'], repo))).code).toBe(2);
    });

    it('task with a scope id not in the spec → exit 2', async () => {
        expect((await capture(() => run(['task', '--from', 'SPEC-x', '--scope', 'AC-099'], repo))).code).toBe(2);
    });

    it('`new spec` points at `write spec` — one store scaffold, nothing written', async () => {
        const { code, err } = await capture(() => run(['spec', 'checkout', '--title', 'Checkout'], repo));
        expect(code).toBe(2);
        expect(err).toContain('suspec write spec');
        expect(existsSync(join(repo, 'specs'))).toBe(false);
        expect(existsSync(join(store, 'spec-checkout.md'))).toBe(false);
    });

    it('scaffolds a change plan INTO THE STORE (grammar-stamped); refuses to clobber on a repeat', async () => {
        const first = await capture(() => run(['change-plan', 'db-migration', '--title', 'DB migration'], repo));
        expect(first.code).toBe(0);
        const plan = readFileSync(join(store, 'change-plan-db-migration.md'), 'utf8');
        expect(plan).toContain('id: CHANGE-db-migration');
        expect(plan).toContain('grammar_version: 1'); // AC-003: the store write stamps the grammar
        expect(plan).toContain('## Behavioral preservation guarantees');
        expect(plan).toContain('## Transformation waves');
        // Nothing lands in the repo — no change-plans/ tree (ADR-0137).
        expect(existsSync(join(repo, 'change-plans'))).toBe(false);
        expect((await capture(() => run(['change-plan', 'db-migration'], repo))).code).toBe(2);
    });

    it('a traversal-shaped change-plan slug is a usage error, nothing written', async () => {
        const { code } = await capture(() => run(['change-plan', '../evil'], repo));
        expect(code).toBe(2);
        expect(existsSync(join(root, 'change-plan-evil.md'))).toBe(false);
    });

    it('exit 2 when the store cannot resolve (SUSPEC_STATE_DIR pointing at a file) — task and change-plan', async () => {
        const asFile = join(root, 'state-as-file');
        writeFileSync(asFile, 'not a dir');
        process.env.SUSPEC_STATE_DIR = asFile;
        expect((await capture(() => run(['task', '--from', 'SPEC-x'], repo))).code).toBe(2);
        expect((await capture(() => run(['change-plan', 'oops'], repo))).code).toBe(2);
    });

    it('change-plan with no slug → usage error', async () => {
        const { code, err } = await capture(() => run(['change-plan'], repo));
        expect(code).toBe(2);
        expect(err).toContain('usage');
    });

    it('an unknown type → exit 2', async () => {
        const { code, err } = await capture(() => run(['frobnicate'], repo));
        expect(code).toBe(2);
        expect(err).toContain('unknown new type');
    });

    it('no type (non-TTY) → prints usage, never the literal "undefined"', async () => {
        const { code, err } = await capture(() => run([], repo));
        expect(code).toBe(2);
        expect(err).toContain('usage: suspec new');
        expect(err).not.toContain('undefined');
    });

    it('--json emits machine output', async () => {
        const { code, out } = await capture(() =>
            run(['task', '--from', 'SPEC-x', '--scope', 'AC-001', '--json'], repo)
        );
        expect(code).toBe(0);
        expect(JSON.parse(out)).toMatchObject({ level: 'clean', taskId: 'TASK-x' });
    });
});
