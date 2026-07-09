import { describe, it, expect } from 'vitest';

import { generate_prompt } from '../services/generatePrompt.ts';

// SPEC-suspec-v2 AC-006: the launch prompt POINTS INTO THE STORE — the driving spec and the run
// file by ABSOLUTE path, an instruction to read the spec and append to the run file directly, no
// copied spec body, and no other artifact path. Pure (input → string).
describe('generate_prompt (AC-006)', () => {
    const input = {
        specId: 'SPEC-auth',
        specPath: '/home/dev/.claude/state/proj/spec-auth.md',
        runPath: '/home/dev/.claude/state/proj/run-auth.md',
    };

    it('contains the absolute store paths of BOTH the spec and the run file', () => {
        const prompt = generate_prompt(input);
        expect(prompt).toContain('Suspec spec SPEC-auth');
        expect(prompt).toContain('the spec at /home/dev/.claude/state/proj/spec-auth.md');
        expect(prompt).toContain('Your run file is /home/dev/.claude/state/proj/run-auth.md');
    });

    it('instructs the agent to read the spec and append run/evidence notes to the run file directly', () => {
        const prompt = generate_prompt(input);
        expect(prompt).toMatch(/append your run and evidence notes to it directly/);
        expect(prompt).toMatch(/read it where it is/);
    });

    it('copies no spec body and references no other artifact — only the two store paths appear', () => {
        const prompt = generate_prompt(input);
        // A pointer, not a plan: no fabricated ACs, no spec body content.
        expect(prompt).not.toMatch(/AC-\d/);
        // No other store artifact auto-loads: the only store paths in the prompt are the spec + run file.
        const storePaths = prompt.match(/\/home\/dev\/\.claude\/state\/proj\/[^\s]+/g) ?? [];
        expect([...new Set(storePaths)].sort()).toEqual([
            '/home/dev/.claude/state/proj/run-auth.md',
            '/home/dev/.claude/state/proj/spec-auth.md',
        ]);
        expect(prompt).not.toMatch(/review-|finding-|intake-|task packet/);
    });
});
