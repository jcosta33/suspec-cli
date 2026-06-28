import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

// A retired redirect stub: same shape, plus `status: retired` in the frontmatter.
function retiredAgentDef(name: string, tools: string): string {
    return `---\nname: ${name}\nstatus: retired\ndescription: >-\n  Retired — do NOT install ${name}.\ntools: ${tools}\n---\n\n# ${name}\n\nThis stub only redirects inbound refs.\n`;
}

beforeEach(() => {
    src = mkdtempSync(join(tmpdir(), 'corpus-agents-src-'));
    target = mkdtempSync(join(tmpdir(), 'corpus-agents-tgt-'));
    writeFileSync(join(src, 'corpus-reviewer.md'), agentDef('corpus-reviewer', 'Read, Grep, Glob, Bash'));
    writeFileSync(join(src, 'corpus-explorer.md'), agentDef('corpus-explorer', 'Read, Grep, Glob'));
    writeFileSync(join(src, 'README.md'), '# the catalog readme — NOT an agent def\n'); // must be ignored
    writeFileSync(join(src, 'notes.md'), '# a stray doc with no frontmatter\n'); // not a def → skipped
});
afterEach(() => {
    rmSync(src, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
});

describe('emit_agents (corpus agents emit --codex, ADR-0098)', () => {
    it('emits one .codex/agents/<name>.toml per agent def, ignoring README + non-defs', () => {
        const report = assertOk(emit_agents({ sourceDir: src, targetDir: target, overwrite: false }));
        expect(report.written.sort()).toEqual(['corpus-explorer.toml', 'corpus-reviewer.toml']);
        expect(report.level).toBe('clean');
        const toml = readFileSync(join(target, '.codex', 'agents', 'corpus-reviewer.toml'), 'utf8');
        expect(toml).toContain('developer_instructions = """');
        expect(toml).toContain('Body of corpus-reviewer.');
        expect(toml).toContain('Read, Grep, Glob, Bash'); // tools named in the honesty header
        // README.md / notes.md produced no .toml
        expect(existsSync(join(target, '.codex', 'agents', 'README.toml'))).toBe(false);
    });

    it('no-clobber by default: an existing .toml is skipped (warning); --force overwrites', () => {
        assertOk(emit_agents({ sourceDir: src, targetDir: target, overwrite: false }));
        // tamper with one, re-emit without force → it is kept (skipped), level warning
        const reviewerPath = join(target, '.codex', 'agents', 'corpus-reviewer.toml');
        writeFileSync(reviewerPath, 'HAND EDIT\n');
        const second = assertOk(emit_agents({ sourceDir: src, targetDir: target, overwrite: false }));
        expect(second.skipped).toContain('corpus-reviewer.toml');
        expect(second.level).toBe('warning');
        expect(readFileSync(reviewerPath, 'utf8')).toBe('HAND EDIT\n'); // untouched
        // --force regenerates over the hand edit
        const third = assertOk(emit_agents({ sourceDir: src, targetDir: target, overwrite: true }));
        expect(third.written).toContain('corpus-reviewer.toml');
        expect(readFileSync(reviewerPath, 'utf8')).toContain('developer_instructions'); // regenerated
    });

    it('a missing source dir → Err (names --from), never a silent empty emit', () => {
        assertErr(emit_agents({ sourceDir: join(src, 'nope'), targetDir: target, overwrite: false }));
    });

    it('a source dir with no agent defs → Err (nothing to emit)', () => {
        const empty = mkdtempSync(join(tmpdir(), 'corpus-agents-empty-'));
        writeFileSync(join(empty, 'README.md'), '# only a readme\n');
        try {
            assertErr(emit_agents({ sourceDir: empty, targetDir: target, overwrite: false }));
        } finally {
            rmSync(empty, { recursive: true, force: true });
        }
    });

    it('SKIPS a `status: retired` redirect stub (no .toml), logging the intentional drop; others still emit', () => {
        // the retired stub mirrors corpus-evidence-checker: kept for inbound-ref resolution, must NOT
        // be projected into Codex as an installable agent (its own body says "do not install").
        writeFileSync(join(src, 'corpus-evidence-checker.md'), retiredAgentDef('corpus-evidence-checker', 'Read, Bash'));
        const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const report = assertOk(emit_agents({ sourceDir: src, targetDir: target, overwrite: false }));
            // the two normal agents still emit; the retired stub does not appear in `written`
            expect(report.written.sort()).toEqual(['corpus-explorer.toml', 'corpus-reviewer.toml']);
            expect(report.retired).toEqual(['corpus-evidence-checker.toml']);
            // NO toml on disk for the retired stub; the normal one is present
            expect(existsSync(join(target, '.codex', 'agents', 'corpus-evidence-checker.toml'))).toBe(false);
            expect(existsSync(join(target, '.codex', 'agents', 'corpus-reviewer.toml'))).toBe(true);
            // the intentional skip is logged (unlike the quiet non-def skip)
            expect(logSpy).toHaveBeenCalledWith('skipped corpus-evidence-checker (status: retired)');
        } finally {
            logSpy.mockRestore();
        }
    });

    it('a normal agent (no status) emits as before — proven against the retired path', () => {
        // corpus-reviewer carries no `status:` → still projected to an installable toml
        const report = assertOk(emit_agents({ sourceDir: src, targetDir: target, overwrite: false }));
        expect(report.written).toContain('corpus-reviewer.toml');
        expect(report.retired).toEqual([]);
        expect(existsSync(join(target, '.codex', 'agents', 'corpus-reviewer.toml'))).toBe(true);
    });
});
