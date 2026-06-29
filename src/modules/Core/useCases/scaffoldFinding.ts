// PrepareEngine.promote (AC-002, ADR-0084 D2) — scaffold ONE candidate finding file
// `findings/<slug>.md` from the kit finding template, pre-filling `from:` (the task/review id) and
// leaving the *what-we-learned* body as a template placeholder. It asserts NO learning of its own —
// the human fills the durable fact and accepts it — and it writes NO board. This is the in-boundary
// finding scaffold; the board-mutating close is parked (DECIDE #1.2 / ADR-0084 D3).

import { join } from 'path';

import { ok, err, type Result } from '../../../infra/errors/result.ts';
import { type AppError } from '../../../infra/errors/createAppError.ts';
import { write_new_file } from '../../Workspace/useCases/index.ts';
import { is_safe_segment } from '../services/safeSegment.ts';
import { usage_error, type OutcomeLevel } from './unixOutcome.ts';

export type ScaffoldFindingInput = Readonly<{
    workspaceDir: string;
    from: string; // the task/review/audit/inventory id the finding is promoted from
    force?: boolean;
}>;

export type ScaffoldFindingReport = Readonly<{
    level: OutcomeLevel;
    path: string;
    slug: string;
    from: string;
}>;

// The finding slug: the source id minus its kind prefix (TASK- / REVIEW- / AUDIT- / INV-), lowered.
// `TASK-checkout-flow` → `checkout-flow`. Mirrors the review-slug derivation so a finding lands beside
// the run it was promoted from.
function finding_slug(from: string): string {
    return from.replace(/^(?:TASK|REVIEW|AUDIT|INV)-/i, '').toLowerCase();
}

function render_finding(input: { slug: string; from: string; date: string }): string {
    return `---
type: finding
id: FINDING-${input.slug}
status: candidate
from: ${input.from}
date: ${input.date}
related: [{{SPEC-x#AC-NNN}}]
---

# Finding: {{title}}

## What we learned

{{the durable fact, decision, or pattern — one claim}}

## Evidence

{{link to the review packet, PR, or pasted output that grounds it}}

## Where it applies

- {{paths / features / situations where this matters}}

## Where it does not apply

- {{known limits of the claim}}

## Future guidance

{{what an agent or developer should do differently next time}}
`;
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

export function scaffold_finding(input: ScaffoldFindingInput): Result<ScaffoldFindingReport, AppError> {
    const from = input.from.trim();
    if (from.length === 0) {
        return err(usage_error('usage: suspec promote <task> — the task/review id the finding is promoted from'));
    }

    const slug = finding_slug(from);
    // The slug becomes a filename; reject any path-escaping source id before it is joined into a write
    // path (a malicious/cloned workspace otherwise makes `promote` an arbitrary-location writer).
    if (slug.length === 0 || !is_safe_segment(slug)) {
        return err(usage_error(`cannot derive a finding slug from "${from}" — letters, digits, '.', '_', '-' only`));
    }

    const content = render_finding({ slug, from, date: today() });

    const path = join(input.workspaceDir, 'findings', `${slug}.md`);
    // No-clobber (AC-004): an existing finding is an error unless `--force`, and exactly this one file
    // is written — the workspace is otherwise byte-unchanged. NO board is written; NO learning asserted.
    const written = write_new_file(path, content, { overwrite: input.force === true });
    if (!written.ok) {
        return err(written.error);
    }

    return ok({ level: 'clean', path, slug, from });
}
