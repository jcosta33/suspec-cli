import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { stamp_runtime_isolation } from '../useCases/stampRuntimeIsolation.ts';

describe('stamp_runtime_isolation', () => {
    it('is a no-op success when no runtime-isolation range is configured', () => {
        const writes: string[] = [];
        const report = stamp_runtime_isolation({
            worktreePath: '/wt',
            slug: 'checkout',
            config: null,
            writeFile: (path) => writes.push(path),
        });
        expect(report.stamped).toBe(false);
        expect(report.port).toBeNull();
        expect(writes).toEqual([]);
    });

    it('stamps a per-worktree fixture with a port inside the configured range', () => {
        const captured: { path: string; content: string }[] = [];
        const report = stamp_runtime_isolation({
            worktreePath: '/wt',
            slug: 'checkout',
            config: { portRangeStart: 4000, portRangeSize: 100 },
            writeFile: (path, content) => captured.push({ path, content }),
        });
        expect(report.stamped).toBe(true);
        expect(report.portOffset).toBeGreaterThanOrEqual(0);
        expect(report.portOffset).toBeLessThan(100);
        expect(report.port).toBe(4000 + (report.portOffset ?? -1));
        expect(captured[0].path).toBe('/wt/.suspec-runtime.json');
        expect(JSON.parse(captured[0].content)).toEqual({ portOffset: report.portOffset, port: report.port });
    });

    it('is deterministic per slug and gives distinct slugs distinct offsets', () => {
        const config = { portRangeStart: 4000, portRangeSize: 1000 };
        const a1 = stamp_runtime_isolation({ worktreePath: '/a', slug: 'checkout', config, writeFile: () => {} });
        const a2 = stamp_runtime_isolation({ worktreePath: '/a', slug: 'checkout', config, writeFile: () => {} });
        const b = stamp_runtime_isolation({ worktreePath: '/b', slug: 'payments', config, writeFile: () => {} });
        expect(a1.portOffset).toBe(a2.portOffset);
        expect(a1.portOffset).not.toBe(b.portOffset);
    });

    it('writes the fixture to disk with the default writer', () => {
        const dir = mkdtempSync(join(tmpdir(), 'suspec-stamp-'));
        try {
            const report = stamp_runtime_isolation({
                worktreePath: dir,
                slug: 'checkout',
                config: { portRangeStart: 5000, portRangeSize: 50 },
            });
            const stampPath = join(dir, '.suspec-runtime.json');
            expect(existsSync(stampPath)).toBe(true);
            expect(JSON.parse(readFileSync(stampPath, 'utf8'))).toEqual({
                portOffset: report.portOffset,
                port: report.port,
            });
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
