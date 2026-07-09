// `suspec store list` — the read half of the structural anti-rot surface (SPEC-suspec-v2
// AC-020): every flat artifact in the store root (active) and every file in `archive/`
// (archived), each with its kind and age in days (mtime-based — the store is CLI/agent-written,
// so mtime is the honest "last touched"). Read-only; a missing store dir reads as empty.

import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { archive_dir } from '../services/storeLayout.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const KIND = /^(spec|run|review|finding|intake)-/;

export type StoreArtifactAge = Readonly<{ filename: string; kind: string; ageDays: number }>;

export type StoreListing = Readonly<{
    active: readonly StoreArtifactAge[];
    archived: readonly StoreArtifactAge[];
}>;

function scan(dir: string, nowMs: number, mdOnly: boolean): StoreArtifactAge[] {
    if (!existsSync(dir)) {
        return [];
    }
    const out: StoreArtifactAge[] = [];
    for (const name of readdirSync(dir).sort()) {
        if (name.startsWith('.') || (mdOnly && !name.endsWith('.md'))) {
            continue;
        }
        let stat;
        try {
            stat = statSync(join(dir, name));
            /* v8 ignore next 3 -- a race: the entry vanished between readdir and stat */
        } catch {
            continue;
        }
        if (!stat.isFile()) {
            continue; // evidence/ and archive/ are trees, not artifacts
        }
        const mtimeMs = stat.mtimeMs;
        const kind = KIND.exec(name);
        out.push({
            filename: name,
            kind: kind !== null ? kind[1] : 'other',
            ageDays: Math.max(0, Math.floor((nowMs - mtimeMs) / DAY_MS)),
        });
    }
    return out;
}

export function list_store_artifacts(storeDir: string, now: Date = new Date()): StoreListing {
    return {
        active: scan(storeDir, now.getTime(), true),
        archived: scan(archive_dir(storeDir), now.getTime(), false),
    };
}
