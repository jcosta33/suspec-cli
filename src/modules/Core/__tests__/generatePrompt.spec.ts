import { describe, it, expect } from 'vitest';

import { generate_prompt } from '../services/generatePrompt.ts';

// SPEC-suspec-cli-work AC-004: the launch prompt is a LEAN POINTER — it names the spec (and task, if
// any) and the paths to read, and inlines no spec body. Pure (input → string).
describe('generate_prompt', () => {
    it('names the spec + its path and states the review anchors on the spec', () => {
        const prompt = generate_prompt({ specId: 'SPEC-auth', specPath: 'specs/auth/spec.md', adapterName: 'claude' });
        expect(prompt).toContain('Suspec spec SPEC-auth');
        expect(prompt).toContain('the spec at specs/auth/spec.md');
        expect(prompt).toContain('The review anchors on the spec');
    });

    it('is a pointer, not a plan — it invents no requirements or summaries', () => {
        const prompt = generate_prompt({ specId: 'SPEC-auth', specPath: 'specs/auth/spec.md', adapterName: 'claude' });
        // A lean pointer references no fabricated ACs and includes no spec body content.
        expect(prompt).not.toMatch(/AC-\d/);
    });

    it('adds the task pointer only when a task is given', () => {
        const without = generate_prompt({ specId: 'S', specPath: 'p', adapterName: 'a' });
        expect(without).not.toMatch(/task packet/);
        const withTask = generate_prompt({
            specId: 'S',
            specPath: 'p',
            taskId: 'TASK-x',
            taskPath: 'tasks/TASK-x.md',
            adapterName: 'a',
        });
        expect(withTask).toContain('task packet TASK-x at tasks/TASK-x.md');
    });
});
