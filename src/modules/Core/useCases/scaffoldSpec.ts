// PrepareEngine.new — scaffold a fresh spec from the template (AC-013). Generates a draft spec
// conforming to the checks.yaml spec frontmatter + the plain two-tier shape (Intent, Non-goals,
// Requirements with one AC placeholder, Open questions). status: draft, so the TBD placeholders do
// not trip C007. Never overwrites an existing spec.

import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

import { ok, err, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

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
}>;

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

{{1-3 sentences: the behaviour change and why.}}

## Non-goals

- {{what this spec deliberately does not change}}

## Requirements

### AC-001 — {{short name}}
{{The system must ...}}
Verify with: {{a runnable test or command}}

## Open questions

- none
`;
}

export function scaffold_spec(input: ScaffoldSpecInput): Result<ScaffoldSpecReport, AppError> {
    const specPath = join(input.workspaceDir, 'specs', input.slug, 'spec.md');
    if (existsSync(specPath)) {
        return err(createAppError('SpecExists', `a spec already exists: specs/${input.slug}/spec.md`, { slug: input.slug }));
    }
    const content = render_spec({ slug: input.slug, title: input.title ?? input.slug, owner: input.owner ?? '{{team-or-person}}' });
    mkdirSync(dirname(specPath), { recursive: true });
    writeFileSync(specPath, content);
    return ok({ level: 'clean', path: specPath, specId: `SPEC-${input.slug}` });
}
