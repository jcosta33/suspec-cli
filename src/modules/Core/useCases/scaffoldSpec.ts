// PrepareEngine.new — scaffold a fresh spec from the template (AC-013). Generates a draft spec
// conforming to the checks.yaml spec frontmatter + the SAME section shape as the frozen
// `templates/spec.md` the kit ships (Intent, Non-goals, Requirements with one AC placeholder, Open
// questions, Affected areas, Dropped from sources) — kept in parity so a hand author following the kit
// template and `swarm new spec` land on the same skeleton (SW-008). status: draft, so the TBD
// placeholders do not trip C007. Never overwrites an existing spec.

import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';

import { ok, err, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { is_safe_segment } from '../services/safeSegment.ts';
import { find_workspace_spec_files } from './findSpecFiles.ts';
import { usage_error, type OutcomeLevel } from './unixOutcome.ts';

export type ScaffoldSpecInput = Readonly<{
    workspaceDir: string;
    slug: string;
    title?: string;
    owner?: string;
}>;

export type ScaffoldSpecReport = Readonly<{
    level: OutcomeLevel;
    path: string;
    specId: string;
    // An advisory (non-blocking): the slug's leading `NNN-` ordinal is already in use by another spec.
    // The spec is still created — ordinals are a sorting convention, not a unique key — but a duplicate
    // makes the numbered tree ambiguous, so the surface nudges toward the next free number.
    ordinalClash?: Readonly<{ ordinal: string; existingSlug: string; nextFree: string }>;
}>;

// The digits of a leading `NNN-` ordinal (`011-foo` → `011`), or null when the slug carries none. The
// raw digit string is kept (not parsed) so its width drives the zero-padding of the suggested next free.
function leading_ordinal(slug: string): string | null {
    const match = /^(\d+)-/.exec(slug);
    return match ? match[1] : null;
}

function render_spec(input: { slug: string; title: string; owner: string }): string {
    const specId = `SPEC-${input.slug}`;
    return `---
type: spec
id: ${specId}
title: ${input.title}
status: draft
owner: ${input.owner}
sources:
  - self
---

# ${input.title}

## Intent

{{1–3 sentences: the behavior change and why.}}

## Non-goals

- {{what this spec deliberately does not change}}

## Requirements

### AC-001 — {{short name}}

When {{condition}}, {{the component}} must {{observable behavior}}.

Verify with: \`{{test-name-or-command}}\`

## Open questions

- none

## Affected areas

- \`{{path}}\`

## Dropped from sources

- {{dropped item — reason}}
`;
}

export function scaffold_spec(input: ScaffoldSpecInput): Result<ScaffoldSpecReport, AppError> {
    if (!is_safe_segment(input.slug)) {
        return err(
            usage_error(`invalid spec slug: "${input.slug}" — letters, digits, '.', '_', '-' only (no '/' or '..')`)
        );
    }
    const specPath = join(input.workspaceDir, 'specs', input.slug, 'spec.md');
    if (existsSync(specPath)) {
        return err(
            createAppError('SpecExists', `a spec already exists: specs/${input.slug}/spec.md`, { slug: input.slug })
        );
    }
    // Detect a duplicate leading ordinal before writing — advisory only, never a hard stop. If the slug
    // is `NNN-…`, scan the existing specs for one that shares the ordinal but is a different slug; if found,
    // suggest the lowest free integer ≥ the current ordinal, zero-padded to the same width.
    let ordinalClash: ScaffoldSpecReport['ordinalClash'];
    const ordinal = leading_ordinal(input.slug);
    if (ordinal !== null) {
        const existingSlugs = find_workspace_spec_files(input.workspaceDir).map((path) => basename(dirname(path)));
        const existingSlug = existingSlugs.find((slug) => slug !== input.slug && leading_ordinal(slug) === ordinal);
        if (existingSlug !== undefined) {
            // Compare ordinals by numeric value so a width mismatch (`5-foo` vs `011-bar`) cannot mask a
            // collision; the suggested next free is then zero-padded back to the input ordinal's width.
            const used = new Set(
                existingSlugs
                    .map((slug) => leading_ordinal(slug))
                    .filter((ord): ord is string => ord !== null)
                    .map((ord) => parseInt(ord, 10))
            );
            let nextNum = parseInt(ordinal, 10);
            while (used.has(nextNum)) {
                nextNum += 1;
            }
            ordinalClash = { ordinal, existingSlug, nextFree: String(nextNum).padStart(ordinal.length, '0') };
        }
    }

    const content = render_spec({
        slug: input.slug,
        title: input.title ?? input.slug,
        owner: input.owner ?? '{{team-or-person}}',
    });
    mkdirSync(dirname(specPath), { recursive: true });
    writeFileSync(specPath, content);
    return ok({
        level: ordinalClash ? 'warning' : 'clean',
        path: specPath,
        specId: `SPEC-${input.slug}`,
        ...(ordinalClash ? { ordinalClash } : {}),
    });
}
