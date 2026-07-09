import { describe, it, expect } from 'vitest';

import { run_triage_flow } from '../useCases/triageFlow.ts';
import { create_mock_prompter } from '../testing/mockPrompter.ts';
import { CANCEL } from '../useCases/prompter.ts';

// SPEC-suspec-v2 AC-015: the triage prompt loop — one choice per finding; cancelling defers the
// rest (nothing is dropped). The flow collects; `done` applies.

const FINDINGS = [
    { filename: 'finding-001.md', title: 'Small one', severity: null },
    { filename: 'finding-002.md', title: 'Bad one', severity: 'critical' },
    { filename: 'finding-003.md', title: 'Meh', severity: 'minor' },
];

describe('run_triage_flow', () => {
    it('collects one decision per finding in order', async () => {
        const prompter = create_mock_prompter({ select: ['promote', 'keep', 'discard'] });
        const decisions = await run_triage_flow(prompter, FINDINGS);
        expect(decisions).toEqual([
            { filename: 'finding-001.md', action: 'promote' },
            { filename: 'finding-002.md', action: 'keep' },
            { filename: 'finding-003.md', action: 'discard' },
        ]);
        expect(prompter.calls.intros[0]).toContain('3 open finding(s)');
        expect(prompter.calls.outros).toHaveLength(1);
    });

    it('labels a critical finding\'s discard option with the --discard-critical requirement', async () => {
        const prompter = create_mock_prompter({ select: ['keep'] });
        await run_triage_flow(prompter, [FINDINGS[1]]);
        // The critical hint travels through the discard OPTION — assert the option text the
        // human is actually shown, not just the prompt message.
        expect(prompter.calls.selects).toHaveLength(1);
        expect(prompter.calls.selects[0].message).toContain('[critical]');
        const discard = prompter.calls.selects[0].options.find((option) => option.value === 'discard');
        expect(discard?.hint).toContain('--discard-critical');
        // A non-critical finding's discard option carries no such requirement.
        const plain = create_mock_prompter({ select: ['keep'] });
        await run_triage_flow(plain, [FINDINGS[2]]);
        const plainDiscard = plain.calls.selects[0].options.find((option) => option.value === 'discard');
        expect(plainDiscard?.hint).not.toContain('--discard-critical');
    });

    it('defers the cancelled finding AND every remaining one', async () => {
        const prompter = create_mock_prompter({ select: ['promote', CANCEL] });
        const decisions = await run_triage_flow(prompter, FINDINGS);
        expect(decisions).toEqual([
            { filename: 'finding-001.md', action: 'promote' },
            { filename: 'finding-002.md', action: 'defer' },
            { filename: 'finding-003.md', action: 'defer' },
        ]);
    });
});
