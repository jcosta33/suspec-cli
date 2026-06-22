import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run } from '../useCases/update.ts';
import { dispatch } from '../../../index.ts';
import { ok } from '../../../infra/errors/result.ts';

// A kit fixture at 2.0.0 with a CHANGELOG, and one with no VERSION — resolved via `--from` so no
// network clone happens (SPEC-swarm-update AC-002). `applyKit` additionally carries a small file tree
// (a new file + a file that conflicts with the workspace's edit) so the `--write` apply has content to
// land and a conflict to resolve.
let kit: string;
let kitNoVersion: string;
let applyKit: string;
let workspace: string;

beforeAll(() => {
    kit = mkdtempSync(join(tmpdir(), 'swarm-updkit-'));
    writeFileSync(join(kit, 'VERSION'), '2.0.0\n');
    writeFileSync(join(kit, 'CHANGELOG.md'), '# Changelog\n\n## 2.0.0\n- a meaningful kit change\n');

    kitNoVersion = mkdtempSync(join(tmpdir(), 'swarm-updkit-nov-'));
    writeFileSync(join(kitNoVersion, 'README.md'), 'no version here\n');

    applyKit = mkdtempSync(join(tmpdir(), 'swarm-updkit-apply-'));
    writeFileSync(join(applyKit, 'VERSION'), '2.0.0\n');
    writeFileSync(join(applyKit, 'CHANGELOG.md'), '# Changelog\n\n## 2.0.0\n- kit content\n');
    // KIT-OWNED guidance — what `--write` refreshes: a changed template (conflict) + a new guide.
    mkdirSync(join(applyKit, 'templates'), { recursive: true });
    writeFileSync(join(applyKit, 'templates', 'spec.md'), '# Spec template (kit v2)\n');
    mkdirSync(join(applyKit, '.agents', 'skills', 'write-spec'), { recursive: true });
    writeFileSync(join(applyKit, '.agents', 'skills', 'write-spec', 'SKILL.md'), '# write-spec (kit v2)\n');
    // NON-kit-owned seed files the kit also ships — `--write` must NOT touch a lived-in workspace's
    // copies of these (the board, the README), even though the kit's versions differ.
    writeFileSync(join(applyKit, 'README.md'), 'kit README v2\n');
    writeFileSync(join(applyKit, 'status.md'), '# kit board template v2\n');
});
afterAll(() => {
    rmSync(kit, { recursive: true, force: true });
    rmSync(kitNoVersion, { recursive: true, force: true });
    rmSync(applyKit, { recursive: true, force: true });
});
beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'swarm-updws-'));
});
afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
});

function pin(version: string): void {
    mkdirSync(join(workspace, '.agents'), { recursive: true });
    writeFileSync(join(workspace, '.agents', '.swarm-version'), `${version}\n`);
}

