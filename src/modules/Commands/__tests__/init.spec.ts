import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run } from '../useCases/init.ts';

let kit: string;
let target: string;

beforeAll(() => {
    kit = mkdtempSync(join(tmpdir(), 'swarm-initkit-'));
    writeFileSync(join(kit, 'AGENTS.md'), 'KIT WORKSPACE AGENTS\n');
    writeFileSync(join(kit, '.gitignore.additions'), 'node_modules/\n.swarm-cache/');
    writeFileSync(join(kit, 'status.md'), '# Board\n');
    writeFileSync(join(kit, 'README.md'), 'KIT README\n');
    mkdirSync(join(kit, 'specs', 'demo'), { recursive: true });
    writeFileSync(join(kit, 'specs', 'demo', 'spec.md'), 'demo\n');
    mkdirSync(join(kit, 'templates'), { recursive: true });
    writeFileSync(join(kit, 'templates', 'spec.md'), 'template\n');
});
afterAll(() => {
    rmSync(kit, { recursive: true, force: true });
});
beforeEach(() => {
    target = mkdtempSync(join(tmpdir(), 'swarm-inittarget-'));
});
afterEach(() => {
    rmSync(target, { recursive: true, force: true });
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

describe('init command (direct surface, AC-012/016, D-003)', () => {
    it('an empty target → workspace mode: copies the tree, exit 0', async () => {
        const { code } = await capture(() => run(['--from', kit], target));
        expect(code).toBe(0);
        expect(readFileSync(join(target, 'AGENTS.md'), 'utf8')).toBe('KIT WORKSPACE AGENTS\n');
        expect(existsSync(join(target, 'specs/demo/spec.md'))).toBe(true);
        expect(readFileSync(join(target, '.gitignore'), 'utf8')).toContain('node_modules/');
    });

    it('re-running init on a workspace stays in workspace mode (no flip to footprint)', async () => {
        expect(JSON.parse((await capture(() => run(['--from', kit, '--json'], target))).out)).toMatchObject({
            mode: 'workspace',
        });
        const second = await capture(() => run(['--from', kit, '--json'], target));
        expect(JSON.parse(second.out)).toMatchObject({ mode: 'workspace' });
        // a workspace AGENTS.md stays the plain kit copy — no footprint pointer block merged in
        expect(readFileSync(join(target, 'AGENTS.md'), 'utf8')).not.toContain('swarm:start');
    });

    it('a non-empty repo → footprint mode: merges .gitignore + AGENTS pointer, no tree dump', async () => {
        writeFileSync(join(target, 'package.json'), '{}');
        const { code } = await capture(() => run(['--from', kit], target));
        expect(code).toBe(0);
        expect(existsSync(join(target, 'status.md'))).toBe(false);
        expect(existsSync(join(target, 'specs'))).toBe(false);
        expect(readFileSync(join(target, 'AGENTS.md'), 'utf8')).toContain('swarm-starter-kit');
    });

    it('--workspace into a repo with a conflict → skips it (warning, exit 1)', async () => {
        writeFileSync(join(target, 'README.md'), 'USER README\n');
        const { code } = await capture(() => run(['--from', kit, '--workspace'], target));
        expect(code).toBe(1);
        expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('USER README\n');
    });

    it('--on-conflict backup → backs the user file up, exit 0', async () => {
        writeFileSync(join(target, 'README.md'), 'USER README\n');
        const { code } = await capture(() => run(['--from', kit, '--workspace', '--on-conflict', 'backup'], target));
        expect(code).toBe(0);
        expect(readFileSync(join(target, 'README.md.swarm-bak'), 'utf8')).toBe('USER README\n');
        expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('KIT README\n');
    });

    it('--force overwrites a conflict, exit 0', async () => {
        writeFileSync(join(target, 'README.md'), 'USER README\n');
        const { code } = await capture(() => run(['--from', kit, '--workspace', '--force'], target));
        expect(code).toBe(0);
        expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('KIT README\n');
    });

    it('--on-conflict overwrite replaces a conflict, exit 0', async () => {
        writeFileSync(join(target, 'README.md'), 'USER README\n');
        const { code } = await capture(() => run(['--from', kit, '--workspace', '--on-conflict', 'overwrite'], target));
        expect(code).toBe(0);
        expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('KIT README\n');
    });

    it('--footprint forces footprint mode even in an empty dir', async () => {
        const { code } = await capture(() => run(['--from', kit, '--footprint'], target));
        expect(code).toBe(0);
        expect(existsSync(join(target, 'specs'))).toBe(false);
        expect(existsSync(join(target, 'AGENTS.md'))).toBe(true);
    });

    it('accepts a positional target directory', async () => {
        const { code } = await capture(() => run(['--from', kit, 'sub'], target));
        expect(code).toBe(0);
        expect(existsSync(join(target, 'sub', 'AGENTS.md'))).toBe(true);
    });

    it('--json emits a parseable report', async () => {
        const { code, out } = await capture(() => run(['--from', kit, '--json'], target));
        expect(code).toBe(0);
        expect(JSON.parse(out)).toMatchObject({ level: 'clean', mode: 'workspace' });
    });

    it('a target that is a file (not a directory) → exit 2, not an ENOTDIR crash', async () => {
        writeFileSync(join(target, 'afile'), 'x');
        const { code } = await capture(() => run(['--from', kit, 'afile'], target));
        expect(code).toBe(2);
    });
});
