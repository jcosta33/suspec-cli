// AC-005's blocking rule (SPEC-suspec-v2): a failed setup BLOCKS the launch only when the driving
// spec has at least one AC whose `Verify with:` clause names a runtime command — otherwise setup
// failure stays the advisory warning it always was. The detection is a documented HEURISTIC, not a
// parser: a Verify clause (its `Verify with:` line plus the wrapped lines up to the next blank
// line) "names a runtime command" when it contains a backtick-quoted command or one of the words
// test/tests/pnpm/npm/cargo/pip/run. PURE (spec text in, boolean out).

const BACKTICK_COMMAND = /`[^`]+`/;
const RUNTIME_WORD = /\b(test|tests|pnpm|npm|cargo|pip|run)\b/i;

// Every `Verify with:` clause in the spec, each flattened to one string. A clause runs from its
// `Verify with:` line to the next blank line (spec prose wraps Verify text across lines).
function verify_clauses(source: string): readonly string[] {
    const lines = source.split(/\r\n|[\r\n]/);
    const out: string[] = [];
    let current: string[] | null = null;
    for (const line of lines) {
        if (/^\s*Verify with:/i.test(line)) {
            current = [line.replace(/^\s*Verify with:/i, '')];
            continue;
        }
        if (current === null) {
            continue;
        }
        if (line.trim() === '') {
            out.push(current.join(' '));
            current = null;
        } else {
            current.push(line);
        }
    }
    if (current !== null) {
        out.push(current.join(' '));
    }
    return out;
}

export function spec_requires_runtime(source: string): boolean {
    return verify_clauses(source).some((clause) => BACKTICK_COMMAND.test(clause) || RUNTIME_WORD.test(clause));
}
