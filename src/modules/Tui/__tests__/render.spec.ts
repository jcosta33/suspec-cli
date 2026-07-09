import { describe, it, expect } from 'vitest';

import {
    format_verdict,
    format_check_report,
    format_store_lint,
    format_store_status,
    format_worktrees,
    format_seed_report,
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
        const out = format_check_report({ path: 'spec-x.md', level: 'clean', diagnostics: [] });
        expect(out).toContain('spec-x.md');
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

describe('format_store_lint (per-artifact facts, no verdict)', () => {
    it('renders the head counts and a ✓ line per clean artifact', () => {
        const out = format_store_lint({
            level: 'clean',
            artifacts: [
                { path: '/store/run-feat.md', diagnostics: [] },
                { path: '/store/spec-feat.md', diagnostics: [] },
            ],
        });
        expect(out).toContain('store lint');
        expect(out).toContain('2 artifact(s), 0 errors, 0 warnings');
        expect(out).toContain('run-feat.md');
        expect(out).toContain('spec-feat.md');
    });

    it('lists each diagnostic under its artifact with the check code', () => {
        const out = format_store_lint({
            level: 'blocking',
            artifacts: [
                {
                    path: '/store/evidence/feat/001.md',
                    diagnostics: [
                        { check: 'EV03', severity: 'hard-error', message: 'forged cli-verified claim' },
                        { check: 'EV02', severity: 'warning', message: 'no ac mapping' },
                    ],
                },
            ],
        });
        expect(out).toContain('1 artifact(s), 1 errors, 1 warnings');
        expect(out).toContain('EV03');
        expect(out).toContain('forged cli-verified claim');
        expect(out).toContain('EV02');
    });

    it('an empty store renders a placeholder line', () => {
        expect(format_store_lint({ level: 'clean', artifacts: [] })).toContain('no lintable artifacts');
    });
});

describe('format_store_status (the store summary — no board)', () => {
    it('renders the artifact rows with kind + age and the attention list', () => {
        const out = format_store_status({
            active: [
                { filename: 'spec-feat.md', kind: 'spec', ageDays: 2 },
                { filename: 'run-feat.md', kind: 'run', ageDays: 0 },
            ],
            archived: [{ filename: 'spec-old.md', kind: 'spec', ageDays: 40 }],
            next: [
                { rank: 3, detail: 'run feat finished but 1 AC lacks evidence', action: 'suspec evidence add feat' },
            ],
        });
        expect(out).toContain('2 active artifact(s), 1 archived');
        expect(out).toContain('spec-feat.md');
        expect(out).toContain('2d');
        expect(out).toContain('attention:');
        expect(out).toContain('run feat finished but 1 AC lacks evidence');
        expect(out).toContain('suspec evidence add feat');
    });

    it('an empty store points at the spec scaffold; no attention block when calm', () => {
        const out = format_store_status({ active: [], archived: [], next: [] });
        expect(out).toContain('suspec write spec');
        expect(out).not.toContain('attention:');
    });
});

describe('format_worktrees', () => {
    it('renders entries and an empty placeholder', () => {
        expect(format_worktrees([])).toContain('no suspec worktrees');
        const out = format_worktrees([
            { branch: 'suspec/x', path: '/wt/x', dirty: false },
            { branch: 'suspec/y', path: '/wt/y', dirty: true },
        ]);
        expect(out).toContain('suspec/x');
        expect(out).toContain('clean');
        expect(out).toContain('dirty');
    });
});

describe('format_seed_report (the init seed summary)', () => {
    it('lists only the non-empty buckets', () => {
        const out = format_seed_report({
            created: ['suspec.config.json', 'AGENTS.md'],
            updated: ['.gitignore'],
            kept: [],
        });
        expect(out).toContain('seeded this repo');
        expect(out).toContain('created: suspec.config.json, AGENTS.md');
        expect(out).toContain('updated: .gitignore');
        expect(out).not.toContain('kept');
    });

    it('a full no-op run reads as all kept', () => {
        const out = format_seed_report({ created: [], updated: [], kept: ['AGENTS.md', '.gitignore'] });
        expect(out).toContain('kept: AGENTS.md, .gitignore');
        expect(out).not.toContain('created:');
    });
});
