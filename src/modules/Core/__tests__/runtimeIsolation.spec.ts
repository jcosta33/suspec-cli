import { describe, it, expect } from 'vitest';

import { parse_runtime_isolation_config } from '../services/runtimeIsolation.ts';

describe('parse_runtime_isolation_config', () => {
    it('parses a valid runtimeIsolation block into a port range', () => {
        expect(
            parse_runtime_isolation_config({ runtimeIsolation: { portRangeStart: 4000, portRangeSize: 100 } })
        ).toEqual({
            portRangeStart: 4000,
            portRangeSize: 100,
        });
    });

    it('returns null for a non-object root (string, number, null)', () => {
        expect(parse_runtime_isolation_config('nope')).toBeNull();
        expect(parse_runtime_isolation_config(42)).toBeNull();
        expect(parse_runtime_isolation_config(null)).toBeNull();
    });

    it('returns null when runtimeIsolation is absent', () => {
        expect(parse_runtime_isolation_config({ other: true })).toBeNull();
    });

    it('returns null when runtimeIsolation is not an object', () => {
        expect(parse_runtime_isolation_config({ runtimeIsolation: 'ports' })).toBeNull();
    });

    it('returns null when portRangeStart is not a number', () => {
        expect(
            parse_runtime_isolation_config({ runtimeIsolation: { portRangeStart: 'x', portRangeSize: 10 } })
        ).toBeNull();
    });

    it('returns null when portRangeSize is not a number', () => {
        expect(
            parse_runtime_isolation_config({ runtimeIsolation: { portRangeStart: 4000, portRangeSize: null } })
        ).toBeNull();
    });

    it('returns null when portRangeSize is zero or negative', () => {
        expect(
            parse_runtime_isolation_config({ runtimeIsolation: { portRangeStart: 4000, portRangeSize: 0 } })
        ).toBeNull();
        expect(
            parse_runtime_isolation_config({ runtimeIsolation: { portRangeStart: 4000, portRangeSize: -5 } })
        ).toBeNull();
    });

    it('returns null for non-integer, negative, or out-of-65535-range port values', () => {
        const bad = [
            { portRangeStart: 4000.5, portRangeSize: 10 }, // fractional start
            { portRangeStart: 4000, portRangeSize: 10.5 }, // fractional size
            { portRangeStart: -100, portRangeSize: 10 }, // negative start
            { portRangeStart: 70000, portRangeSize: 10 }, // start past the port space
            { portRangeStart: 65530, portRangeSize: 100 }, // range overruns 65535
            { portRangeStart: Number.NaN, portRangeSize: 10 }, // NaN
        ];
        for (const runtimeIsolation of bad) {
            expect(parse_runtime_isolation_config({ runtimeIsolation })).toBeNull();
        }
    });
});
