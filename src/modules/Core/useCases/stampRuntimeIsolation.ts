// LaunchEngine runtime-isolation stamping (AC-010, ADR-0076 §9): when the workspace config declares
// a runtime-isolation port range, stamp a per-worktree fixture with a distinct port offset so
// parallel tasks do not collide on ports/DBs/caches. A no-op success when no range is configured.
// The file writer is injected so the engine is testable without touching disk.

import { writeFileSync } from 'fs';
import { join } from 'path';

import type { OutcomeLevel } from './unixOutcome.ts';

export type RuntimeIsolationConfig = Readonly<{
    portRangeStart: number;
    portRangeSize: number;
}> | null;

export type StampRuntimeIsolationInput = Readonly<{
    worktreePath: string;
    specSlug: string;
    config: RuntimeIsolationConfig;
    writeFile?: (path: string, content: string) => void;
}>;

export type StampRuntimeIsolationReport = Readonly<{
    level: OutcomeLevel;
    stamped: boolean;
    portOffset: number | null;
    port: number | null;
}>;

const STAMP_FILENAME = '.swarm-runtime.json';

// A stable, deterministic offset from the slug — distinct slugs get distinct offsets (modulo the
// range size), so two parallel worktrees do not share a port.
function offset_for(slug: string, size: number): number {
    let hash = 0;
    for (const char of slug) {
        hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }
    return hash % size;
}

export function stamp_runtime_isolation(input: StampRuntimeIsolationInput): StampRuntimeIsolationReport {
    if (input.config === null) {
        return { level: 'clean', stamped: false, portOffset: null, port: null };
    }

    const portOffset = offset_for(input.specSlug, input.config.portRangeSize);
    const port = input.config.portRangeStart + portOffset;
    const write = input.writeFile ?? ((path, content) => writeFileSync(path, content));
    write(join(input.worktreePath, STAMP_FILENAME), `${JSON.stringify({ portOffset, port }, null, 2)}\n`);

    return { level: 'clean', stamped: true, portOffset, port };
}
