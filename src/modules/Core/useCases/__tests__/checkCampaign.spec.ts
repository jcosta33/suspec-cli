import { describe, expect, it } from 'vitest';

import { check_campaign } from '../checkCampaign.ts';

const CAMPAIGN = `---
type: campaign
id: CAMPAIGN-demo
status: ready
ledger: ./ledger.md
sources:
  - ./spec.md
---

# Demo

## Objective

Finish the governed delivery.

## Completion contract

- Every obligation is verified on current main.

## Authorities

- Requirements: ./spec.md
- Progress: ./ledger.md

## Operating loop

Read, reconcile, select, execute, verify, record, and repeat.

## Stops

Stop at completion or a named human decision.
`;

function codes(source: string, exists: (ref: string) => boolean = () => true): string[] {
    const result = check_campaign(source, 'campaign.md', exists);
    if (!result.ok) throw result.error;
    return result.value.diagnostics.map((diagnostic) => diagnostic.code);
}

describe('check_campaign', () => {
    it('accepts a complete restartable campaign shell', () => {
        const result = check_campaign(CAMPAIGN, 'campaign.md', () => true);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toMatchObject({ type: 'campaign', level: 'clean', diagnostics: [] });
    });

    it('C029 rejects identity, status, authority, and section shape defects', () => {
        const malformed = CAMPAIGN.replace('id: CAMPAIGN-demo', 'id: ""')
            .replace('status: ready', 'status: done')
            .replace('ledger: ./ledger.md', 'ledger: ""')
            .replace('sources:\n  - ./spec.md', 'sources: []')
            .replace('## Objective\n\nFinish the governed delivery.', '## Objective\n\n## Objective\n\nDuplicate.')
            .replace('## Stops\n\nStop at completion or a named human decision.\n', '');
        expect(codes(malformed)).toEqual(['C029', 'C029', 'C029', 'C029', 'C029', 'C029']);
    });

    it('rejects campaign frontmatter field-shape mismatches as parse failures', () => {
        const result = check_campaign(
            CAMPAIGN.replace('ledger: ./ledger.md', 'ledger: [./ledger.md]'),
            'x.md',
            () => true
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.message).toContain('`ledger:` must be a scalar');
    });

    it('rejects scalar campaign sources as a parse failure', () => {
        const result = check_campaign(
            CAMPAIGN.replace('sources:\n  - ./spec.md', 'sources: ./spec.md'),
            'x.md',
            () => true
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.message).toContain('`sources:` must be a list');
    });

    it('C029 rejects the wrong artifact type and empty required sections', () => {
        const malformed = CAMPAIGN.replace('type: campaign', 'type: audit').replace(
            '## Objective\n\nFinish the governed delivery.',
            '## Objective\n\n'
        );
        expect(codes(malformed)).toEqual(['C029', 'C029']);
    });

    it('C030 rejects broken local authorities and copied task-list state', () => {
        const withCheckbox = CAMPAIGN.replace(
            '- Every obligation is verified on current main.',
            '- [ ] Every obligation is verified on current main.'
        );
        const result = check_campaign(withCheckbox, 'campaign.md', (ref) => ref === './spec.md');
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['C030', 'C030']);
            expect(result.value.diagnostics[1]?.line).not.toBeNull();
        }
    });

    it('C030 rejects an empty task-list checkbox', () => {
        const withCheckbox = CAMPAIGN.replace('Stop at completion or a named human decision.', '- [ ]');
        expect(codes(withCheckbox)).toContain('C030');
    });

    it('allows URL authorities and ignores examples inside fences', () => {
        const remote = CAMPAIGN.replace('ledger: ./ledger.md', 'ledger: https://example.test/issues/1')
            .replace('  - ./spec.md', '  - https://example.test/spec.md')
            .replace(
                'Stop at completion or a named human decision.',
                '```text\n- [ ] TODO\n```\n\nStop at completion.'
            );
        expect(codes(remote, () => false)).toEqual([]);
    });

    it('C031 rejects unresolved markers in ready campaigns but permits drafts', () => {
        const unresolved = CAMPAIGN.replace('Stop at completion or a named human decision.', '- TODO');
        expect(codes(unresolved)).toContain('C031');
        expect(codes(unresolved.replace('status: ready', 'status: draft'))).not.toContain('C031');
    });

    it('C031 rejects named blockers in ready campaigns', () => {
        const blocked = CAMPAIGN.replace(
            'Stop at completion or a named human decision.',
            '- Blocking: choose the release authority'
        );
        expect(codes(blocked)).toContain('C031');
    });
});
