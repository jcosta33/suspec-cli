// The declared verify commands from the consumer-side suspec.config.json (SPEC-suspec-v2
// AC-021): the `verify` list of command strings `suspec check-my-work` runs as its gate face.
// Absence of config is never an error (AC-025): a missing/unreadable/malformed file, or a shape
// that is not a list of non-empty strings, reads as NO declared commands — the command notes the
// skip. Read-only.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const CONFIG_FILENAME = 'suspec.config.json';

export function read_verify_commands(repoRoot: string): readonly string[] {
    const path = join(repoRoot, CONFIG_FILENAME);
    if (!existsSync(path)) {
        return [];
    }
    let raw: unknown;
    try {
        raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
        return [];
    }
    if (typeof raw !== 'object' || raw === null) {
        return [];
    }
    const verify = (raw as Record<string, unknown>).verify;
    if (!Array.isArray(verify)) {
        return [];
    }
    return verify.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}
