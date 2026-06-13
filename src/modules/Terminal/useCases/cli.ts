export type FlagSpec = Readonly<{ booleans: readonly string[]; strings: readonly string[] }>;

// Boolean-aware argument parser. A declared boolean flag never swallows the next token as its value
// (so `swarm check --json file.md` keeps file.md positional); a declared string flag consumes the
// next token; `--key=value` is split inline. Flag keys are returned without their leading dashes
// (`--force` → `force`, `-i` → `i`). The sole CLI plumbing the M1 commands need.
export function parse_flags(argv: string[], spec: FlagSpec): { positional: string[]; flags: Map<string, string | boolean> } {
    const booleans = new Set(spec.booleans);
    const strings = new Set(spec.strings);
    const flags = new Map<string, string | boolean>();
    const positional: string[] = [];
    const key = (arg: string) => arg.replace(/^-+/, '');

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const eq = arg.indexOf('=');
        if (arg.startsWith('--') && eq > -1) {
            flags.set(arg.slice(2, eq), arg.slice(eq + 1));
            continue;
        }
        if (booleans.has(arg)) {
            flags.set(key(arg), true);
            continue;
        }
        if (strings.has(arg)) {
            const value = argv[i + 1];
            if (value !== undefined && !value.startsWith('-')) {
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
