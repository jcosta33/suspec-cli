import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    realpathSync,
    writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { execFileSync } from 'child_process';

import { run as run_done } from '../useCases/done.ts';
import { run as run_evidence } from '../useCases/evidence.ts';
import { create_mock_prompter } from '../../Tui/testing/mockPrompter.ts';

// SPEC-suspec-v2 AC-011..015: `suspec done <RUN>` end to end — artifact lint, the strict gate
// (staleness re-hashed), the digest (refs only, never raw output), the living PR comment (PATH-
// stubbed gh, create-then-edit the SAME marker comment), and findings triage (interactive via the
// mock prompter; non-TTY defers with expiry).

let root: string;
let repo: string;
let store: string;
let ghState: string;
let savedStateDir: string | undefined;
let savedPath: string | undefined;
let savedGhState: string | undefined;

const git = (args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

const SPEC_ONE = `---
type: spec
id: SPEC-feat
status: ready
grammar_version: 1
sources:
  - notes.md
---

## Requirements

### AC-001 — one
The tool must do it.
Verify with: \`node -e "ok"\`.

## Non-goals

- none.

## Open questions

none.
`;

// A second AC for the gap scenarios.
const SPEC_TWO = SPEC_ONE.replace(
    '## Non-goals',
    '### AC-002 — two\nThe tool should also log it.\nVerify with: `node -e "log"`.\n\n## Non-goals'
);

// The gh stub: a node script on PATH answering `pr view`, `issue create`, and the `api`
// list/POST/PATCH comment calls, persisting comments + a call log under GH_STUB_STATE.
const GH_STUB = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dir = process.env.GH_STUB_STATE;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(dir, 'calls.log'), JSON.stringify(args) + '\\n');
const commentsFile = path.join(dir, 'comments.json');
const comments = fs.existsSync(commentsFile) ? JSON.parse(fs.readFileSync(commentsFile, 'utf8')) : [];
if (args[0] === 'pr') {
    const prFile = path.join(dir, 'pr.json');
    if (!fs.existsSync(prFile)) process.exit(1);
    process.stdout.write(fs.readFileSync(prFile, 'utf8'));
    process.exit(0);
}
if (args[0] === 'issue' && args[1] === 'create') {
    if (fs.existsSync(path.join(dir, 'issue-fail'))) { process.stderr.write('issue create refused'); process.exit(1); }
    process.stdout.write('https://github.com/o/r/issues/55\\n');
    process.exit(0);
}
if (args[0] === 'api') {
    const target = args[1];
    const bodyArg = args.find((a) => a.startsWith('body='));
    if (args.includes('PATCH')) {
        const id = Number(target.split('/').pop());
        const found = comments.find((c) => c.id === id);
        if (found) found.body = bodyArg.slice(5);
        fs.writeFileSync(commentsFile, JSON.stringify(comments));
        process.stdout.write('{}');
        process.exit(0);
    }
    if (bodyArg) {
        const id = 101 + comments.length;
        comments.push({ id, body: bodyArg.slice(5) });
        fs.writeFileSync(commentsFile, JSON.stringify(comments));
        process.stdout.write(JSON.stringify({ id }));
        process.exit(0);
    }
    process.stdout.write(JSON.stringify(comments));
    process.exit(0);
}
process.exit(1);
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

// Capture one piece of real cli-verified evidence via the evidence command itself.
async function add_evidence_for(ac: string, script = 'console.log("captured-ok")'): Promise<void> {
    const result = await capture(() => run_evidence(['add', 'feat', '--ac', ac, '--', 'node', '-e', script], repo));
    if (result.code > 1) {
        throw new Error(`evidence add failed: ${result.err}`);
    }
}

function write_finding(name: string, fields: string, title: string): void {
    writeFileSync(join(store, name), `---\ntype: finding\nrun: feat\n${fields}\n---\n\n# ${title}\n\ndetails\n`);
}

