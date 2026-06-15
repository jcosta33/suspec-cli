// Runtime-isolation config (AC-010): the shared port-range shape plus a pure parser for the
// consumer-side `swarm.config.json`'s `runtimeIsolation` block. The disk read lives in the
// create_worktree use-case; this validation is a pure service (use-cases depend on services, never
// the reverse). Any shape that is not a usable port range parses to null — a no-op stamp.

export type RuntimeIsolationConfig = Readonly<{
    portRangeStart: number;
    portRangeSize: number;
}> | null;

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function parse_runtime_isolation_config(raw: unknown): RuntimeIsolationConfig {
    if (!is_record(raw)) {
        return null;
    }
    const isolation = raw.runtimeIsolation;
    if (!is_record(isolation)) {
        return null;
    }
    const start = isolation.portRangeStart;
    const size = isolation.portRangeSize;
    if (typeof start !== 'number' || typeof size !== 'number') {
        return null;
    }
    // Real ports only: integers, non-negative start, positive size, and the whole range inside the
    // 0–65535 port space (a NaN/Infinity/float/negative/huge config otherwise yields invalid ports).
    if (!Number.isInteger(start) || !Number.isInteger(size) || start < 0 || size <= 0 || start + size > 65536) {
        return null;
    }
    return { portRangeStart: start, portRangeSize: size };
}
