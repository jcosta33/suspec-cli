import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    mkdtempSync,
    mkdirSync,
    writeFileSync,
    readFileSync,
    lstatSync,
    readlinkSync,
    rmSync,
    symlinkSync,
    chmodSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { seed_repo } from '../useCases/seedRepo.ts';
import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';

let repo: string;

beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'suspec-seed-'));
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('seed_repo (SPEC-suspec-v2 AC-024)', () => {
    it('a bare dir gets the full seed: config, AGENTS.md, skills dirs, symlink, .gitignore', () => {
        const report = assertOk(seed_repo({ repoRoot: repo, linkClaudeMd: false, runnerDefault: 'claude' }));
        expect(report.level).toBe('clean');
        expect(report.created).toEqual([
            'suspec.config.json',
            'AGENTS.md',
            '.agents/skills/',
            '.claude/skills',
            '.gitignore',
        ]);
        expect(report.updated).toEqual([]);
        expect(report.kept).toEqual([]);
        expect(readFileSync(join(repo, '.gitignore'), 'utf8')).toBe('.worktrees/\n');
        expect(readlinkSync(join(repo, '.claude', 'skills'))).toBe(join('..', '.agents', 'skills'));
    });

    it('detected setup commands land in the seeded config', () => {
        writeFileSync(join(repo, 'package-lock.json'), '{}');
        writeFileSync(join(repo, 'Cargo.toml'), '');
        assertOk(seed_repo({ repoRoot: repo, linkClaudeMd: false, runnerDefault: 'claude' }));
        const config = JSON.parse(readFileSync(join(repo, 'suspec.config.json'), 'utf8')) as { setup: string[] };
        expect(config.setup).toEqual(['npm ci', 'cargo fetch']);
    });

    it('no lockfile → an empty setup list (the graceful default made visible)', () => {
        assertOk(seed_repo({ repoRoot: repo, linkClaudeMd: false, runnerDefault: 'claude' }));
        const config = JSON.parse(readFileSync(join(repo, 'suspec.config.json'), 'utf8')) as { setup: string[] };
        expect(config.setup).toEqual([]);
    });

    it('linkClaudeMd: true writes the CLAUDE.md → AGENTS.md symlink', () => {
        const report = assertOk(seed_repo({ repoRoot: repo, linkClaudeMd: true, runnerDefault: 'claude' }));
        expect(report.created).toContain('CLAUDE.md');
        expect(lstatSync(join(repo, 'CLAUDE.md')).isSymbolicLink()).toBe(true);
        expect(readlinkSync(join(repo, 'CLAUDE.md'))).toBe('AGENTS.md');
    });

    it('an existing CLAUDE.md is kept even under linkClaudeMd: true', () => {
        writeFileSync(join(repo, 'CLAUDE.md'), 'MINE\n');
        const report = assertOk(seed_repo({ repoRoot: repo, linkClaudeMd: true, runnerDefault: 'claude' }));
        expect(report.kept).toContain('CLAUDE.md');
        expect(readFileSync(join(repo, 'CLAUDE.md'), 'utf8')).toBe('MINE\n');
    });

    it('re-running is a full no-op: everything reads kept, bytes unchanged', () => {
        assertOk(seed_repo({ repoRoot: repo, linkClaudeMd: true, runnerDefault: 'claude' }));
        const agentsBefore = readFileSync(join(repo, 'AGENTS.md'), 'utf8');
        const report = assertOk(seed_repo({ repoRoot: repo, linkClaudeMd: true, runnerDefault: 'claude' }));
        expect(report.created).toEqual([]);
        expect(report.updated).toEqual([]);
        expect(report.kept).toEqual([
            'suspec.config.json',
            'AGENTS.md',
            '.agents/skills/',
            '.claude/skills',
            'CLAUDE.md',
            '.gitignore',
        ]);
        expect(readFileSync(join(repo, 'AGENTS.md'), 'utf8')).toBe(agentsBefore);
    });

    it('.gitignore without a trailing newline gets the glue newline before .worktrees/', () => {
        writeFileSync(join(repo, '.gitignore'), 'dist');
        const report = assertOk(seed_repo({ repoRoot: repo, linkClaudeMd: false, runnerDefault: 'claude' }));
        expect(report.updated).toEqual(['.gitignore']);
        expect(readFileSync(join(repo, '.gitignore'), 'utf8')).toBe('dist\n.worktrees/\n');
    });

    it('a .gitignore already listing .worktrees (no slash) is kept unchanged', () => {
        writeFileSync(join(repo, '.gitignore'), '.worktrees\n');
        const report = assertOk(seed_repo({ repoRoot: repo, linkClaudeMd: false, runnerDefault: 'claude' }));
        expect(report.kept).toContain('.gitignore');
        expect(readFileSync(join(repo, '.gitignore'), 'utf8')).toBe('.worktrees\n');
    });

    it('a DANGLING CLAUDE.md symlink counts as present — never clobbered', () => {
        symlinkSync('does-not-exist.md', join(repo, 'CLAUDE.md'));
        const report = assertOk(seed_repo({ repoRoot: repo, linkClaudeMd: true, runnerDefault: 'claude' }));
        expect(report.kept).toContain('CLAUDE.md');
        expect(readlinkSync(join(repo, 'CLAUDE.md'))).toBe('does-not-exist.md');
    });

    it('a filesystem failure routes through the Result channel (no thrown EACCES)', () => {
        mkdirSync(join(repo, 'sealed'));
        chmodSync(join(repo, 'sealed'), 0o500);
        try {
            const error = assertErr(
                seed_repo({ repoRoot: join(repo, 'sealed'), linkClaudeMd: false, runnerDefault: 'claude' })
            );
            expect(error._tag).toBe('seed_write_failed');
        } finally {
            chmodSync(join(repo, 'sealed'), 0o700);
        }
    });
});
