// A parse failure — the error arm of parseSpec's Result (IF-001 ERRORS). A failure is a whole-document
// "cannot produce an IR at all" condition; ill-formed *blocks* are diagnostics, not failures (AC-005, a
// later increment), so the parser reports them and keeps going rather than failing the parse.

export const PARSE_FAILURE_CODES = ['unparseable-frontmatter', 'unknown-block-type'] as const;
export type ParseFailureCode = (typeof PARSE_FAILURE_CODES)[number];

export type ParseFailure = Readonly<{
    code: ParseFailureCode;
    message: string;
    line: number | null;
}>;
