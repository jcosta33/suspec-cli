import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, lstatSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { copy_kit_tree, type CopyKitTreeInput } from '../useCases/copyKitTree.ts';

let kit: string;
let target: string;

beforeAll(() => {
    kit = mkdtempSync(join(tmpdir(), 'suspec-kit-'));
    writeFileSync(join(kit, 'AGENTS.md'), 'KIT AGENTS\n');
    symlinkSync('AGENTS.md', join(kit, 'CLAUDE.md'));
    writeFileSync(join(kit, 'README.md'), 'KIT README\n');
    writeFileSync(join(kit, '.gitignore'), '.DS_Store\n');
    writeFileSync(join(kit, '.gitignore.additions'), 'node_modules/\n.suspec-cache/');
    mkdirSync(join(kit, 'templates'), { recursive: true });
    writeFileSync(join(kit, 'templates', 'spec.md'), 'template spec\n');
    mkdirSync(join(kit, '.git'));
    writeFileSync(join(kit, '.git', 'HEAD'), 'ref: refs/heads/main\n');
});

afterAll(() => {
    rmSync(kit, { recursive: true, force: true });
});

beforeEach(() => {
    target = mkdtempSync(join(tmpdir(), 'suspec-target-'));
});

afterEach(() => {
    rmSync(target, { recursive: true, force: true });
});

const run = (over: Partial<CopyKitTreeInput> = {}) =>
    copy_kit_tree({ sourceDir: kit, targetDir: target, policy: 'skip', ...over });