async function capture(fn: () => number | Promise<number>): Promise<{ out: string; err: string; code: number }> {
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

describe('update command (SPEC-swarm-update, direct surface)', () => {
    it('AC-001: a missing pin → exit 2, names the pin, never a silent up-to-date', async () => {
        // workspace has no .agents/.swarm-version
        const { code, err } = await capture(() => run(['--check', '--from', kit], workspace));
        expect(code).toBe(2);
        expect(err).toContain('.swarm-version');
    });

    it('AC-002: an unsafe --from source is refused, exit 2 (no clone)', async () => {
        pin('1.0.0');
        const { code, err } = await capture(() => run(['--check', '--from', 'ext::sh -c id'], workspace));
        expect(code).toBe(2);
        expect(err).toContain('unsafe');
    });

    it('AC-003: a kit source with no VERSION → exit 2', async () => {
        pin('1.0.0');
        const { code, err } = await capture(() => run(['--check', '--from', kitNoVersion], workspace));
        expect(code).toBe(2);
        expect(err).toContain('VERSION');
    });

    it('AC-004: behind → exit 1, reports both versions + the CHANGELOG delta', async () => {
        pin('1.0.0');
        const { code, out } = await capture(() => run(['--check', '--from', kit], workspace));
        expect(code).toBe(1);
        expect(out).toContain('1.0.0');
        expect(out).toContain('2.0.0');
        expect(out).toContain('a meaningful kit change');
    });

    it('AC-004: a non-semver pin that differs is treated as drift (exit 1)', async () => {
        pin('main-abc123');
        const { code } = await capture(() => run(['--check', '--from', kit], workspace));
        expect(code).toBe(1);
    });

    it('AC-005: up to date → exit 0', async () => {
        pin('2.0.0');
        const { code, out } = await capture(() => run(['--check', '--from', kit], workspace));
        expect(code).toBe(0);
        expect(out).toContain('up to date');
    });

    it('AC-005: a pin ahead of the kit → exit 0 (not behind)', async () => {
        pin('3.1.0');
        const { code } = await capture(() => run(['--check', '--from', kit], workspace));
        expect(code).toBe(0);
    });

    it('AC-006: --json emits the version fields and the behind flag', async () => {
        pin('1.0.0');
        const { code, out } = await capture(() => run(['--check', '--json', '--from', kit], workspace));
        expect(code).toBe(1);
        const parsed = JSON.parse(out) as { currentVersion: string; latestVersion: string; behind: boolean };
        expect(parsed.currentVersion).toBe('1.0.0');
        expect(parsed.latestVersion).toBe('2.0.0');
        expect(parsed.behind).toBe(true);
    });

    it('AC-007: --check writes nothing to the workspace', async () => {
        pin('1.0.0');
        const before = readdirSync(workspace, { recursive: true }).sort();
        const pinBefore = readFileSync(join(workspace, '.agents', '.swarm-version'), 'utf8');
        await capture(() => run(['--check', '--from', kit], workspace));
        const after = readdirSync(workspace, { recursive: true }).sort();
        const pinAfter = readFileSync(join(workspace, '.agents', '.swarm-version'), 'utf8');
        expect(after).toEqual(before);
        expect(pinAfter).toBe(pinBefore);
    });

    // A lived-in workspace: a customized kit guide (the conflict `--write` reconciles), plus the user's
    // own artifacts that `--write` must never touch — the board, a README, and a spec.
    function livedInWorkspace(): void {
        pin('1.0.0');
        mkdirSync(join(workspace, 'templates'), { recursive: true });
        writeFileSync(join(workspace, 'templates', 'spec.md'), '# my customized spec template\n'); // kit-owned conflict
        writeFileSync(join(workspace, 'status.md'), '# MY BOARD — real work\n'); // user-owned
        writeFileSync(join(workspace, 'README.md'), '# my project\n'); // user-owned
        mkdirSync(join(workspace, 'specs', 'feature'), { recursive: true });
        writeFileSync(join(workspace, 'specs', 'feature', 'spec.md'), '# MY SPEC\n'); // user-owned
    }

    function assertUserArtifactsUntouched(): void {
        // the kit ships seed README/status that DIFFER — none may land or be backed up
        expect(readFileSync(join(workspace, 'status.md'), 'utf8')).toBe('# MY BOARD — real work\n');
        expect(readFileSync(join(workspace, 'README.md'), 'utf8')).toBe('# my project\n');
        expect(readFileSync(join(workspace, 'specs', 'feature', 'spec.md'), 'utf8')).toBe('# MY SPEC\n');
        expect(existsSync(join(workspace, 'status.md.swarm-bak'))).toBe(false);
        expect(existsSync(join(workspace, 'README.md.swarm-bak'))).toBe(false);
    }

    it('AC-008: --write refreshes kit-owned guidance, backs up a customized guide, re-stamps — and never touches user artifacts', async () => {
        livedInWorkspace();
        const { code, out } = await capture(() => run(['--write', '--from', applyKit], workspace));
        // a backed-up customized guide → warning (exit 1), never a silent overwrite
        expect(code).toBe(1);
        expect(out).toContain('updated');
        // the user's customized guide is preserved as a backup, the kit's version is in place
        expect(readFileSync(join(workspace, 'templates', 'spec.md.swarm-bak'), 'utf8')).toBe(
            '# my customized spec template\n'
        );
        expect(readFileSync(join(workspace, 'templates', 'spec.md'), 'utf8')).toContain('Spec template (kit v2)');
        // a brand-new kit-owned guide landed
        expect(readFileSync(join(workspace, '.agents', 'skills', 'write-spec', 'SKILL.md'), 'utf8')).toContain(
            'write-spec (kit v2)'
        );
        // the pin re-stamped to the kit version
        expect(readFileSync(join(workspace, '.agents', '.swarm-version'), 'utf8').trim()).toBe('2.0.0');
        // the load-bearing guarantee: the adopter's own files are untouched
        assertUserArtifactsUntouched();
    });

    it('AC-008: a clean version bump (no customized guide) does NOT cry wolf — exit 0, no backups', async () => {
        // The kit-owned files differ from the kit only because they are NEW (the workspace lacks them);
        // the user edited nothing kit-owned, so there is nothing to reconcile.
        pin('1.0.0');
        writeFileSync(join(workspace, 'status.md'), '# MY BOARD\n');
        const { code, out } = await capture(() => run(['--write', '--from', applyKit], workspace));
        expect(code).toBe(0); // no backup, no skip → clean
        expect(out).toContain('updated');
        expect(readFileSync(join(workspace, 'status.md'), 'utf8')).toBe('# MY BOARD\n'); // board untouched
        expect(existsSync(join(workspace, 'status.md.swarm-bak'))).toBe(false);
        expect(readFileSync(join(workspace, '.agents', '.swarm-version'), 'utf8').trim()).toBe('2.0.0');
    });

    it('AC-008: --write on an already-current workspace applies nothing, exit 0', async () => {
        pin('2.0.0');
        writeFileSync(join(workspace, 'status.md'), 'untouched\n');
        const { code, out } = await capture(() => run(['--write', '--from', applyKit], workspace));
        expect(code).toBe(0);
        expect(out).toContain('already up to date');
        expect(readFileSync(join(workspace, 'status.md'), 'utf8')).toBe('untouched\n');
    });

    it('AC-008: --write --on-conflict overwrite replaces the customized guide with no backup, exit 0', async () => {
        livedInWorkspace();
        const { code } = await capture(() =>
            run(['--write', '--on-conflict', 'overwrite', '--from', applyKit], workspace)
        );
        expect(code).toBe(0); // no backup/skip to reconcile → clean
        expect(readFileSync(join(workspace, 'templates', 'spec.md'), 'utf8')).toContain('Spec template (kit v2)');
        expect(existsSync(join(workspace, 'templates', 'spec.md.swarm-bak'))).toBe(false);
        assertUserArtifactsUntouched();
    });

    it('AC-008: --write --on-conflict skip keeps the customized guide AND keeps the pin behind (no false up-to-date)', async () => {
        livedInWorkspace();
        const { code, out } = await capture(() => run(['--write', '--on-conflict', 'skip', '--from', applyKit], workspace));
        expect(code).toBe(1); // a skipped conflict is left to reconcile → warning
        expect(out).toContain('skip');
        // the kit change is NOT applied — the user's guide is kept
        expect(readFileSync(join(workspace, 'templates', 'spec.md'), 'utf8')).toBe('# my customized spec template\n');
        // the load-bearing #50-adjacent fix: the pin stays at 1.0.0 so the next --check still flags drift
        expect(readFileSync(join(workspace, '.agents', '.swarm-version'), 'utf8').trim()).toBe('1.0.0');
        const recheck = await capture(() => run(['--check', '--from', applyKit], workspace));
        expect(recheck.code).toBe(1); // still behind — never a false "up to date"
    });

    it('AC-008: --write --json emits applied + the version fields + pinAdvanced', async () => {
        pin('1.0.0'); // empty workspace beyond the pin → no conflict
        const { code, out } = await capture(() => run(['--write', '--json', '--from', applyKit], workspace));
        expect(code).toBe(0);
        const parsed = JSON.parse(out) as {
            applied: boolean;
            fromVersion: string;
            toVersion: string;
            pinAdvanced: boolean;
        };
        expect(parsed.applied).toBe(true);
        expect(parsed.fromVersion).toBe('1.0.0');
        expect(parsed.toVersion).toBe('2.0.0');
        expect(parsed.pinAdvanced).toBe(true);
    });

    it('AC-008: --write with a missing pin → exit 2, names the pin (no write attempted)', async () => {
        const { code, err } = await capture(() => run(['--write', '--from', applyKit], workspace));
        expect(code).toBe(2);
        expect(err).toContain('.swarm-version');
    });

    it('AC-008: --on-conflict backup is the explicit form of the default — backs up the customized guide', async () => {
        livedInWorkspace();
        const { code } = await capture(() =>
            run(['--write', '--on-conflict', 'backup', '--from', applyKit], workspace)
        );
        expect(code).toBe(1); // backed up → warning, same as the default
        expect(readFileSync(join(workspace, 'templates', 'spec.md.swarm-bak'), 'utf8')).toBe(
            '# my customized spec template\n'
        );
    });

    it('an unrecognized --on-conflict value → exit 2 usage error, no apply', async () => {
        pin('1.0.0');
        const { code, err } = await capture(() =>
            run(['--write', '--on-conflict', 'bogus', '--from', applyKit], workspace)
        );
        expect(code).toBe(2);
        expect(err).toContain('on-conflict');
    });

    it('AC-001: an empty/whitespace pin → exit 2, never a silent up-to-date', async () => {
        mkdirSync(join(workspace, '.agents'), { recursive: true });
        writeFileSync(join(workspace, '.agents', '.swarm-version'), '   \n');
        const { code, err } = await capture(() => run(['--check', '--from', kit], workspace));
        expect(code).toBe(2);
        expect(err).toContain('.swarm-version');
    });

    it('AC-008: --apply (the alias) also applies the kit', async () => {
        pin('1.0.0');
        const { code, out } = await capture(() => run(['--apply', '--from', applyKit], workspace));
        expect(code).toBe(0); // clean workspace, no conflict
        expect(out).toContain('updated');
        expect(readFileSync(join(workspace, '.agents', '.swarm-version'), 'utf8').trim()).toBe('2.0.0');
    });

    it('AC-007: the resolved kit source is cleaned up after the run', async () => {
        pin('1.0.0');
        const cleanup = vi.fn();
        await capture(() => run(['--check'], workspace, () => ok({ sourceDir: kit, cleanup })));
        expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('AC-009: swarm update --help prints its usage, exit 0', async () => {
        const help = await capture(() => dispatch(['update', '--help']));
        expect(help.code).toBe(0);
        expect(help.out).toContain('swarm update');
    });
});
