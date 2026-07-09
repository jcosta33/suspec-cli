import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { risk_path_nudge } from '../useCases/riskPathNudge.ts';

// SPEC-suspec-v2 AC-022: the shared config-reading hook `check-my-work` and `done` wire — one
// advisory line on a risk_paths match, silence on every miss (no config, malformed config, no
// match). Never an error.

let repo: string;

beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'suspec-nudge-'));
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('risk_path_nudge', () => {
    it('returns the advisory line when the changed files touch a declared glob', () => {
        writeFileSync(join(repo, 'suspec.config.json'), JSON.stringify({ risk_paths: ['src/auth/**'] }));
        const nudge = risk_path_nudge(repo, ['src/auth/token.ts', 'README.md']);
        expect(nudge).toContain('src/auth/token.ts');
        expect(nudge).not.toContain('README.md');
    });

    it('is silent when nothing matches', () => {
        writeFileSync(join(repo, 'suspec.config.json'), JSON.stringify({ risk_paths: ['src/auth/**'] }));
        expect(risk_path_nudge(repo, ['README.md'])).toBeNull();
    });

    it('is silent with no config file, and with a malformed one', () => {
        expect(risk_path_nudge(repo, ['src/auth/token.ts'])).toBeNull();
        writeFileSync(join(repo, 'suspec.config.json'), '{not json');
        expect(risk_path_nudge(repo, ['src/auth/token.ts'])).toBeNull();
    });
});