beforeEach(() => {
    root = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-done-'));
    repo = join(root, 'proj');
    mkdirSync(repo, { recursive: true });
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    writeFileSync(join(repo, 'a.txt'), 'one\n');
    git(['add', '.']);
    git(['commit', '-m', 'init']);

    const stateRoot = join(root, 'state');
    store = join(stateRoot, basename(repo));
    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, '.repo-path'), `${repo}\n`);
    writeFileSync(join(store, 'notes.md'), 'origin notes\n');
    writeFileSync(join(store, 'spec-feat.md'), SPEC_ONE);
    writeFileSync(
        join(store, 'run-feat.md'),
        `---\ntype: run\nspec: SPEC-feat\nworktree: ${repo}\nbranch: suspec/feat\nstatus: exited\n---\n\n# Run\n\nagent notes\n`
    );

    // The gh stub takes over `gh` for everything spawned below.
    ghState = join(root, 'gh-state');
    mkdirSync(ghState, { recursive: true });
    const stubDir = join(root, 'stub-bin');
    mkdirSync(stubDir, { recursive: true });
    writeFileSync(join(stubDir, 'gh'), GH_STUB);
    chmodSync(join(stubDir, 'gh'), 0o755);

    savedStateDir = process.env.SUSPEC_STATE_DIR;
    savedPath = process.env.PATH;
    savedGhState = process.env.GH_STUB_STATE;
    process.env.SUSPEC_STATE_DIR = stateRoot;
    process.env.PATH = `${stubDir}:${process.env.PATH ?? ''}`;
    process.env.GH_STUB_STATE = ghState;
});

afterEach(() => {
    if (savedStateDir === undefined) {
        delete process.env.SUSPEC_STATE_DIR;
    } else {
        process.env.SUSPEC_STATE_DIR = savedStateDir;
    }
    process.env.PATH = savedPath;
    if (savedGhState === undefined) {
        delete process.env.GH_STUB_STATE;
    } else {
        process.env.GH_STUB_STATE = savedGhState;
    }
    rmSync(root, { recursive: true, force: true });
});

