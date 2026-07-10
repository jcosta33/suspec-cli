// Normalize a YAML scalar value the way the hand-rolled frontmatter / config parsers read it.
// The repo carries no YAML dependency (a deliberate stance — see readFrontmatter.ts, agentConfig.ts);
// this is the one shared, structure-aware normalizer those line-scanners route their scalar values
// through, so a quoted value, an inline comment, or both are read as YAML would read them. Pure.
//
// Two real defects this closes: a quoted `status: "ready"` whose leaked quotes break the enum guards
// (the C007 `!== 'ready'` / C012-C013 `=== 'draft'` comparisons), and a `.suspec/config.yaml` value
// carrying an inline `# …` comment that corrupted adapter resolution.

// Cut an unquoted trailing `# …` comment. YAML: a `#` opens a comment only at the start of the value
// or when preceded by whitespace, and never inside a single/double-quoted span. So `SPEC-x#AC-001`
// (no space before `#`) is preserved, `ready # finalized` becomes `ready`, and a `#` inside
// `"claude #x"` stays put. Linear scan — no backtracking.
function strip_inline_comment(raw: string): string {
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < raw.length; i += 1) {
        const ch = raw[i];
        if (ch === '"' && !inSingle) {
            inDouble = !inDouble;
        } else if (ch === "'" && !inDouble) {
            inSingle = !inSingle;
        } else if (ch === '#' && !inSingle && !inDouble && (i === 0 || /\s/.test(raw[i - 1]))) {
            return raw.slice(0, i);
        }
    }
    return raw;
}

// Strip a single balanced surrounding quote pair (`"x"` / `'x'` → `x`). Inner whitespace is kept
// (a quoted scalar preserves it); only the outer pair is removed.
function strip_quotes(value: string): string {
    const quoted =
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
    return quoted ? value.slice(1, -1) : value;
}

// Comment-strip, then trim, then dequote — in that order so a quoted value with a trailing comment
// (`"claude"   # note`) loses the comment, trims to `"claude"`, then unwraps to `claude`.
export function normalize_scalar(raw: string): string {
    return strip_quotes(strip_inline_comment(raw).trim());
}

// The EMIT-side counterpart of normalize_scalar: render an external string (a gh issue title, a
// label — anything not under this repo's control) as one safe single-line YAML scalar. Newlines
// collapse to spaces (a frontmatter value must never break the fence structure), and a value that
// would be misread as YAML syntax — a `:`/`#` opening a mapping or comment, quotes, a leading
// indicator character — is double-quoted with `\` and `"` escaped, exactly the form
// strip_quotes/strip_inline_comment read back. A plain value stays unquoted, byte-identical.
export function emit_scalar(raw: string): string {
    const value = raw.replace(/\s+/g, ' ').trim();
    const needsQuoting =
        value.length === 0 ||
        /[,:#"'\\]/.test(value) || // a `,` (would merge into a `, `-joined list line), a mapping/comment opener, or a quote the line-scanners would misread
        /^[\s\-?[\]{}&*!|>%@`]/.test(value) || // a YAML indicator character in value-lead position
        /\s$/.test(value);
    if (!needsQuoting) {
        return value;
    }
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
