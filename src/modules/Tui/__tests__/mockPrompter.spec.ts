import { describe, it, expect } from 'vitest';

import { create_mock_prompter } from '../testing/mockPrompter.ts';
import { CANCEL, is_cancelled } from '../useCases/prompter.ts';

describe('create_mock_prompter', () => {
    it('records the human-facing calls', () => {
        const p = create_mock_prompter();
        p.intro('Swarm');
        p.note('hello', 'Title');
        p.info('i');
        p.success('s');
        p.warn('w');
        p.error('e');
        p.outro('bye');
        const s = p.spinner();
        s.start('working');
        s.message('still working');
        s.stop('done');
        expect(p.calls.intros).toEqual(['Swarm']);
        expect(p.calls.notes).toEqual([{ message: 'hello', title: 'Title' }]);
        expect(p.calls.infos).toEqual(['i']);
        expect(p.calls.successes).toEqual(['s']);
        expect(p.calls.warns).toEqual(['w']);
        expect(p.calls.errors).toEqual(['e']);
        expect(p.calls.outros).toEqual(['bye']);
        expect(p.calls.spinnerMessages).toEqual(['working', 'still working', 'done']);
    });

    it('answers prompts from the script in order', async () => {
        const p = create_mock_prompter({
            select: ['check'],
            multiselect: [['AC-001', 'AC-002']],
            confirm: [true],
            text: ['my-slug'],
        });
        expect(await p.select({ message: 'pick', options: [] })).toBe('check');
        expect(await p.multiselect({ message: 'scope', options: [] })).toEqual(['AC-001', 'AC-002']);
        expect(await p.confirm({ message: 'ok?' })).toBe(true);
        expect(await p.text({ message: 'slug?' })).toBe('my-slug');
    });

    it('returns a scripted CANCEL and is detected by is_cancelled', async () => {
        const p = create_mock_prompter({ select: [CANCEL] });
        const result = await p.select({ message: 'pick', options: [] });
        expect(is_cancelled(result)).toBe(true);
    });

    it('throws when a prompt is under-scripted', async () => {
        const p = create_mock_prompter();
        await expect(p.confirm({ message: 'ok?' })).rejects.toThrow('no scripted answer');
    });
});