describe('the gate (AC-011/AC-012)', () => {
    it('passes with cli-verified exit-0 evidence for every AC — exit 0, run marked done', async () => {
        await add_evidence_for('AC-001');
        const result = await capture(() => run_done(['feat'], repo));
        expect(result.code).toBe(0);
        expect(result.out).toContain('| AC-001 |');
        expect(result.out).toContain('verified');
        expect(result.out).toContain('gate satisfied — run feat marked done');
        const runFile = readFileSync(join(store, 'run-feat.md'), 'utf8');
        expect(runFile).toContain('status: done');
        expect(runFile).toContain('agent notes'); // the body survives the stamp
    });

    it('blocks (exit 1) when an AC has no cli-verified evidence, listing the gap', async () => {
        writeFileSync(join(store, 'spec-feat.md'), SPEC_TWO);
        await add_evidence_for('AC-001');
        const result = await capture(() => run_done(['feat'], repo));
        expect(result.code).toBe(1);
        expect(result.out).toContain('gate blocked — 1 AC(s)');
        expect(result.out).toContain('AC-002: missing');
        expect(readFileSync(join(store, 'run-feat.md'), 'utf8')).not.toContain('status: done');
    });

    it('a FAILING capture does not satisfy the gate (failing), and the digest carries no raw output', async () => {
        // The sentinel is concatenated at runtime so it appears ONLY in the raw output, never in
        // the (legitimately digested) command string.
        await add_evidence_for('AC-001', 'console.log("RAW-SENTINEL" + "-OUTPUT"); process.exit(4)');
        const result = await capture(() => run_done(['feat', '--json'], repo));
        expect(result.code).toBe(1);
        const value = JSON.parse(result.out) as { gaps: { ac: string; status: string }[] };
        expect(value.gaps).toEqual([{ ac: 'AC-001', status: 'failing' }]);
        // AC-014: raw output never leaves the store — neither face carries it.
        expect(result.out).not.toContain('RAW-SENTINEL-OUTPUT');
    });

    it('rejects STALE evidence: a worktree edit after capture invalidates it until re-captured (AC-012)', async () => {
        await add_evidence_for('AC-001');
        writeFileSync(join(repo, 'a.txt'), 'drifted\n');
        const stale = await capture(() => run_done(['feat'], repo));
        expect(stale.code).toBe(1);
        expect(stale.out).toContain('AC-001: stale');

        await add_evidence_for('AC-001'); // re-run against the drifted worktree
        const fresh = await capture(() => run_done(['feat'], repo));
        expect(fresh.code).toBe(0);
    });

    it('--accept-failing accepts gaps: exit 0, the reason lands in the digest AND the run file', async () => {
        writeFileSync(join(store, 'spec-feat.md'), SPEC_TWO);
        await add_evidence_for('AC-001');
        // The newline is collapsed — a reason must never inject frontmatter keys into the run file.
        const result = await capture(() => run_done(['feat', '--accept-failing', 'AC-002 lands\nnext wave'], repo));
        expect(result.code).toBe(0);
        expect(result.out).toContain('accepted failing (--accept-failing): AC-002 lands next wave');
        const runFile = readFileSync(join(store, 'run-feat.md'), 'utf8');
        expect(runFile).toContain('status: done');
        expect(runFile).toContain('accepted_failing: AC-002 lands next wave');
    });

    it('refuses an empty --accept-failing reason (exit 2) — a silent waiver is not a waiver', async () => {
        expect((await capture(() => run_done(['feat', '--accept-failing', '  '], repo))).code).toBe(2);
    });

    it('agent evidence counts ONLY under --allow-agent-evidence, labeled in the digest (AC-011)', async () => {
        const dir = join(store, 'evidence', 'feat');
        mkdirSync(dir, { recursive: true });
        writeFileSync(
            join(dir, '001-agent.md'),
            '---\ntype: evidence\nrun: feat\nac: AC-001\ncommand: pnpm test\nexit: 0\nprovenance: agent\n---\n'
        );
        const blocked = await capture(() => run_done(['feat'], repo));
        expect(blocked.code).toBe(1);
        expect(blocked.out).toContain('AC-001: agent-blocked');

        const allowed = await capture(() => run_done(['feat', '--allow-agent-evidence'], repo));
        expect(allowed.code).toBe(0);
        expect(allowed.out).toContain('verified-agent');
        expect(allowed.out).toContain('agent evidence allowed (--allow-agent-evidence): AC-001 via 001-agent.md');
    });

    it('usage errors exit 2: no run ref, a path-shaped ref, an unknown run, an unresolvable store', async () => {
        expect((await capture(() => run_done([], repo))).code).toBe(2);
        expect((await capture(() => run_done(['../escape'], repo))).code).toBe(2);
        const unknown = await capture(() => run_done(['ghost'], repo));
        expect(unknown.code).toBe(2);
        expect(unknown.err).toContain('run-ghost.md');

        const asFile = join(root, 'state-as-file');
        writeFileSync(asFile, 'not a dir');
        process.env.SUSPEC_STATE_DIR = asFile;
        expect((await capture(() => run_done(['feat'], repo))).code).toBe(2);
    });

    it('evidence whose record lost its staleness digest can never prove freshness — stale', async () => {
        await add_evidence_for('AC-001');
        const dir = join(store, 'evidence', 'feat');
        const record = readdirSync(dir).find((name) => name.endsWith('.md'))!;
        // Strip the digest line only — the capture block stays consistent, so this is NOT forged;
        // it is merely unable to prove freshness (AC-012).
        const content = readFileSync(join(dir, record), 'utf8').replace(/^worktree_diff_sha: .*\n/m, '');
        writeFileSync(join(dir, record), content);
        const result = await capture(() => run_done(['feat'], repo));
        expect(result.code).toBe(1);
        expect(result.out).toContain('AC-001: stale');
    });
});

