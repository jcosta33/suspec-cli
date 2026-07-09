#!/usr/bin/env node

// `suspec clean` — store hygiene, the short spelling of `suspec store gc` (ADR-0137: the
// transient set lives in the store; retention is the pruning policy). Deletes ONLY archived
// artifacts past the retention window (`retention_days` in suspec.config.json, default 30).
//   suspec clean            delete archived store artifacts past retention
//   suspec clean --json     machine output

import { run as run_store } from './store.ts';

export function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
    return run_store(['gc', ...argv], cwd);
}
