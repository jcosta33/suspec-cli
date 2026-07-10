import { describe, it, expect, vi } from 'vitest';

import { print_usage } from '../usage.ts';
import { COMMAND_CATALOG } from '../catalog.ts';

describe('print_usage — the catalog-driven usage reference', () => {
    it('renders every catalog usage line, the check invocations, and the global flags', () => {
        const out: string[] = [];
        const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            out.push(String(chunk));
            return true;
        });
        try {
            print_usage();
        } finally {
            spy.mockRestore();
        }
        const text = out.join('');
        expect(text).toContain('suspec check <artifact>');
        expect(text).toContain('--spec <spec-path>');
        expect(text).toContain('--contract');
        expect(text).toContain('--version');
        for (const entry of COMMAND_CATALOG) {
            for (const line of entry.usage) {
                if (line.trim().length > 0) {
                    expect(text).toContain(line);
                }
            }
        }
    });
});
