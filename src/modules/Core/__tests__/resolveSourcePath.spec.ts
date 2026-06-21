import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { build_source_exists, infer_workspace_root } from '../useCases/resolveSourcePath.ts';

let ws: string;
beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'swarm-src-'));
    mkdirSync(join(ws, 'specs', 'demo'), { recursive: true });
    mkdirSync(join(ws, 'intake'), { recursive: true });
    writeFileSync(join(ws, 'specs', 'demo', 'spec.md'), '---\n---\n');
    writeFileSync(join(ws, 'specs', 'demo', 'ticket.md'), 'co-located\n'); // beside the spec
    writeFileSync(join(ws, 'intake', 'sup-204.md'), 'root intake\n'); // at the workspace root
});
afterEach(() => rmSync(ws, { recursive: true, force: true }));

describe('build_source_exists — C009 resolves spec-dir OR workspace-root', () => {
    it('resolves a root-relative ref (intake/x.md) AND a co-located ref (ticket.md)', () => {
        const exists = build_source_exists(join(ws, 'specs', 'demo', 'spec.md'), ws);
        expect(exists('intake/sup-204.md')).toBe(true); // resolves at the workspace root
        expect(exists('ticket.md')).toBe(true); // resolves beside the spec
        expect(exists('intake/nope.md')).toBe(false); // exists under neither → broken
        expect(exists('../../intake/sup-204.md')).toBe(true); // the old workaround still works
    });
});

describe('infer_workspace_root — the parent of the nearest `specs/` dir', () => {
    it('returns the workspace root (parent of specs/) for a spec under specs/<feature>/', () => {
        expect(infer_workspace_root(join(ws, 'specs', 'demo', 'spec.md'), '/some/cwd')).toBe(ws);
    });

    it('does NOT overshoot to an ancestor that merely looks like a workspace', () => {
        // A workspace nested inside an outer dir (e.g. another swarm repo) — the inference must stop at
        // THIS workspace's `specs/` parent, not climb to the outer dir. Keyed on `specs/`, not a marker.
        const outer = mkdtempSync(join(tmpdir(), 'swarm-outer-'));
        try {
            const inner = join(outer, 'nested-workspace');
            mkdirSync(join(inner, 'specs', 'feat'), { recursive: true });
            expect(infer_workspace_root(join(inner, 'specs', 'feat', 'spec.md'), outer)).toBe(inner);
        } finally {
            rmSync(outer, { recursive: true, force: true });
        }
    });

    it('falls back to the cwd when the spec is not under a specs/ dir', () => {
        expect(infer_workspace_root(join(ws, 'loose', 'spec.md'), ws)).toBe(ws);
    });
});
