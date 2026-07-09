import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'child_process';
import {
    mkdtempSync,
    mkdirSync,
    writeFileSync,
    readFileSync,
    readdirSync,
    existsSync,
    lstatSync,
    readlinkSync,
    rmSync,
    statSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run } from '../useCases/init.ts';

let repo: string;
let stateRoot: string;
let envBefore: string | undefined;

beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'suspec-initrepo-'));
    stateRoot = join(mkdtempSync(join(tmpdir(), 'suspec-initstate-')), 'state');
    envBefore = process.env.SUSPEC_STATE_DIR;
    process.env.SUSPEC_STATE_DIR = stateRoot;
});
afterEach(() => {
    if (envBefore === undefined) {
        delete process.env.SUSPEC_STATE_DIR;
    } else {
        process.env.SUSPEC_STATE_DIR = envBefore;
    }
    rmSync(repo, { recursive: true, force: true });
    rmSync(stateRoot, { recursive: true, force: true });
});

async function capture(fn: () => Promise<number>): Promise<{ out: string; code: number }> {
    const out: string[] = [];
    const o = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        out.push(String(chunk));
        return true;
    });
    const e = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
        const code = await fn();
        return { out: out.join(''), code };
    } finally {
        o.mockRestore();
        e.mockRestore();
    }
}

// The whole tree as sorted relative paths (symlinks listed, not followed) — the AC-024 snapshot.
function tree(dir: string): string[] {
    const out: string[] = [];
    const walk = (d: string, prefix: string): void => {
        for (const entry of readdirSync(d).sort()) {
            const full = join(d, entry);
            const rel = prefix === '' ? entry : `${prefix}/${entry}`;
            out.push(rel);
            if (!lstatSync(full).isSymbolicLink() && statSync(full).isDirectory()) {
                walk(full, rel);
            }
        }
    };
    walk(dir, '');
    return out.sort();
}

