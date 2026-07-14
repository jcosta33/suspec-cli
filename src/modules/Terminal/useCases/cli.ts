export type FlagSpec = Readonly<{ booleans: readonly string[]; strings: readonly string[] }>;

// Boolean-aware argument parser. A declared boolean flag never swallows the next token as its value
// (so `suspec check --json file.md` keeps file.md positional); a declared string flag consumes the
// next non-option token and reports a missing-value error for a terminal or option-shaped value;
// `--key=value` is split inline. Flag keys are returned without their leading dashes (`--force` →
// `force`, `-i` → `i`). The sole CLI plumbing the M1 commands need.
export function parse_flags(
    argv: string[],
    spec: FlagSpec
): { positional: string[]; flags: Map<string, string | boolean>; unknown: string[]; errors: string[] } {
    const booleans = new Set(spec.booleans);
    const strings = new Set(spec.strings);
    const flags = new Map<string, string | boolean>();
    const positional: string[] = [];
    const unknown: string[] = [];
    const errors: string[] = [];
    const key = (arg: string) => arg.replace(/^-+/, '');

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--') {
            // End-of-options: every remaining token is positional, even one that starts with `-`
            // (so a positional whose value begins with a dash can be passed after `--`).
            positional.push(...argv.slice(i + 1));
            break;
        }
        const eq = arg.indexOf('=');
        if (arg.startsWith('--') && eq > -1) {
            const flagKey = arg.slice(2, eq);
            const value = arg.slice(eq + 1);
            if (!booleans.has(`--${flagKey}`) && !strings.has(`--${flagKey}`)) {
                unknown.push(arg);
                continue;
            }
            if (strings.has(`--${flagKey}`) && value.length === 0) {
                errors.push(`option --${flagKey} requires a value`);
                continue;
            }
            if (booleans.has(`--${flagKey}`)) {
                if (value !== 'true' && value !== 'false') {
                    errors.push(`option --${flagKey} accepts only true or false`);
                    continue;
                }
                flags.set(flagKey, value === 'true');
            } else {
                flags.set(flagKey, value);
            }
            continue;
        }
        if (booleans.has(arg)) {
            flags.set(key(arg), true);
            continue;
        }
        if (strings.has(arg)) {
            const value = argv[i + 1];
            if (value === undefined || value.startsWith('-')) {
                errors.push(`option ${arg} requires a value`);
            } else {
                flags.set(key(arg), value);
                i++;
            }
            continue;
        }
        if (arg.startsWith('-')) {
            unknown.push(arg);
            continue;
        }
        positional.push(arg);
    }
    return { positional, flags, unknown, errors };
}
