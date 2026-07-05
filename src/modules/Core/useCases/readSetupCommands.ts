// Read the consumer-side `suspec.config.json`'s `setup` commands (SPEC-suspec-cli-work AC-003) — the
// same file create_worktree reads for its runtime-isolation stamp, so `suspec work`'s setup and the
// port stamp share one config source (no new file). The read is injectable so the wiring is testable
// without touching disk. A missing / unreadable / malformed config yields NO commands — setup is then a
// no-op, and `suspec work` prints a note and launches anyway.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { parse_setup_config } from '../services/setupConfig.ts';

const CONFIG_FILENAME = 'suspec.config.json';

function default_read(path: string): string | null {
    if (!existsSync(path)) {
        return null;
    }
    try {
        return readFileSync(path, 'utf8');
    } catch {
        return null;
    }
}

export function read_setup_commands(
    repoRoot: string,
    readConfig: (path: string) => string | null = default_read
): readonly string[] {
    const raw = readConfig(join(repoRoot, CONFIG_FILENAME));
    if (raw === null) {
        return [];
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }
    return parse_setup_config(parsed);
}