describe('copy_kit_tree — the conflict-safe kit copy behind `suspec update --write`', () => {
    it('copies the kit tree, merges .gitignore, keeps symlinks, clean level', () => {
        const report = assertOk(run());
        expect(report.level).toBe('clean');
        expect(report.skipped).toEqual([]);
        expect(readFileSync(join(target, 'AGENTS.md'), 'utf8')).toBe('KIT AGENTS\n');
        expect(readFileSync(join(target, 'templates/spec.md'), 'utf8')).toBe('template spec\n');
        expect(lstatSync(join(target, 'CLAUDE.md')).isSymbolicLink()).toBe(true);
        expect(readFileSync(join(target, '.gitignore'), 'utf8')).toContain('node_modules/');
        expect(report.written).toContain('.gitignore');
        expect(report.written).toContain('templates/spec.md');
        expect(existsSync(join(target, '.git'))).toBe(false); // never copies the kit's .git
    });

    it('a missing kit source errs kit_source_missing', () => {
        const failure = assertErr(run({ sourceDir: join(kit, 'nope') }));
        expect(failure._tag).toBe('kit_source_missing');
    });

    it('stamps .agents/.suspec-version from the kit VERSION (ADR-0081)', () => {
        const verKit = mkdtempSync(join(tmpdir(), 'suspec-verkit-'));
        try {
            writeFileSync(join(verKit, 'AGENTS.md'), 'A\n');
            writeFileSync(join(verKit, 'VERSION'), '1.1.0\n');
            const report = assertOk(run({ sourceDir: verKit }));
            expect(readFileSync(join(target, '.agents', '.suspec-version'), 'utf8').trim()).toBe('1.1.0');
            expect(report.written).toContain('.agents/.suspec-version');
        } finally {
            rmSync(verKit, { recursive: true, force: true });
        }
    });

    it('stamps nothing when the kit has no VERSION file, or an empty one', () => {
        const report = assertOk(run()); // the shared fixture kit carries no VERSION
        expect(existsSync(join(target, '.agents', '.suspec-version'))).toBe(false);
        expect(report.written).not.toContain('.agents/.suspec-version');

        const verKit = mkdtempSync(join(tmpdir(), 'suspec-verkit-'));
        try {
            writeFileSync(join(verKit, 'AGENTS.md'), 'A\n');
            writeFileSync(join(verKit, 'VERSION'), '   \n'); // present but blank
            const second = mkdtempSync(join(tmpdir(), 'suspec-target2-'));
            try {
                const report2 = assertOk(run({ sourceDir: verKit, targetDir: second }));
                expect(existsSync(join(second, '.agents', '.suspec-version'))).toBe(false);
                expect(report2.written).not.toContain('.agents/.suspec-version');
            } finally {
                rmSync(second, { recursive: true, force: true });
            }
        } finally {
            rmSync(verKit, { recursive: true, force: true });
        }
    });

    it('a filesystem write failure returns kit_copy_failed, not an uncaught crash', () => {
        // Point the target at a regular file: the first write fails structurally (ENOTDIR) —
        // root-proof, unlike a chmod. It must route through Result, not throw.
        const asFile = join(target, 'not-a-dir');
        writeFileSync(asFile, 'i am a file\n');
        const failure = assertErr(run({ targetDir: asFile }));
        expect(failure._tag).toBe('kit_copy_failed');
        expect(failure.message).toContain('could not copy');
    });

    it('overwrite onto a destination symlink replaces the link, never writes through to its target', () => {
        const external = `${target}-precious`; // outside the tree
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
        const external = `${target}-ghost`; // outside the tree — the dangling link's (absent) target
        rmSync(external, { force: true }); // ensure the target does NOT exist → the link dangles
        symlinkSync(external, join(target, 'README.md'));
        try {
            const report = assertOk(run({ policy: 'backup' }));
            expect(existsSync(external)).toBe(false); // nothing written through the link
            expect(lstatSync(join(target, 'README.md.suspec-bak')).isSymbolicLink()).toBe(true);
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
            expect(existsSync(external)).toBe(false);
            expect(lstatSync(join(target, 'README.md')).isSymbolicLink()).toBe(true); // link kept as-is
            expect(report.skipped).toContain('README.md');
        } finally {
            rmSync(external, { force: true });
        }
    });

    it('an existing destination symlink under skip stays; under overwrite is replaced (live link)', () => {
        const external = `${target}-live`;
        writeFileSync(external, 'LIVE\n');
        try {
            symlinkSync(external, join(target, 'README.md'));
            const kept = assertOk(run({ policy: 'skip' }));
            expect(kept.skipped).toContain('README.md');
            expect(lstatSync(join(target, 'README.md')).isSymbolicLink()).toBe(true);
        } finally {
            rmSync(external, { force: true });
        }
    });

    it('pathFilter (the --write refresh scope) copies ONLY matching kit paths, never the rest', () => {
        const report = assertOk(run({ pathFilter: (rel) => rel.startsWith('templates/') }));
        expect(report.written).toContain('templates/spec.md');
        expect(report.written).not.toContain('AGENTS.md');
        expect(report.written).not.toContain('README.md');
        expect(existsSync(join(target, 'README.md'))).toBe(false);
        // `.gitignore` still merges regardless of the filter
        expect(report.written).toContain('.gitignore');
    });

    it('conflicts: skip keeps the user file (warning), backup preserves it, overwrite replaces it', () => {
        writeFileSync(join(target, 'README.md'), 'USER README\n');
        writeFileSync(join(target, '.gitignore'), '/dist\n');

        const skipped = assertOk(run({ policy: 'skip' }));
        expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('USER README\n');
        const gitignore = readFileSync(join(target, '.gitignore'), 'utf8');
        expect(gitignore).toContain('/dist');
        expect(gitignore).toContain('node_modules/');
        expect(skipped.skipped).toContain('README.md');
        expect(skipped.merged).toContain('.gitignore');
        expect(skipped.level).toBe('warning');

        const backed = assertOk(run({ policy: 'backup' }));
        expect(readFileSync(join(target, 'README.md.suspec-bak'), 'utf8')).toBe('USER README\n');
        expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('KIT README\n');
        expect(backed.backedUp).toContain('README.md');

        writeFileSync(join(target, 'README.md'), 'USER AGAIN\n');
        const overwritten = assertOk(run({ policy: 'overwrite' }));
        expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('KIT README\n');
        expect(overwritten.overwritten).toContain('README.md');
    });

    it('a second backup run never destroys the first backup (suffix escalation)', () => {
        writeFileSync(join(target, 'README.md'), 'FIRST\n');
        assertOk(run({ policy: 'backup' }));
        writeFileSync(join(target, 'README.md'), 'SECOND\n');
        assertOk(run({ policy: 'backup' }));
        expect(readFileSync(join(target, 'README.md.suspec-bak'), 'utf8')).toBe('FIRST\n');
        expect(readFileSync(join(target, 'README.md.suspec-bak.1'), 'utf8')).toBe('SECOND\n');
    });

    it('falls back to the built-in gitignore block when the kit ships no .gitignore.additions', () => {
        const bareKit = mkdtempSync(join(tmpdir(), 'suspec-barekit-'));
        try {
            writeFileSync(join(bareKit, 'AGENTS.md'), 'A\n');
            assertOk(run({ sourceDir: bareKit }));
            expect(readFileSync(join(target, '.gitignore'), 'utf8')).toContain('.worktrees/');
        } finally {
            rmSync(bareKit, { recursive: true, force: true });
        }
    });
});
