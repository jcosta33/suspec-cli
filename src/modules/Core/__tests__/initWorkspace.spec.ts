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

    it('stamps .agents/.swarm-version from the kit VERSION (ADR-0081)', () => {
        const verKit = mkdtempSync(join(tmpdir(), 'swarm-verkit-'));
        try {
            writeFileSync(join(verKit, 'AGENTS.md'), 'A\n');
            mkdirSync(join(verKit, '.agents', 'skills'), { recursive: true });
            writeFileSync(join(verKit, '.agents', 'skills', 'x.md'), 'skill\n');
            writeFileSync(join(verKit, 'VERSION'), '1.1.0\n');
            const report = assertOk(
                init_workspace({ sourceDir: verKit, targetDir: target, policy: 'skip', mode: 'workspace' })
            );
            expect(readFileSync(join(target, '.agents', '.swarm-version'), 'utf8').trim()).toBe('1.1.0');
            expect(report.written).toContain('.agents/.swarm-version');
        } finally {
            rmSync(verKit, { recursive: true, force: true });
        }
    });

    it('writes the .agents/.swarm-version provenance pin from a --from kit VERSION (#12)', () => {
        const fromKit = mkdtempSync(join(tmpdir(), 'swarm-fromkit-'));
        try {
            writeFileSync(join(fromKit, 'AGENTS.md'), 'A\n');
            writeFileSync(join(fromKit, 'VERSION'), '1.2.0\n');
            init_workspace({ sourceDir: fromKit, targetDir: target, policy: 'skip', mode: 'workspace' });
            const pin = join(target, '.agents', '.swarm-version');
            expect(existsSync(pin)).toBe(true);
            expect(readFileSync(pin, 'utf8').trim()).toBe('1.2.0');
        } finally {
            rmSync(fromKit, { recursive: true, force: true });
        }
    });

    it('stamps nothing when the kit has no VERSION file (older kit)', () => {
        const report = assertOk(run()); // the shared fixture kit carries no VERSION
        expect(existsSync(join(target, '.agents', '.swarm-version'))).toBe(false);
        expect(report.written).not.toContain('.agents/.swarm-version');
    });

    it('stamps nothing when the kit VERSION is empty', () => {
        const verKit = mkdtempSync(join(tmpdir(), 'swarm-verkit-'));
        try {
            writeFileSync(join(verKit, 'AGENTS.md'), 'A\n');
            mkdirSync(join(verKit, '.agents'), { recursive: true });
            writeFileSync(join(verKit, 'VERSION'), '   \n'); // present but blank
            const report = assertOk(
                init_workspace({ sourceDir: verKit, targetDir: target, policy: 'skip', mode: 'workspace' })
            );
            expect(existsSync(join(target, '.agents', '.swarm-version'))).toBe(false);
            expect(report.written).not.toContain('.agents/.swarm-version');
        } finally {
            rmSync(verKit, { recursive: true, force: true });
        }
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

    it('--force onto a destination symlink replaces the link, never writes through to its target', () => {
        const external = `${target}-precious`; // outside the workspace
        writeFileSync(external, 'PRECIOUS\n');
        try {
            symlinkSync(external, join(target, 'README.md')); // a kit file's destination is a symlink out
            const report = assertOk(run({ policy: 'overwrite' }));
            expect(readFileSync(external, 'utf8')).toBe('PRECIOUS\n'); // the external target is untouched
            expect(lstatSync(join(target, 'README.md')).isSymbolicLink()).toBe(false); // link replaced
            expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('KIT README\n');
            expect(report.overwritten).toContain('README.md');
        } finally {
            rmSync(external, { force: true });
        }
    });

    it('is idempotent — a second run writes/skips/merges nothing', () => {
        assertOk(run());
        const second = assertOk(run());
        expect(second.written).toEqual([]);
        expect(second.skipped).toEqual([]);
        expect(second.merged).toEqual([]);
        expect(second.level).toBe('clean');
    });

    it('a DANGLING destination symlink is a conflict on the link — never writes through to its (outside) target', () => {
        // `existsSync` follows a symlink and reports a dangling one as ABSENT; copying then writes THROUGH
        // the broken link to its target (which can live outside the workspace) and silently loses the link.
        // The engine must lstat the link itself and treat it as a conflict.
        const external = `${target}-ghost`; // outside the workspace — the dangling link's (absent) target
        rmSync(external, { force: true }); // ensure the target does NOT exist → the link dangles
        symlinkSync(external, join(target, 'README.md')); // a kit file's destination is a DANGLING link out
        try {
            const report = assertOk(run({ policy: 'backup' }));
            // nothing was written through the link to the outside path
            expect(existsSync(external)).toBe(false);
            // the user's dangling link was preserved as a backup, the kit file landed as a real file
            expect(lstatSync(join(target, 'README.md.swarm-bak')).isSymbolicLink()).toBe(true);
            expect(lstatSync(join(target, 'README.md')).isSymbolicLink()).toBe(false);
            expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('KIT README\n');
            expect(report.backedUp).toContain('README.md');
        } finally {
            rmSync(external, { force: true });
        }
    });

    it('skip policy on a DANGLING destination symlink keeps the link and still never writes through', () => {
        const external = `${target}-ghost2`;
        rmSync(external, { force: true });
        symlinkSync(external, join(target, 'README.md'));
        try {
            const report = assertOk(run({ policy: 'skip' }));
            expect(existsSync(external)).toBe(false); // nothing written through the link
            expect(lstatSync(join(target, 'README.md')).isSymbolicLink()).toBe(true); // link kept as-is
            expect(report.skipped).toContain('README.md');
        } finally {
            rmSync(external, { force: true });
        }
    });

    it('pathFilter (the --write refresh scope) copies ONLY matching kit paths, never the rest', () => {
        // `swarm update --write` passes a kit-owned filter so a lived-in workspace's own files are not
        // re-scaffolded. Here: refresh only `specs/` — AGENTS.md/README/status must NOT be written.
        const report = assertOk(run({ pathFilter: (rel) => rel.startsWith('specs/') }));
        expect(report.written).toContain('specs/demo/spec.md');
        expect(report.written).not.toContain('AGENTS.md');
        expect(report.written).not.toContain('README.md');
        expect(existsSync(join(target, 'README.md'))).toBe(false);
        // `.gitignore` still merges and the pin still stamps regardless of the filter
        expect(report.written).toContain('.gitignore');
        expect(existsSync(join(target, '.agents', '.swarm-version'))).toBe(false); // kit fixture has no VERSION
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

    it('a workspace init over a prior footprint init upgrades the pointer AGENTS.md, backing up the stub (R4-ISS-08)', () => {
        // Footprint first: AGENTS.md becomes the pointer stub (carries the swarm:start markers).
        assertOk(run({ mode: 'footprint' }));
        expect(readFileSync(join(target, 'AGENTS.md'), 'utf8')).toContain('<!-- swarm:start -->');
        // Then upgrade to workspace: the stub must NOT be silently skipped — it is replaced by the full
        // kit AGENTS.md and backed up, so the workspace gets its real bootloader and no user content is lost.
        const report = assertOk(run({ mode: 'workspace' }));
        expect(readFileSync(join(target, 'AGENTS.md'), 'utf8')).toBe('KIT WORKSPACE AGENTS\n');
        expect(report.backedUp).toContain('AGENTS.md');
        expect(existsSync(join(target, 'AGENTS.md.swarm-bak'))).toBe(true);
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
