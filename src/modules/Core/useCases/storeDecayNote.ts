// The shared decay hook the ambient surfaces wire in (SPEC-suspec-v2 AC-019): resolve the repo's
// store WITHOUT creating it (probe), scan it, and return the one-line nudge — or null when the
// repo has no store yet or nothing decayed. `work`, `status`, and `next` call this.
// Never an error: a surface's main job must not fail on a decay probe.

import { isErr } from '../../../infra/errors/result.ts';
import { read_store_settings } from './readStoreSettings.ts';
import { resolve_store_dir } from './resolveStoreDir.ts';
import { decay_line, store_decay_summary } from './storeDecaySummary.ts';

export function store_decay_note(repoRoot: string): string | null {
    const store = resolve_store_dir({ repoRoot, probe: true });
    if (isErr(store)) {
        return null; // no store yet — nothing to decay
    }
    const settings = read_store_settings(repoRoot);
    return decay_line(store_decay_summary(store.value.storeDir, { retentionDays: settings.retentionDays }));
}
