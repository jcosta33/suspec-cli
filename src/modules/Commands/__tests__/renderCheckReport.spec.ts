import { describe, it, expect } from 'vitest';

import { format_check_report, format_verdict } from '../services/renderCheckReport.ts';

describe('format_verdict', () => {
    it('renders the three outcome levels', () => {
        expect(format_verdict('clean')).toContain('clean');
        expect(format_verdict('warning')).toContain('warning');
        expect(format_verdict('blocking')).toContain('blocking');
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
                { code: 'C005', severity: 'warning', message: 'no Non-goals', line: null },
            ],
        });
        expect(text).toContain('1 errors, 1 warnings');
        expect(text).toContain('C003');
        expect(text).toContain(':12');
        expect(text).toContain('C005');
        expect(text).toContain('no Non-goals');
    });
});
