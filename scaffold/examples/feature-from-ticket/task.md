---
type: task
id: TASK-CONTACT-FORM
source:
  - SPEC-CONTACT-FORM
scope: [AC-001, AC-002, AC-003]
status: closed
---

# Task: Build the contact form

## Source

- Spec: `specs/contact-form/spec.md` (SPEC-CONTACT-FORM)

## Scope

Implement or preserve:

- AC-001 — valid submission persisted, `201 Created`
- AC-002 — missing or malformed email → `422`, nothing persisted
- AC-003 — message bodies never written to application logs

## Do not change

- The support email pipeline (`src/email/`)
- The database schema beyond the new `messages` table
- Marketing-site navigation

## Affected areas

- `src/api/contact.ts`
- `src/db/messages.ts`
- `src/pages/contact.tsx`

## Verify

- [x] `npm test -- contact-form.submit` (AC-001)
- [x] `npm test -- contact-form.validation` (AC-002)
- [x] `npm test -- contact-form.no-body-in-logs` (AC-003)

## Agent instructions

1. Read the source spec first.
2. Stay inside this task's scope. If a requirement can't be met as written,
   stop and say why instead of improvising.
3. Run every Verify item and paste the real output — a claim without output
   counts as unverified.
4. Before finishing, re-read your own diff as a skeptic: what would a
   reviewer flag?
5. Fill `## Run summary` below — changed files, one line per Verify command
   citing its pasted output above, out-of-scope edits, blocked questions —
   and drop anything durable in `## Findings`.

## Findings

- The request logger logs full request bodies at debug level by default —
  saved at Close as `findings/logger-bodies.md` (FINDING-LOGGER-BODIES).

## Run summary

- Changed files: `src/api/contact.ts`, `src/db/messages.ts`,
  `src/pages/contact.tsx`, `src/middleware/logger.ts` (out of scope — below)
- Verify results: all three Verify items run after the final edit — output
  pasted under each item above (AC-001 2 passed · AC-002 3 passed · AC-003
  1 passed, re-run after the first draft read Unverified)
- Out-of-scope edits: `src/middleware/logger.ts` redact list — required to
  make AC-003 pass; flagged for review
- Blocked questions: none
