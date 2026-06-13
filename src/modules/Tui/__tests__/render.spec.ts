import { describe, it, expect } from 'vitest';

import {
    format_verdict,
    format_check_report,
    format_workspace_report,
    format_board,
    format_worktrees,
    format_init_report,
} from '../services/render.ts';

describe('format_verdict', () => {
    it('labels each level', () => {
        expect(format_verdict('clean')).toContain('clean');
        expect(format_verdict('warning')).toContain('warning');
        expect(format_verdict('blocking')).toContain('blocking');
    });
});

describe('format_check_report', () => {
    it('shows just the head when clean', () => {
        const out = format_check_report({ path: 'specs/x/spec.md', level: 'clean', diagnostics: [] });
        expect(out).toContain('specs/x/spec.md');
        expect(out).toContain('0 errors, 0 warnings');
        expect(out).not.toContain('✗');
    });

    it('lists each diagnostic with code, message and line', () => {
        const out = format_check_report({
            path: 'spec.md',
            level: 'blocking',
            diagnostics: [
                { code: 'C003', severity: 'hard-error', message: 'no Verify line', line: 12 },
                { code: 'C006', severity: 'warning', message: 'no Open questions', line: null },
            ],
        });
        expect(out).toContain('1 errors, 1 warnings');
        expect(out).toContain('C003');
        expect(out).toContain('no Verify line');
        expect(out).toContain(':12');
        expect(out).toContain('C006');
    });
});

describe('format_workspace_report', () => {
    it('renders a clean and a blocking workspace with findings', () => {
        expect(
            format_workspace_report({ verdict: 'clean', specs: [{ path: 'a', level: 'clean' }], workspaceFindings: [] })
        ).toContain('clean');
        const blocking = format_workspace_report({
            verdict: 'blocking',
            specs: [{ path: 'b', level: 'blocking' }],
            workspaceFindings: [{ code: 'placeholder', message: 'unfilled' }],
        });
        expect(blocking).toContain('blocking');
        expect(blocking).toContain('placeholder');
    });
});

describe('format_board', () => {
    it('renders specs, tasks, awaiting-review and needs-human', () => {
        const out = format_board({
            specs: [
                {
                    id: 'SPEC-x',
                    status: 'ready',
                    tasks: [
                        { id: 'T1', status: 'review-ready', hasReview: true, reviewStatus: 'needs-human' },
                        { id: 'T2', status: 'review-ready', hasReview: false, reviewStatus: null },
                        { id: 'T3', status: 'closed', hasReview: true, reviewStatus: null },
                    ],
                },
            ],
            tasksWithoutReview: ['T2'],
            needsHuman: ['T1'],
        });
        expect(out).toContain('SPEC-x');
        expect(out).toContain('T1');
        expect(out).toContain('Awaiting review: T2');
        expect(out).toContain('Needs human: T1');
    });

    it('renders a placeholder when empty', () => {
        expect(format_board({ specs: [], tasksWithoutReview: [], needsHuman: [] })).toContain('no specs yet');
    });
});

describe('format_worktrees', () => {
    it('renders entries and an empty placeholder', () => {
        expect(format_worktrees([])).toContain('no swarm worktrees');
        const out = format_worktrees([
            { branch: 'swarm/x', path: '/wt/x', dirty: false },
            { branch: 'swarm/y', path: '/wt/y', dirty: true },
        ]);
        expect(out).toContain('swarm/x');
        expect(out).toContain('clean');
        expect(out).toContain('dirty');
    });
});

describe('format_init_report', () => {
    it('lists only the non-empty buckets', () => {
        const out = format_init_report({
            mode: 'workspace',
            written: ['AGENTS.md'],
            skipped: ['README.md'],
            merged: ['.gitignore'],
            backedUp: [],
            overwritten: [],
        });
        expect(out).toContain('init (workspace)');
        expect(out).toContain('written: AGENTS.md');
        expect(out).toContain('skipped: README.md');
        expect(out).toContain('merged: .gitignore');
        expect(out).not.toContain('backed up');
        expect(out).not.toContain('overwritten');
    });
});
