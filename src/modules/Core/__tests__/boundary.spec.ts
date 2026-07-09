import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

// AC-003 / AC-014 — the reconcile-only boundary: no Core module may reach an agent-launch or model
// path. This guard reads every Core source file and asserts it imports none of the agent surfaces
// and names no agent CLI. If a future change wires an agent into Core, this test fails loudly.

const coreDir = fileURLToPath(new URL('..', import.meta.url));

function core_source_files(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (entry !== '__tests__') {
                out.push(...core_source_files(full));
            }
        } else if (entry.endsWith('.ts')) {
            out.push(full);
        }
    }
    return out;
}

// The v2-realistic agent-loop surfaces (the v1 Adapters/AgentState/infra-events paths this list
// used to name no longer exist — a tripwire over ghost paths guards nothing). Today the loop-shaped
// code lives in Workspace's SPAWN edges and the shells above Core:
//   - launchRunner / runnerAdapters' spawn side / captureCommand — launching a runner session or
//     running a command is the one thing Core never does itself; those edges arrive INJECTED
//     (addEvidence's EvidenceCapture, promote's IssueCreator, work's launch wiring). Both the
//     deep-path form and the symbol names are matched, because Core legitimately imports the
//     Workspace BARREL (worktree/git reads) — the barrel also re-exports the spawn symbols, so a
//     path-only match would let `import { launch_runner } from '…Workspace/useCases/index.ts'` by.
//   - Commands / Tui module paths — importing a command wrapper or the interactive flows would
//     invert the layering and hand the engine a dispatch/prompt surface.
const FORBIDDEN_IMPORTS = [
    /Workspace\/useCases\/(?:launchRunner|runnerAdapters|captureCommand)/,
    /\b(?:launch_runner|capture_command)\b/,
    /modules\/Commands\//,
    /modules\/Tui\//,
];
// Dot-prefixed occurrences of an agent CLI name are exempt ONLY in the dotdir-path shape — the
// personal store defaults to `~/.claude/state` (SPEC-suspec-v2 AC-001), so Core legitimately names
// `'.claude'` / `~/.claude/...` as quoted path literals. The lookbehind requires the dot to be
// preceded by a quote, backtick, `~`, or `/` (the ways a dotdir is spelled); a bare agent CLI name
// AND a mere property access (`adapters.claude`) both still fail this guard.
const AGENT_CLI_NAMES = /(?<!['"`~/]\.)\b(?:claude|codex|gemini|kimi|droid|opencode|aider)\b/;

// An import surface is any line that pulls symbols in OR re-exports them: `import … from`,
// `export … from` (a re-export smuggles the same dependency), and `require(…)`.
function import_lines(text: string): string {
    return text
        .split('\n')
        .filter((line) => /\bimport\b|\bexport\b.*\bfrom\b|\brequire\s*\(/.test(line))
        .join('\n');
}

describe('the reconcile-only Core boundary', () => {
    const files = core_source_files(coreDir);

    it('finds the Core source files to check', () => {
        expect(files.length).toBeGreaterThan(10);
    });

    it('no Core module imports (or re-exports) an agent-launch / spawn / shell path', () => {
        for (const file of files) {
            const lines = import_lines(readFileSync(file, 'utf8'));
            for (const pattern of FORBIDDEN_IMPORTS) {
                expect(lines, `${file} must not import ${pattern}`).not.toMatch(pattern);
            }
        }
    });

    it('no Core module names an agent CLI', () => {
        for (const file of files) {
            expect(readFileSync(file, 'utf8'), `${file} must not reference an agent CLI`).not.toMatch(AGENT_CLI_NAMES);
        }
    });
});
