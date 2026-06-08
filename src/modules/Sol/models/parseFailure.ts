import type { AppError } from '../../../infra/errors/createAppError.ts';

// A parse failure — the error arm of parse_spec's Result (IF-001 ERRORS). A failure is a whole-document
// "cannot produce an IR at all" condition; ill-formed *blocks* are diagnostics, not failures (AC-005, a
// later increment), so the parser reports them and keeps going rather than failing the parse.
//
// Modeled as the repo's AppError (src/infra/errors): `_tag: 'ParseFailure'`, `reason` carries which failure,
// `line` the 1-based source line when known.

export const PARSE_FAILURE_CODES = ['unparseable-frontmatter', 'unknown-block-type'] as const;
export type ParseFailureCode = (typeof PARSE_FAILURE_CODES)[number];

export type ParseFailure = AppError<'ParseFailure', { reason: ParseFailureCode; line: number | null }>;
