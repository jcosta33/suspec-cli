import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run } from '../useCases/update.ts';
import { dispatch } from '../../../index.ts';
import { ok } from '../../../infra/errors/result.ts';

// A kit fixture at 2.0.0 with a CHANGELOG, and one with no VERSION — resolved via `--from` so no
// network clone happens (SPEC-swarm-update AC-002).
let kit: string;
let kitNoVersion: string;
let workspace: string;

beforeAll(() => {
    kit = mkdtempSync(join(tmpdir(), 'swarm-updkit-'));
    writeFileSync(join(kit, 'VERSION'), '2.0.0\n');
    writeFileSync(join(kit, 'CHANGELOG.md'), '# Changelog\n\n## 2.0.0\n- a meaningful kit change\n');

    kitNoVersion = mkdtempSync(join(tmpdir(), 'swarm-updkit-nov-'));
    writeFileSync(join(kitNoVersion, 'README.md'), 'no version here\n');
});
afterAll(() => {
    rmSync(kit, { recursive: true, force: true });
    rmSync(kitNoVersion, { recursive: true, force: true });
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

    it('AC-008: --write is refused as deferred, exit 2, never a silent no-op', async () => {
        pin('1.0.0');
        const { code, err } = await capture(() => run(['--write', '--from', kit], workspace));
        expect(code).toBe(2);
        expect(err).toContain('deferred');
    });

    it('AC-001: an empty/whitespace pin → exit 2, never a silent up-to-date', async () => {
        mkdirSync(join(workspace, '.agents'), { recursive: true });
        writeFileSync(join(workspace, '.agents', '.swarm-version'), '   \n');
        const { code, err } = await capture(() => run(['--check', '--from', kit], workspace));
        expect(code).toBe(2);
        expect(err).toContain('.swarm-version');
    });

    it('AC-008: --apply (the alias) is also refused as deferred, exit 2', async () => {
        pin('1.0.0');
        const { code, err } = await capture(() => run(['--apply', '--from', kit], workspace));
        expect(code).toBe(2);
        expect(err).toContain('deferred');
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