describe('artifact lint inside done (AC-013 / AC-010)', () => {
    it('exit 2 on a FORGED cli-verified record — the hand-authored claim without a CLI capture', async () => {
        await add_evidence_for('AC-001');
        const dir = join(store, 'evidence', 'feat');
        writeFileSync(
            join(dir, '009-forged.md'),
            '---\ntype: evidence\nrun: feat\nac: AC-001\ncommand: pnpm test\nexit: 0\nprovenance: cli-verified\n---\n'
        );
        const result = await capture(() => run_done(['feat'], repo));
        expect(result.code).toBe(2);
        expect(result.out).toContain('artifact lint blocked');
        expect(result.out).toContain('EV03');
        expect(result.out).toContain('only `suspec evidence add` writes cli-verified evidence');
        expect(readFileSync(join(store, 'run-feat.md'), 'utf8')).not.toContain('status: done');
    });

    it('exit 2 when the run names no resolvable driving spec — no gate without a spec', async () => {
        rmSync(join(store, 'spec-feat.md'));
        const result = await capture(() => run_done(['feat'], repo));
        expect(result.code).toBe(2);
        expect(result.out).toContain('RUN02');
    });
});

describe('the living PR comment (AC-014)', () => {
    it('creates ONE marker-tagged comment on first done, EDITS the same one on re-run', async () => {
        writeFileSync(join(ghState, 'pr.json'), '{"number":7,"state":"OPEN"}');
        // Runtime-concatenated, case-sensitive sentinel: present in the raw output only — never in
        // the command text nor in the lowercased evidence-ref slug.
        await add_evidence_for('AC-001', 'console.log("captured" + "Xsecret")');

        const first = await capture(() => run_done(['feat'], repo));
        expect(first.code).toBe(0);
        expect(first.err).toContain('PR #7 digest comment created');
        const afterFirst = JSON.parse(readFileSync(join(ghState, 'comments.json'), 'utf8')) as {
            id: number;
            body: string;
        }[];
        expect(afterFirst).toHaveLength(1);
        expect(afterFirst[0].body).toContain('<!-- suspec:digest:feat -->');
        expect(afterFirst[0].body).toContain('| AC-001 |');
        expect(afterFirst[0].body).not.toContain('capturedXsecret'); // refs only, never raw output

        const second = await capture(() => run_done(['feat'], repo));
        expect(second.err).toContain('PR #7 digest comment edited');
        const afterSecond = JSON.parse(readFileSync(join(ghState, 'comments.json'), 'utf8')) as {
            id: number;
            body: string;
        }[];
        expect(afterSecond).toHaveLength(1); // still ONE comment
        expect(afterSecond[0].id).toBe(afterFirst[0].id); // the SAME comment, edited in place
        const log = readFileSync(join(ghState, 'calls.log'), 'utf8');
        expect(log).toContain('PATCH');
    });

    it('skips silently with a note when the branch has no open PR', async () => {
        await add_evidence_for('AC-001');
        const result = await capture(() => run_done(['feat'], repo));
        expect(result.code).toBe(0);
        expect(result.err).toContain('no open PR for suspec/feat — skipping the PR comment');
        expect(existsSync(join(ghState, 'comments.json'))).toBe(false);
    });

    it('notes and skips when the run records no branch', async () => {
        writeFileSync(
            join(store, 'run-feat.md'),
            `---\ntype: run\nspec: SPEC-feat\nworktree: ${repo}\nstatus: exited\n---\n`
        );
        await add_evidence_for('AC-001');
        const result = await capture(() => run_done(['feat'], repo));
        expect(result.err).toContain('records no branch — skipping the PR comment');
    });
});

