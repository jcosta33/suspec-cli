import { describe, it, expect } from 'vitest';

import { format_check_report, format_level } from '../services/renderCheckReport.ts';

describe('format_level', () => {
    it('renders the three outcome levels', () => {
        expect(format_level('clean')).toContain('clean');
        expect(format_level('warning')).toContain('warning');
        expect(format_level('blocking')).toContain('blocking');
    });
});

describe('format_check_report', () => {
    it('a clean report is a single head line with zero counts', () => {
        const text = format_check_report({ path: 'spec.md', level: 'clean', diagnostics: [] });
        expect(text).toContain('spec.md');
        expect(text).toContain('0 errors, 0 warnings');
        expect(text.split('\n')).toHaveLength(1);
    });

    it('diagnostics render one line each, with the code, message, and line number when present', () => {
        const text = format_check_report({
            path: 'spec.md',
            level: 'blocking',
            diagnostics: [
                { code: 'C003', severity: 'hard-error', message: 'no Verify line', line: 12 },
                { code: 'C008', severity: 'warning', message: 'no sources', line: null },
            ],
        });
        expect(text).toContain('1 error, 1 warning');
        expect(text).toContain('C003');
        expect(text).toContain(':12');
        expect(text).toContain('C008');
        expect(text).toContain('no sources');
    });
});
