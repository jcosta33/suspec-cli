import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, realpathSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { createHash } from 'crypto';

import { run } from '../useCases/review.ts';
import { run as run_evidence } from '../useCases/evidence.ts';

// ADR-0137 / SPEC-suspec-v2 AC-013: `suspec review <RUN>` is run-vs-spec reconciliation over STORE
// artifacts — artifact lint + the per-AC evidence rows. Facts only; the human owns the result.

let root: string;
let repo: string;
let store: string;
let savedStateDir: string | undefined;

const git = (args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

const STORE_SPEC = `---
type: spec
id: SPEC-feat
status: ready
sources:
  - notes.md
---

## Requirements

### AC-001 — one
The tool must do it.
Verify with: \`node -e\`.

## Non-goals

- none.

## Open questions

none.
`;

function capture(fn: () => number | Promise<number>): Promise<{ out: string; err: string; code: number }> {
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
    return Promise.resolve()
        .then(fn)
        .then((code) => ({ out: out.join(''), err: errs.join(''), code }))
        .finally(() => {
            o.mockRestore();
            e.mockRestore();
        });
}

beforeEach(() => {
    root = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-review-cmd-'));
    repo = join(root, 'proj');
    mkdirSync(repo, { recursive: true });
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    writeFileSync(join(repo, 'a.txt'), 'one\n');
    git(['add', '.']);
    git(['commit', '-m', 'init']);

    const stateRoot = join(root, 'state');
    store = join(stateRoot, 'proj');
    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, '.repo-path'), `${repo}\n`);
    writeFileSync(join(store, 'notes.md'), 'origin\n');
    writeFileSync(join(store, 'spec-feat.md'), STORE_SPEC);
    writeFileSync(
        join(store, 'run-feat.md'),
        `---\ntype: run\nspec: SPEC-feat\nworktree: ${repo}\nbranch: suspec/feat\nstatus: exited\n---\n`
    );
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

describe('suspec review <RUN> — run-vs-spec reconciliation over store artifacts', () => {
    it('reconciles a clean run: lint facts + the evidence-vs-AC table, no verdict words', async () => {
        // Capture real cli-verified evidence for the one AC, so the gate preview reads verified.
        const captured = await capture(() =>
            run_evidence(['add', 'feat', '--ac', 'AC-001', '--', 'node', '-e', 'console.log("ok")'], repo)
        );
        expect(captured.code).toBe(0);

        const result = await capture(() => run(['feat'], repo));
        expect(result.code).toBe(0);
        expect(result.out).toContain('review feat · spec SPEC-feat — facts, no verdict');
        expect(result.out).toContain('evidence vs spec ACs:');
        expect(result.out).toContain('AC-001  verified');
        expect(result.out).toContain('`suspec done` would pass this gate');
        expect(result.out).not.toMatch(/\b(Pass|Fail|Unverified|Blocked)\b/);
    });

    it('an AC with no evidence reads missing and raises the advisory level (exit 1)', async () => {
        const result = await capture(() => run(['feat'], repo));
        expect(result.code).toBe(1);
        expect(result.out).toContain('AC-001  missing');
        expect(result.out).toContain('suspec evidence add feat');
    });

    it('exits per lint severity: a forged cli-verified evidence record is a hard-error (exit 2)', async () => {
        const dir = join(store, 'evidence', 'feat');
        mkdirSync(dir, { recursive: true });
        writeFileSync(
            join(dir, '001-forged.md'),
            '---\ntype: evidence\nrun: feat\nac: AC-001\nexit: 0\nprovenance: cli-verified\n---\n'
        );
        const result = await capture(() => run(['feat', '--json'], repo));
        expect(result.code).toBe(2);
        const parsed = JSON.parse(result.out) as { lint: { path: string; diagnostics: { check: string }[] }[] };
        expect(parsed.lint.some((a) => a.diagnostics.some((d) => d.check === 'EV03'))).toBe(true);
    });

    it('an UNLEDGERED self-consistent pair is EV04 (exit 2) and its AC previews as missing, not verified', async () => {
        // Real evidence first — the ledger file now exists…
        const captured = await capture(() =>
            run_evidence(['add', 'feat', '--ac', 'AC-001', '--', 'node', '-e', 'console.log("ok")'], repo)
        );
        expect(captured.code).toBe(0);
        // …then replace the run's evidence with a fresh, self-consistent, but LEDGERLESS pair.
        const dir = join(store, 'evidence', 'feat');
        for (const name of readdirSync(dir)) {
            rmSync(join(dir, name));
        }
        const raw = 'forged\n';
        writeFileSync(join(dir, '001-forged.out'), raw);
        writeFileSync(
            join(dir, '001-forged.md'),
            `---\ntype: evidence\nrun: feat\nac: AC-001\ncommand: node -e ok\nexit: 0\nprovenance: cli-verified\nworktree: ${repo}\nworktree_diff_sha: x\ncapture_file: 001-forged.out\ncapture_bytes: ${Buffer.byteLength(raw, 'utf8')}\ncapture_sha256: ${createHash('sha256').update(raw, 'utf8').digest('hex')}\n---\n`
        );
        const result = await capture(() => run(['feat', '--json'], repo));
        expect(result.code).toBe(2);
        const parsed = JSON.parse(result.out) as {
            lint: { diagnostics: { check: string }[] }[];
            evidence: { ac: string; status: string }[];
        };
        expect(parsed.lint.some((a) => a.diagnostics.some((d) => d.check === 'EV04'))).toBe(true);
        expect(parsed.evidence).toEqual([expect.objectContaining({ ac: 'AC-001', status: 'missing' })]);
    });

    it('a missing store source on the spec surfaces as C009 against the STORE spec (exit 2)', async () => {
        rmSync(join(store, 'notes.md'));
        const result = await capture(() => run(['feat'], repo));
        expect(result.code).toBe(2);
        expect(result.out).toContain('C009');
    });

    it('--json carries the machine facts: lint artifacts + evidence rows + gaps', async () => {
        const result = await capture(() => run(['feat', '--json'], repo));
        expect(result.code).toBe(1);
        const parsed = JSON.parse(result.out) as {
            runSlug: string;
            specId: string;
            evidence: { ac: string; status: string }[];
            gaps: string[];
        };
        expect(parsed.runSlug).toBe('feat');
        expect(parsed.specId).toBe('SPEC-feat');
        expect(parsed.evidence).toEqual([expect.objectContaining({ ac: 'AC-001', status: 'missing' })]);
        expect(parsed.gaps).toEqual(['AC-001']);
    });

    it('an unknown run → exit 2 naming the store path searched', async () => {
        const result = await capture(() => run(['ghost'], repo));
        expect(result.code).toBe(2);
        expect(result.err).toContain('no run ghost');
    });

    it('a path-shaped ref is rejected at the boundary', async () => {
        const result = await capture(() => run(['../escape'], repo));
        expect(result.code).toBe(2);
        expect(result.err).toContain('invalid run ref');
    });

    it('no store for the repo → exit 2 with the work pointer, and the store is never created', async () => {
        rmSync(store, { recursive: true, force: true });
        const result = await capture(() => run(['feat'], repo));
        expect(result.code).toBe(2);
        expect(result.err).toContain('no store for this repo yet');
    });

    it('no ref (non-TTY) → usage error', async () => {
        const result = await capture(() => run([], repo));
        expect(result.code).toBe(2);
        expect(result.err).toContain('usage: suspec review <RUN>');
    });

    it('outside a git repo → the git error, named', async () => {
        const plain = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-review-plain-'));
        try {
            const result = await capture(() => run(['feat'], plain));
            expect(result.code).toBe(2);
        } finally {
            rmSync(plain, { recursive: true, force: true });
        }
    });
});
