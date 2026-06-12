---
type: spec
id: SPEC-CONTACT-FORM
title: Contact form
status: ready
owner: web-team
sources:
  - ACME-482 (ticket.md)
---

# Contact form

## Intent

Visitors can send a message to support from `/contact` without opening an email
client. Submissions are stored where the support team already works.

## Non-goals

- No changes to the existing support email pipeline.
- No admin UI — the support dashboard already lists `messages` rows.

## Requirements

### AC-001 — Valid submission is stored

When a visitor submits the form with a name, a valid email, and a message, the
contact service must persist the message and respond `201 Created`.

Verify with: `npm test -- contact-form.submit`

### AC-002 — Invalid email is rejected

When the email is missing or malformed, the contact service must respond `422`
and persist nothing.

Verify with: `npm test -- contact-form.validation`

### AC-003 — Message bodies stay out of logs

The contact service must not write message bodies to application logs, at any
log level.

Verify with: `npm test -- contact-form.no-body-in-logs`

## Open questions

- None.

## Affected areas

- `src/api/contact.ts`
- `src/db/messages.ts`
- `src/pages/contact.tsx`

## Dropped from sources

- Attachments (ACME-482) — needs a file-storage decision first; new spec when it lands.
- CAPTCHA (ACME-482) — no observed spam yet; add when there is.
- Send the visitor a copy by email (ACME-482) — needs outbound email infrastructure this site lacks.
