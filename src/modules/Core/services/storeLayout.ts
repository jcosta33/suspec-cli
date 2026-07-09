// The store layout is flat + archive (SPEC-suspec-v2 AC-002). These pure builders are the single
// source of the store's naming: flat markdown artifacts in the store root (`spec-<slug>.md`,
// `run-<slug>.md`, `review-<slug>.md`, `finding-<NNN>.md`, `intake-<slug>.md`, `task-<slug>.md` —
// the on-demand split slices — and `change-plan-<slug>.md`, ADR-0137), evidence under
// `evidence/<run>/`, and `archive/` as the
// only lifecycle subfolder. No other directory is ever derived here — a path this module does not
// build is a path the store must not contain. Slugs are validated by callers via `is_safe_segment`
// before they reach a builder. Pure.

import { join } from 'path';

export function spec_filename(slug: string): string {
    return `spec-${slug}.md`;
}

// Task slices are store artifacts too (ADR-0137): `suspec new task` cuts them from a store spec.
export function task_filename(slug: string): string {
    return `task-${slug}.md`;
}

export function run_filename(slug: string): string {
    return `run-${slug}.md`;
}

export function review_filename(slug: string): string {
    return `review-${slug}.md`;
}

export function intake_filename(slug: string): string {
    return `intake-${slug}.md`;
}

// Change plans are store artifacts like every other working artifact (ADR-0137): transient,
// promoted (or discarded) — never a committed `change-plans/` repo tree.
export function change_plan_filename(slug: string): string {
    return `change-plan-${slug}.md`;
}

// Findings are numbered, not slugged — `finding-007.md` sorts and reads as a sequence.
export function finding_filename(number: number): string {
    return `finding-${String(number).padStart(3, '0')}.md`;
}

// Evidence for one run lives under `evidence/<run>/` — the only non-lifecycle subtree.
export function evidence_dir(storeDir: string, runSlug: string): string {
    return join(storeDir, 'evidence', runSlug);
}

// `archive/` mirrors the same flat naming; it is the only lifecycle subfolder.
export function archive_dir(storeDir: string): string {
    return join(storeDir, 'archive');
}
