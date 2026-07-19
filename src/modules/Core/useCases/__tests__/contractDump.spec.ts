import { describe, it, expect } from 'vitest';

import { contract_dump } from '../contractDump.ts';
import { CONTRACT_VERSION, CORE_CHECKS } from '../../services/checksContract.ts';

describe('contract_dump — the `--contract` projection', () => {
    it('carries the pinned contract version and the full core-check table', () => {
        const dump = contract_dump();
        expect(dump.version).toBe(CONTRACT_VERSION);
        expect(dump.checks).toHaveLength(CORE_CHECKS.length);
        expect(dump.checks.map((check) => check.id)).toEqual(CORE_CHECKS.map((check) => check.id));
    });

    it('is plain JSON-serializable data (id / name / severity per row)', () => {
        const roundTripped = JSON.parse(JSON.stringify(contract_dump())) as ReturnType<typeof contract_dump>;
        expect(roundTripped).toEqual(contract_dump());
        for (const check of roundTripped.checks) {
            expect(check.id).toMatch(/^C\d{3}$/);
            expect(check.name.length).toBeGreaterThan(0);
            expect(['hard-error', 'warning']).toContain(check.severity);
        }
    });

    it('projects the current review contract without reusing retired IDs', () => {
        const dump = contract_dump();
        expect(dump.version).toBe('0.23.0');
        expect(dump.checks.map((check) => check.id)).not.toContain('C005');
        expect(dump.checks.map((check) => check.id)).not.toContain('C006');
        expect(dump.checks.find((check) => check.id === 'C016')?.name).toBe('supported-needs-evidence');
    });
});
