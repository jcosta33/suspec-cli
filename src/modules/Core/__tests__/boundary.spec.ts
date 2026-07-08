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

const FORBIDDEN_IMPORTS = [
    /modules\/Adapters/,
    /modules\/AgentState/,
    /Terminal\/useCases\/(terminal|llm)/,
    /infra\/events/,
    /infra\/store/,
];
// Dot-prefixed occurrences (`.claude`, `.codex`) are config/data DIRECTORY literals, not agent
// invocations — the personal store defaults to `~/.claude/state` (SPEC-suspec-v2 AC-001), so Core
// legitimately names that path. The lookbehind exempts exactly the dotdir form; a bare agent CLI
// name anywhere in Core still fails this guard.
const AGENT_CLI_NAMES = /(?<!\.)\b(?:claude|codex|gemini|kimi|droid|opencode|aider)\b/;

describe('the reconcile-only Core boundary', () => {
    const files = core_source_files(coreDir);

    it('finds the Core source files to check', () => {
        expect(files.length).toBeGreaterThan(10);
    });

    it('no Core module imports an agent-launch / model / event-store path', () => {
        for (const file of files) {
            const text = readFileSync(file, 'utf8');
            const importLines = text.split('\n').filter((line) => line.includes('import'));
            for (const pattern of FORBIDDEN_IMPORTS) {
                expect(importLines.join('\n'), `${file} must not import ${pattern}`).not.toMatch(pattern);
            }
        }
    });

    it('no Core module names an agent CLI', () => {
        for (const file of files) {
            expect(readFileSync(file, 'utf8'), `${file} must not reference an agent CLI`).not.toMatch(AGENT_CLI_NAMES);
        }
    });
});