describe('init command — seed, not scaffold (SPEC-suspec-v2 AC-024)', () => {
    it('seeds exactly the harness footprint and nothing else (before/after snapshot)', async () => {
        writeFileSync(join(repo, 'package.json'), '{}');
        const before = tree(repo);
        expect(before).toEqual(['package.json']);

        const { code } = await capture(() => run([], repo));
        expect(code).toBe(0);

        // Exactly these writes: config, AGENTS seed, the two skills dirs + symlink, .gitignore.
        // NO workspace folders, NO specs/, NO board, NO templates.
        expect(tree(repo)).toEqual(
            [
                '.agents',
                '.agents/skills',
                '.claude',
                '.claude/skills',
                '.gitignore',
                'AGENTS.md',
                'package.json',
                'suspec.config.json',
            ].sort()
        );
        // …and the store was never touched (the state root does not even exist yet).
        expect(existsSync(stateRoot)).toBe(false);
    });

    it('.claude/skills is a RELATIVE symlink to ../.agents/skills', async () => {
        await capture(() => run([], repo));
        const link = join(repo, '.claude', 'skills');
        expect(lstatSync(link).isSymbolicLink()).toBe(true);
        expect(readlinkSync(link)).toBe(join('..', '.agents', 'skills'));
    });

    it('suspec.config.json carries the defaults + the detected setup (lockfile autodetect)', async () => {
        writeFileSync(join(repo, 'pnpm-lock.yaml'), '');
        await capture(() => run([], repo));
        const config = JSON.parse(readFileSync(join(repo, 'suspec.config.json'), 'utf8')) as Record<string, unknown>;
        expect(config.setup).toEqual(['pnpm install']);
        expect(config.runners).toEqual({ default: 'claude' });
        expect(config.wip_cap).toBe(3);
        expect(config.retention_days).toBe(30);
    });

    it('the AGENTS.md seed carries the harness paragraph, the Commands slot table, and the guides pointer', async () => {
        await capture(() => run([], repo));
        const agents = readFileSync(join(repo, 'AGENTS.md'), 'utf8');
        expect(agents).toContain('personal store outside this');
        expect(agents).toContain('| cmdTest |');
        expect(agents).toContain('.agents/skills/');
        expect(agents).toContain('.claude/skills');
    });

    it('an existing AGENTS.md is kept byte-untouched (seeded only when absent, never merged)', async () => {
        writeFileSync(join(repo, 'AGENTS.md'), 'MY OWN BOOTLOADER\n');
        const { code } = await capture(() => run([], repo));
        expect(code).toBe(0);
        expect(readFileSync(join(repo, 'AGENTS.md'), 'utf8')).toBe('MY OWN BOOTLOADER\n');
    });

    it('appends .worktrees/ to an existing .gitignore; a second run is a no-op', async () => {
        writeFileSync(join(repo, '.gitignore'), 'node_modules/\n');
        await capture(() => run([], repo));
        expect(readFileSync(join(repo, '.gitignore'), 'utf8')).toBe('node_modules/\n.worktrees/\n');
        const second = await capture(() => run(['--json'], repo));
        expect(second.code).toBe(0);
        const report = JSON.parse(second.out) as { created: string[]; updated: string[] };
        expect(report.created).toEqual([]);
        expect(report.updated).toEqual([]);
        expect(readFileSync(join(repo, '.gitignore'), 'utf8')).toBe('node_modules/\n.worktrees/\n');
    });

    it('CLAUDE.md is NOT linked by default; --yes links it to AGENTS.md', async () => {
        await capture(() => run([], repo));
        expect(existsSync(join(repo, 'CLAUDE.md'))).toBe(false);

        const withYes = mkdtempSync(join(tmpdir(), 'suspec-inityes-'));
        try {
            await capture(() => run(['--yes'], withYes));
            const link = join(withYes, 'CLAUDE.md');
            expect(lstatSync(link).isSymbolicLink()).toBe(true);
            expect(readlinkSync(link)).toBe('AGENTS.md');
        } finally {
            rmSync(withYes, { recursive: true, force: true });
        }
    });

    it('--yes keeps an existing CLAUDE.md (never relinked over)', async () => {
        writeFileSync(join(repo, 'CLAUDE.md'), 'MINE\n');
        await capture(() => run(['--yes'], repo));
        expect(readFileSync(join(repo, 'CLAUDE.md'), 'utf8')).toBe('MINE\n');
    });

    it('an existing .agents/skills and .claude/skills are kept', async () => {
        mkdirSync(join(repo, '.agents', 'skills', 'mine'), { recursive: true });
        mkdirSync(join(repo, '.claude', 'skills'), { recursive: true });
        const { out, code } = await capture(() => run(['--json'], repo));
        expect(code).toBe(0);
        const report = JSON.parse(out) as { kept: string[] };
        expect(report.kept).toContain('.agents/skills/');
        expect(report.kept).toContain('.claude/skills');
        expect(existsSync(join(repo, '.agents', 'skills', 'mine'))).toBe(true);
    });

    it('prints the global-skill install hint and the CLAUDE.md tip', async () => {
        const { out } = await capture(() => run([], repo));
        expect(out).toContain('npx skills add jcosta33/suspec-skills -g');
        expect(out).toContain('--yes');
    });

    it('run from a subdir of a git repo, the seed lands at the repo ROOT', async () => {
        execFileSync('git', ['init'], { cwd: repo });
        const sub = join(repo, 'packages', 'web');
        mkdirSync(sub, { recursive: true });
        const { code } = await capture(() => run([], sub));
        expect(code).toBe(0);
        expect(existsSync(join(repo, 'suspec.config.json'))).toBe(true);
        expect(existsSync(join(sub, 'suspec.config.json'))).toBe(false);
    });

    it('--json emits a parseable seed report', async () => {
        const { out, code } = await capture(() => run(['--json'], repo));
        expect(code).toBe(0);
        const report = JSON.parse(out) as { level: string; created: string[] };
        expect(report.level).toBe('clean');
        expect(report.created).toContain('suspec.config.json');
        expect(report.created).toContain('AGENTS.md');
    });
});
