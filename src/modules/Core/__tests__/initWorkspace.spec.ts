import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, lstatSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { init_workspace, type InitWorkspaceInput } from '../useCases/initWorkspace.ts';

let kit: string;
let target: string;

beforeAll(() => {
    kit = mkdtempSync(join(tmpdir(), 'swarm-kit-'));
    writeFileSync(join(kit, 'AGENTS.md'), 'KIT WORKSPACE AGENTS\n');
    symlinkSync('AGENTS.md', join(kit, 'CLAUDE.md'));
    writeFileSync(join(kit, 'README.md'), 'KIT README\n');
    writeFileSync(join(kit, 'status.md'), '# Board\n');
    writeFileSync(join(kit, '.gitignore'), '.DS_Store\n');
    writeFileSync(join(kit, '.gitignore.additions'), 'node_modules/\n.swarm-cache/');
    mkdirSync(join(kit, 'specs', 'demo'), { recursive: true });
    writeFileSync(join(kit, 'specs', 'demo', 'spec.md'), 'demo spec\n');
    mkdirSync(join(kit, '.git'));
    writeFileSync(join(kit, '.git', 'HEAD'), 'ref: refs/heads/main\n');
});

afterAll(() => {
    rmSync(kit, { recursive: true, force: true });
});

beforeEach(() => {
    target = mkdtempSync(join(tmpdir(), 'swarm-target-'));
});

afterEach(() => {
    rmSync(target, { recursive: true, force: true });
});

const run = (over: Partial<InitWorkspaceInput> = {}) =>
    init_workspace({ sourceDir: kit, targetDir: target, policy: 'skip', mode: 'workspace', ...over });

describe('init_workspace — workspace mode, greenfield', () => {
    it('copies the whole kit tree, merges .gitignore, keeps symlinks, clean verdict', () => {
        const report = assertOk(run());
        expect(report.level).toBe('clean');
        expect(report.skipped).toEqual([]);
        expect(readFileSync(join(target, 'AGENTS.md'), 'utf8')).toBe('KIT WORKSPACE AGENTS\n');
        expect(readFileSync(join(target, 'specs/demo/spec.md'), 'utf8')).toBe('demo spec\n');
        expect(lstatSync(join(target, 'CLAUDE.md')).isSymbolicLink()).toBe(true);
        expect(readFileSync(join(target, '.gitignore'), 'utf8')).toContain('node_modules/');
        expect(report.written).toContain('.gitignore');
        expect(report.written).toContain('specs/demo/spec.md');
        expect(existsSync(join(target, '.git'))).toBe(false); // never copies the kit's .git
    });

    it('a filesystem write failure returns InitWriteFailed, not an uncaught crash', () => {
        // Point the target at a regular file: the first write (mkdir of the target) fails structurally
        // (ENOTDIR/EEXIST) — root-proof, unlike a chmod. It must route through Result, not throw.
        const asFile = join(target, 'not-a-dir');
        writeFileSync(asFile, 'i am a file\n');
        const failure = assertErr(run({ targetDir: asFile }));
        expect(failure._tag).toBe('InitWriteFailed');
        expect(failure.message).toContain('could not write');
    });

    it('is idempotent — a second run writes/skips/merges nothing', () => {
        assertOk(run());
        const second = assertOk(run());
        expect(second.written).toEqual([]);
        expect(second.skipped).toEqual([]);
        expect(second.merged).toEqual([]);
        expect(second.level).toBe('clean');
    });
});

describe('init_workspace — existing repo (the conflict case)', () => {
    beforeEach(() => {
        writeFileSync(join(target, 'README.md'), 'USER README\n');
        writeFileSync(join(target, '.gitignore'), '/dist\n');
    });

    it('skip (default): leaves the user README untouched, merges .gitignore, warns', () => {
        const report = assertOk(run({ policy: 'skip' }));
        expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('USER README\n'); // untouched
        const gitignore = readFileSync(join(target, '.gitignore'), 'utf8');
        expect(gitignore).toContain('/dist'); // user line preserved
        expect(gitignore).toContain('node_modules/'); // swarm block appended
        expect(report.skipped).toContain('README.md');
        expect(report.merged).toContain('.gitignore');
        expect(report.level).toBe('warning');
    });

    it('backup: preserves the user file as <name>.swarm-bak and writes the kit version', () => {
        const report = assertOk(run({ policy: 'backup' }));
        expect(readFileSync(join(target, 'README.md.swarm-bak'), 'utf8')).toBe('USER README\n');
        expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('KIT README\n');
        expect(report.backedUp).toContain('README.md');
    });

    it('overwrite: replaces the user file with the kit version', () => {
        const report = assertOk(run({ policy: 'overwrite' }));
        expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('KIT README\n');
        expect(report.overwritten).toContain('README.md');
    });
});

describe('init_workspace — footprint mode', () => {
    it('merges only .gitignore + an AGENTS pointer, never dumps the workspace tree', () => {
        const report = assertOk(run({ mode: 'footprint' }));
        expect(existsSync(join(target, 'status.md'))).toBe(false);
        expect(existsSync(join(target, 'specs'))).toBe(false);
        expect(readFileSync(join(target, '.gitignore'), 'utf8')).toContain('node_modules/');
        const agents = readFileSync(join(target, 'AGENTS.md'), 'utf8');
        expect(agents).toContain('swarm-starter-kit');
        expect(agents).toContain('<!-- swarm:start -->');
        expect(report.mode).toBe('footprint');
    });

    it('merges the pointer into an existing AGENTS.md without disturbing user content', () => {
        writeFileSync(join(target, 'AGENTS.md'), 'USER AGENTS CONTENT\n');
        const report = assertOk(run({ mode: 'footprint' }));
        const agents = readFileSync(join(target, 'AGENTS.md'), 'utf8');
        expect(agents).toContain('USER AGENTS CONTENT');
        expect(agents).toContain('<!-- swarm:start -->');
        expect(report.merged).toContain('AGENTS.md');
    });

    it('is idempotent on a second footprint run', () => {
        assertOk(run({ mode: 'footprint' }));
        const second = assertOk(run({ mode: 'footprint' }));
        expect(second.written).toEqual([]);
        expect(second.merged).toEqual([]);
        expect(second.level).toBe('clean');
    });
});

describe('init_workspace — kit without .gitignore.additions', () => {
    it('falls back to a default ignore block', () => {
        const bareKit = mkdtempSync(join(tmpdir(), 'swarm-barekit-'));
        try {
            writeFileSync(join(bareKit, 'AGENTS.md'), 'X\n');
            const report = assertOk(
                init_workspace({ sourceDir: bareKit, targetDir: target, policy: 'skip', mode: 'footprint' })
            );
            expect(readFileSync(join(target, '.gitignore'), 'utf8')).toContain('.swarm-cache/');
            expect(report.written).toContain('.gitignore');
        } finally {
            rmSync(bareKit, { recursive: true, force: true });
        }
    });
});

describe('init_workspace — failure', () => {
    it('returns an Err when the kit source is missing', () => {
        const failure = assertErr(
            init_workspace({ sourceDir: '/no/such/kit', targetDir: target, policy: 'skip', mode: 'workspace' })
        );
        expect(failure._tag).toBe('InitSourceMissing');
    });
});
