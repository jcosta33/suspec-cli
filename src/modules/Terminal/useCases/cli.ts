export type FlagSpec = Readonly<{ booleans: readonly string[]; strings: readonly string[] }>;

// Boolean-aware argument parser. A declared boolean flag never swallows the next token as its value
// (so `swarm check --json file.md` keeps file.md positional); a declared string flag consumes the
// next token; `--key=value` is split inline. Flag keys are returned without their leading dashes
// (`--force` → `force`, `-i` → `i`). The sole CLI plumbing the M1 commands need.
export function parse_flags(
    argv: string[],
    spec: FlagSpec
): { positional: string[]; flags: Map<string, string | boolean> } {
    const booleans = new Set(spec.booleans);
    const strings = new Set(spec.strings);
    const flags = new Map<string, string | boolean>();
    const positional: string[] = [];
    const key = (arg: string) => arg.replace(/^-+/, '');

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const eq = arg.indexOf('=');
        if (arg.startsWith('--') && eq > -1) {
            const flagKey = arg.slice(2, eq);
            const value = arg.slice(eq + 1);
            // A declared boolean in `--flag=value` form coerces to a boolean — otherwise `--json=true`
            // reads as the string "true" and `flags.get('json') === true` silently fails (JSON off).
            flags.set(flagKey, booleans.has(`--${flagKey}`) ? value !== 'false' : value);
            continue;
        }
        if (booleans.has(arg)) {
            flags.set(key(arg), true);
            continue;
        }
        if (strings.has(arg)) {
            // POSIX: a declared string flag consumes the next token as its value, even if it looks like
            // a flag (so `--base -x` captures `-x` rather than silently dropping the value AND the
            // token). The consuming command validates the value — a flag-shaped ref is rejected with a
            // clean error, never fed to git as an option.
            const value = argv[i + 1];
            if (value !== undefined) {
                flags.set(key(arg), value);
                i++;
            }
            continue;
        }
        if (arg.startsWith('-')) {
            continue; // an unknown flag — ignore rather than mistake it for a positional
        }
        positional.push(arg);
    }
    return { positional, flags };
}
