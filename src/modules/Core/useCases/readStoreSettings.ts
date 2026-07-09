// The store-maintenance settings from the consumer-side suspec.config.json (SPEC-suspec-v2
// AC-019/AC-020): `wip_cap` (how many active specs `work` tolerates before refusing a new launch)
// and `retention_days` (how long an archived artifact survives before `store gc` may delete it).
// Absence of config is never an error (AC-025): a missing/unreadable/malformed file, or a
// non-positive value, degrades to the defaults. Read-only.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const DEFAULT_WIP_CAP = 3;
export const DEFAULT_RETENTION_DAYS = 30;

const CONFIG_FILENAME = 'suspec.config.json';

export type StoreSettings = Readonly<{ wipCap: number; retentionDays: number }>;

// A usable cap/retention is a finite integer ≥ 1 — anything else keeps the default.
function positive_int(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : fallback;
}

export function read_store_settings(repoRoot: string): StoreSettings {
    const defaults: StoreSettings = { wipCap: DEFAULT_WIP_CAP, retentionDays: DEFAULT_RETENTION_DAYS };
    const path = join(repoRoot, CONFIG_FILENAME);
    if (!existsSync(path)) {
        return defaults;
    }
    let raw: unknown;
    try {
        raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
        return defaults;
    }
    if (typeof raw !== 'object' || raw === null) {
        return defaults;
    }
    const record = raw as Record<string, unknown>;
    return {
        wipCap: positive_int(record.wip_cap, DEFAULT_WIP_CAP),
        retentionDays: positive_int(record.retention_days, DEFAULT_RETENTION_DAYS),
    };
}
