import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { emit_agents } from '../useCases/emitAgents.ts';
import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';

let src: string;
let target: string;

function agentDef(name: string, tools: string): string {
    return `---\nname: ${name}\ndescription: >-\n  Do the ${name} job, read-only.\ntools: ${tools}\n---\n\n# ${name}\n\nBody of ${name}.\n`;
}

beforeEach(() => {
    src = mkdtempSync(join(tmpdir(), 'swarm-agents-src-'));
    target = mkdtempSync(join(tmpdir(), 'swarm-agents-tgt-'));
    writeFileSync(join(src, 'swarm-reviewer.md'), agentDef('swarm-reviewer', 'Read, Grep, Glob, Bash'));
    writeFileSync(join(src, 'swarm-explorer.md'), agentDef('swarm-explorer', 'Read, Grep, Glob'));
    writeFileSync(join(src, 'README.md'), '# the catalog readme — NOT an agent def\n'); // must be ignored
    writeFileSync(join(src, 'notes.md'), '# a stray doc with no frontmatter\n'); // not a def → skipped
});
afterEach(() => {
    rmSync(src, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
});

describe('emit_agents (swarm agents emit --codex, ADR-0098)', () => {
    it('emits one .codex/agents/<name>.toml per agent def, ignoring README + non-defs', () => {
        const report = assertOk(emit_agents({ sourceDir: src, targetDir: target, overwrite: false }));
        expect(report.written.sort()).toEqual(['swarm-explorer.toml', 'swarm-reviewer.toml']);
        expect(report.level).toBe('clean');
        const toml = readFileSync(join(target, '.codex', 'agents', 'swarm-reviewer.toml'), 'utf8');
        expect(toml).toContain('developer_instructions = """');
        expect(toml).toContain('Body of swarm-reviewer.');
        expect(toml).toContain('Read, Grep, Glob, Bash'); // tools named in the honesty header
        // README.md / notes.md produced no .toml
        expect(existsSync(join(target, '.codex', 'agents', 'README.toml'))).toBe(false);
    });

    it('no-clobber by default: an existing .toml is skipped (warning); --force overwrites', () => {
        assertOk(emit_agents({ sourceDir: src, targetDir: target, overwrite: false }));
        // tamper with one, re-emit without force → it is kept (skipped), level warning
        const reviewerPath = join(target, '.codex', 'agents', 'swarm-reviewer.toml');
        writeFileSync(reviewerPath, 'HAND EDIT\n');
        const second = assertOk(emit_agents({ sourceDir: src, targetDir: target, overwrite: false }));
        expect(second.skipped).toContain('swarm-reviewer.toml');
        expect(second.level).toBe('warning');
        expect(readFileSync(reviewerPath, 'utf8')).toBe('HAND EDIT\n'); // untouched
        // --force regenerates over the hand edit
        const third = assertOk(emit_agents({ sourceDir: src, targetDir: target, overwrite: true }));
        expect(third.written).toContain('swarm-reviewer.toml');
        expect(readFileSync(reviewerPath, 'utf8')).toContain('developer_instructions'); // regenerated
    });

    it('a missing source dir → Err (names --from), never a silent empty emit', () => {
        assertErr(emit_agents({ sourceDir: join(src, 'nope'), targetDir: target, overwrite: false }));
    });

    it('a source dir with no agent defs → Err (nothing to emit)', () => {
        const empty = mkdtempSync(join(tmpdir(), 'swarm-agents-empty-'));
        writeFileSync(join(empty, 'README.md'), '# only a readme\n');
        try {
            assertErr(emit_agents({ sourceDir: empty, targetDir: target, overwrite: false }));
        } finally {
            rmSync(empty, { recursive: true, force: true });
        }
    });
});
