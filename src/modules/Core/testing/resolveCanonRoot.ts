// Resolve the sibling suspec canon checkout for the drift guards (PG-005, AC-004).
//
// A checkout directory need not match its remote name. Resolution order:
//   1. SUSPEC_CANON env var (a path to the canon repo root), then
//   2. `../suspec`, then
//   3. any sibling directory carrying both `checks/checks.yaml` and `docs/adrs` (the canon repo's
//      identifying shape), whatever the folder is named.
// Returns the absolute canon root, or null when nothing resolves — the guards then skip LOUDLY.
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function resolve_canon_root(cwd: string): string | null {
    const fromEnv = process.env.SUSPEC_CANON;
    if (fromEnv !== undefined && existsSync(join(fromEnv, 'checks', 'checks.yaml'))) {
        return resolve(fromEnv);
    }
    const preferred = resolve(cwd, '..', 'suspec');
    if (existsSync(join(preferred, 'checks', 'checks.yaml'))) {
        return preferred;
    }
    const parent = resolve(cwd, '..');
    let entries: string[];
    try {
        entries = readdirSync(parent);
    } catch {
        return null;
    }
    for (const name of entries) {
        const dir = join(parent, name);
        if (existsSync(join(dir, 'checks', 'checks.yaml')) && existsSync(join(dir, 'docs', 'adrs'))) {
            return dir;
        }
    }
    return null;
}
