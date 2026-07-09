// The interactive `status` flow: a framed, coloured view of the store summary (ADR-0137 — the
// store is the state of record; there is no board). Status is a read-only view, so the interactive
// form is the rich presentation (no prompts) — the dashboard can route here. Pure over the
// injected Prompter + the store readers.

import { resolve_store_dir, list_store_artifacts, next_action } from '../../Core/useCases/index.ts';
import { resolve_repo_root } from '../../Workspace/useCases/index.ts';
import { isOk, isErr } from '../../../infra/errors/result.ts';
import { type Prompter } from './prompter.ts';
import { format_store_status } from '../services/render.ts';

export type StatusFlowDeps = Readonly<{ cwd: string }>;

export function run_status_flow(prompter: Prompter, deps: StatusFlowDeps): number {
    prompter.intro('suspec status');
    const rootResult = resolve_repo_root(deps.cwd);
    const repoRoot = isErr(rootResult) ? deps.cwd : rootResult.value;
    // Probe-only: status never creates the store it summarizes.
    const store = resolve_store_dir({ repoRoot, probe: true });
    if (!isOk(store)) {
        prompter.note('no store for this repo yet — `suspec write spec "<intent>"` starts one', 'Store');
        prompter.outro('nothing in flight');
        return 0;
    }
    const listing = list_store_artifacts(store.value.storeDir);
    const next = next_action({ storeDir: store.value.storeDir });
    prompter.note(format_store_status({ active: listing.active, archived: listing.archived, next }), 'Store');
    prompter.outro(next.length > 0 ? `${String(next.length)} item(s) need attention` : 'all clear');
    return 0;
}
