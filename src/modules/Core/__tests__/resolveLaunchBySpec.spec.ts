import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { isErr } from '../../../infra/errors/result.ts';
import { resolve_launch_by_spec } from '../useCases/resolveLaunchBySpec.ts';

// SPEC-suspec-cli-work AC-001/005/009: spec-first, task-less resolution + adapter resolution.
const SPEC = `---\ntype: spec\nid: SPEC-auth\nstatus: ready\n---\n\n## Requirements\n\n### AC-001 — x\nDo it.\nVerify with: a test.\n`;
const CONFIG = `agents:\n  default: stub\n  stub:\n    command: /bin/echo\n    startup_instruction: "x"\n`;

let ws: string;
function build(opts: { withConfig?: boolean } = {}): void {
    mkdirSync(join(ws, 'specs', 'auth'), { recursive: true });
    writeFileSync(join(ws, 'specs', 'auth', 'spec.md'), SPEC);
    if (opts.withConfig !== false) {
        mkdirSync(join(ws, '.suspec'), { recursive: true });
        writeFileSync(join(ws, '.suspec', 'config.yaml'), CONFIG);
    }
}
beforeEach(() => {
    ws = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-rlbs-')));
});
afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
});

describe('resolve_launch_by_spec', () => {
    it('resolves a spec by frontmatter id → id/slug/path + adapter', () => {
        build();
        const result = resolve_launch_by_spec({ workspaceDir: ws, repoRoot: ws, spec: 'SPEC-auth' });
        expect(isErr(result)).toBe(false);
        if (!isErr(result)) {
            expect(result.value.spec).toBe('SPEC-auth');
            expect(result.value.specSlug).toBe('auth');
            expect(result.value.specPath).toBe(join(ws, 'specs', 'auth', 'spec.md'));
            expect(result.value.source).toBe('SPEC-auth');
            expect(result.value.adapter.name).toBe('stub');
        }
    });

    it('resolves a spec by its dir slug', () => {
        build();
        const result = resolve_launch_by_spec({ workspaceDir: ws, repoRoot: ws, spec: 'auth' });
        expect(isErr(result)).toBe(false);
        if (!isErr(result)) {
            expect(result.value.spec).toBe('SPEC-auth');
        }
    });

    it('errors on an unresolvable spec, a missing config, and an unknown adapter', () => {
        build();
        expect(isErr(resolve_launch_by_spec({ workspaceDir: ws, repoRoot: ws, spec: 'SPEC-nope' }))).toBe(true);
        expect(isErr(resolve_launch_by_spec({ workspaceDir: ws, repoRoot: ws, spec: 'SPEC-auth', agent: 'nope' }))).toBe(
            true
        );
        rmSync(join(ws, '.suspec'), { recursive: true, force: true });
        expect(isErr(resolve_launch_by_spec({ workspaceDir: ws, repoRoot: ws, spec: 'SPEC-auth' }))).toBe(true);
    });

    it('resolves a spec by slug even when the spec.md has no frontmatter id (falls back to the slug)', () => {
        mkdirSync(join(ws, 'specs', 'noid'), { recursive: true });
        writeFileSync(join(ws, 'specs', 'noid', 'spec.md'), `---\ntype: spec\nstatus: ready\n---\n\n## Requirements\n`);
        mkdirSync(join(ws, '.suspec'), { recursive: true });
        writeFileSync(join(ws, '.suspec', 'config.yaml'), CONFIG);
        const result = resolve_launch_by_spec({ workspaceDir: ws, repoRoot: ws, spec: 'noid' });
        expect(isErr(result)).toBe(false);
        if (!isErr(result)) {
            expect(result.value.spec).toBe('noid');
        }
    });

    it('errors cleanly when .suspec/config.yaml is unreadable (a directory)', () => {
        build({ withConfig: false });
        mkdirSync(join(ws, '.suspec', 'config.yaml'), { recursive: true });
        const result = resolve_launch_by_spec({ workspaceDir: ws, repoRoot: ws, spec: 'SPEC-auth' });
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
            expect(result.error.message).toMatch(/cannot read \.suspec\/config\.yaml/);
        }
    });
});
