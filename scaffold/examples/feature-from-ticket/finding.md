---
type: finding
id: FINDING-LOGGER-BODIES
status: candidate
from: REVIEW-CONTACT-FORM
date: 2026-06-05
related: [SPEC-CONTACT-FORM#AC-003]
---

# Finding: The request logger logs bodies by default

## What we learned

`src/middleware/logger.ts` logs full request bodies at debug level for every
route. Any endpoint accepting user-submitted text leaks that text into logs
unless the route is added to the middleware's redact list.

## Evidence

REVIEW-CONTACT-FORM (`reviews/contact-form.md`): the
`contact-form.no-body-in-logs` test failed until `/api/contact` was added to
the redact list — diff and test output in PR #214.

## Where it applies

- Every new route that accepts free text or personal data.
- Any spec with a "must not log" requirement: check the redact list first.

## Where it does not apply

- Routes without request bodies (plain GETs) — the middleware logs nothing
  for them.

## Future guidance

When a spec says some input must stay out of logs, add the route to the
redact list in the same change and verify with a log-asserting test — do not
rely on the production log level to hide it.