describe('findings triage (AC-015)', () => {
    it('non-interactive done DEFERS untriaged findings with an expiry stamp + a note', async () => {
        await add_evidence_for('AC-001');
        write_finding('finding-001.md', 'severity: minor', 'A small lesson');
        const result = await capture(() => run_done(['feat', '--json'], repo));
        expect(result.code).toBe(0);
        expect(result.err).toContain('1 untriaged finding(s) deferred with an expiry stamp');
        const finding = readFileSync(join(store, 'finding-001.md'), 'utf8');
        expect(finding).toMatch(/expires: \d{4}-\d{2}-\d{2}/);
        const value = JSON.parse(result.out) as { triage: { action: string }[] };
        expect(value.triage).toEqual([{ finding: 'finding-001.md', action: 'deferred', detail: expect.stringContaining('expires') }]);
    });

    it('applies interactive choices: promote → gh issue + archive; keep → expiry; discard → archive', async () => {
        await add_evidence_for('AC-001');
        write_finding('finding-001.md', 'severity: minor', 'Promote me');
        write_finding('finding-002.md', 'severity: minor', 'Keep me');
        write_finding('finding-003.md', 'severity: minor', 'Drop me');
        const prompter = create_mock_prompter({ select: ['promote', 'keep', 'discard'] });

        const result = await capture(() => run_done(['feat'], repo, prompter));
        expect(result.code).toBe(0);
        expect(result.out).toContain('finding-001.md: promoted — https://github.com/o/r/issues/55');
        expect(result.out).toMatch(/finding-002\.md: kept — expires \d{4}-\d{2}-\d{2}/);
        expect(result.out).toContain('finding-003.md: discarded');

        expect(existsSync(join(store, 'archive', 'finding-001.md'))).toBe(true); // promoted → archived
        expect(readFileSync(join(store, 'archive', 'finding-001.md'), 'utf8')).toContain('issue: #55');
        expect(readFileSync(join(store, 'finding-002.md'), 'utf8')).toMatch(/expires:/);
        expect(existsSync(join(store, 'archive', 'finding-003.md'))).toBe(true); // discarded → archived, never deleted
        const log = readFileSync(join(ghState, 'calls.log'), 'utf8');
        expect(log).toContain('"issue","create"');
    });

    it('REFUSES to discard a critical finding without --discard-critical, and allows it with the flag', async () => {
        await add_evidence_for('AC-001');
        write_finding('finding-009.md', 'id: FIND-009\nseverity: critical', 'Data loss on retry');

        const refused = await capture(() => run_done(['feat'], repo, create_mock_prompter({ select: ['discard'] })));
        expect(refused.code).toBe(0);
        expect(refused.out).toContain('finding-009.md: discard-refused');
        expect(refused.out).toContain('--discard-critical FIND-009');
        expect(existsSync(join(store, 'finding-009.md'))).toBe(true); // still in the store root

        const allowed = await capture(() =>
            run_done(['feat', '--discard-critical', 'FIND-009'], repo, create_mock_prompter({ select: ['discard'] }))
        );
        expect(allowed.out).toContain('finding-009.md: discarded');
        expect(existsSync(join(store, 'archive', 'finding-009.md'))).toBe(true);
    });

    it('a failed gh promote leaves the finding in place, reported as promote-failed', async () => {
        await add_evidence_for('AC-001');
        write_finding('finding-001.md', 'severity: minor', 'Promote me');
        writeFileSync(join(ghState, 'issue-fail'), '1');
        const result = await capture(() => run_done(['feat'], repo, create_mock_prompter({ select: ['promote'] })));
        expect(result.out).toContain('finding-001.md: promote-failed');
        expect(existsSync(join(store, 'finding-001.md'))).toBe(true);
    });

    it('does NOT triage when the gate blocks — findings wait for a run that actually finishes', async () => {
        writeFileSync(join(store, 'spec-feat.md'), SPEC_TWO);
        await add_evidence_for('AC-001');
        write_finding('finding-001.md', 'severity: minor', 'Waits');
        const result = await capture(() => run_done(['feat', '--json'], repo));
        expect(result.code).toBe(1);
        expect(readFileSync(join(store, 'finding-001.md'), 'utf8')).not.toContain('expires:');
    });
});
