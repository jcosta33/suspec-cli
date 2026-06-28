import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run } from '../useCases/agents.ts';
import { dispatch } from '../../../index.ts';

let src: string;
let cwd: string;

beforeEach(() => {
    src = mkdtempSync(join(tmpdir(), 'agents-src-'));
    cwd = mkdtempSync(join(tmpdir(), 'agents-cwd-'));
    writeFileSync(
        join(src, 'corpus-reviewer.md'),
        '---\nname: corpus-reviewer\ndescription: >-\n  Review, read-only.\ntools: Read, Grep\n---\n\n# corpus-reviewer\n\nBody.\n'
    );
});
afterEach(() => {
    rmSync(src, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
});

async function capture(fn: () => number | Promise<number>): Promise<{ out: string; err: string; code: number }> {
    const out: string[] = [];
    const errs: string[] = [];
    const o = vi.spyOn(process.stdout, 'write').mockImplementation((c) => (out.push(String(c)), true));
    const e = vi.spyOn(process.stderr, 'write').mockImplementation((c) => (errs.push(String(c)), true));
    try {
        const code = await fn();
        return { out: out.join(''), err: errs.join(''), code };
    } finally {
        o.mockRestore();
        e.mockRestore();
    }
}

describe('agents command (corpus agents emit, ADR-0098)', () => {
    it('emit --codex --from <dir> generates .codex/agents/*.toml, exit 0', async () => {
        const { code, out } = await capture(() => run(['emit', '--codex', '--from', src], cwd));
        expect(code).toBe(0);
        expect(out).toContain('emitted Codex agents');
        expect(out).toContain('did NOT travel'); // the honest-scope note
        expect(existsSync(join(cwd, '.codex', 'agents', 'corpus-reviewer.toml'))).toBe(true);
    });

    it('emit --json emits machine output with the written list', async () => {
        const { code, out } = await capture(() => run(['emit', '--codex', '--json', '--from', src], cwd));
        expect(code).toBe(0);
        const parsed = JSON.parse(out) as { written: string[]; target: string };
        expect(parsed.written).toContain('corpus-reviewer.toml');
    });

    it('a bare `emit` (no --codex) still emits — codex is the default target', async () => {
        const { code } = await capture(() => run(['emit', '--from', src], cwd));
        expect(code).toBe(0);
        expect(existsSync(join(cwd, '.codex', 'agents', 'corpus-reviewer.toml'))).toBe(true);
    });

    it('an unknown subcommand → exit 2, prints usage', async () => {
        const { code, err } = await capture(() => run(['frobnicate'], cwd));
        expect(code).toBe(2);
        expect(err).toContain('corpus agents emit');
    });

    it('a missing source → exit 2, names --from', async () => {
        const { code, err } = await capture(() => run(['emit', '--from', join(src, 'nope')], cwd));
        expect(code).toBe(2);
        expect(err).toContain('--from');
    });

    it('--force regenerates over an existing file', async () => {
        await capture(() => run(['emit', '--from', src], cwd));
        const path = join(cwd, '.codex', 'agents', 'corpus-reviewer.toml');
        writeFileSync(path, 'EDIT\n');
        const { code } = await capture(() => run(['emit', '--from', src, '--force'], cwd));
        expect(code).toBe(0);
        expect(readFileSync(path, 'utf8')).toContain('developer_instructions');
    });

    it('a second emit without --force reports skipped files (and says how to regenerate)', async () => {
        await capture(() => run(['emit', '--from', src], cwd));
        const { code, out } = await capture(() => run(['emit', '--from', src], cwd));
        expect(code).toBe(1); // skipped → warning
        expect(out).toContain('skipped (exists — re-run with --force)');
    });

    it('a `status: retired` stub is reported as skipped (not installable), normal agents still emit', async () => {
        writeFileSync(
            join(src, 'corpus-evidence-checker.md'),
            '---\nname: corpus-evidence-checker\nstatus: retired\ndescription: >-\n  Retired — do NOT install.\ntools: Read\n---\n\n# corpus-evidence-checker\n\nRedirect stub.\n'
        );
        const { code, out } = await capture(() => run(['emit', '--from', src], cwd));
        expect(code).toBe(0);
        expect(out).toContain('skipped (status: retired — not installable): corpus-evidence-checker.toml');
        // the retired stub is NOT projected; the normal agent is
        expect(existsSync(join(cwd, '.codex', 'agents', 'corpus-evidence-checker.toml'))).toBe(false);
        expect(existsSync(join(cwd, '.codex', 'agents', 'corpus-reviewer.toml'))).toBe(true);
    });

    it('with no --from, resolves ./.claude/agents when present (default source)', async () => {
        // place the defs at the default local source the command tries first
        const localAgents = join(cwd, '.claude', 'agents');
        mkdirSync(localAgents, { recursive: true });
        writeFileSync(
            join(localAgents, 'corpus-x.md'),
            '---\nname: corpus-x\ndescription: d\ntools: Read\n---\n\n# corpus-x\n\nb\n'
        );
        const { code } = await capture(() => run(['emit'], cwd));
        expect(code).toBe(0);
        expect(existsSync(join(cwd, '.codex', 'agents', 'corpus-x.toml'))).toBe(true);
    });

    it('with no --from and no local .claude/agents, falls back to the sibling catalog (errs in a bare temp cwd)', async () => {
        // a temp cwd has neither .claude/agents nor a sibling ../corpus-agents/agents → the fallback resolves
        // to a non-existent dir and the emit errs (never a silent success).
        const { code, err } = await capture(() => run(['emit'], cwd));
        expect(code).toBe(2);
        expect(err).toContain('--from');
    });

    it('corpus agents --help prints its usage, exit 0', async () => {
        const help = await capture(() => dispatch(['agents', '--help']));
        expect(help.code).toBe(0);
        expect(help.out).toContain('corpus agents emit');
    });
});
