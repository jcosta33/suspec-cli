
import { spawnSync } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';
import type { Dirent } from 'fs';

/**
 * Parse argv into flags and positional arguments.
 * --flag value, --flag=value, --flag, -f, -f value, --
 * @param {string[]} argv
 * @returns {Record<string, string | boolean>, positional: string[]}
 */
export function parse_args(argv: string[]): { flags: Map<string, string | boolean>; positional: string[] } {
    const flags = new Map<string, string | boolean>();
    const positional: string[] = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '--') {
            positional.push(...argv.slice(i + 1));
            break;
        }
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const eqIdx = key.indexOf('=');
            if (eqIdx > -1) {
                flags.set(key.slice(0, eqIdx), key.slice(eqIdx + 1));
            } else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                flags.set(key, argv[i + 1]);
                i++;
            } else {
                flags.set(key, true);
            }
        } else if (arg.startsWith('-') && arg.length === 2) {
            const key = arg[1];
            if (key && i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                flags.set(key, argv[i + 1]);
                i++;
            } else if (key) {
                flags.set(key, true);
            }
        } else {
            positional.push(arg);
        }
    }
    return { flags, positional };
}

export type FlagSpec = Readonly<{ booleans: readonly string[]; strings: readonly string[] }>;

/**
 * Boolean-aware argument parser. Unlike parse_args, a declared boolean flag never swallows the next
 * token as its value (so `swarm check --json file.md` keeps file.md positional). Flag keys are
 * returned without their leading dashes (`--force` → `force`, `-i` → `i`).
 */
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

/**
 * Recursively find markdown files in a directory.
 * @param {string} dir
 * @returns {string[]}
 */
export function find_markdown_files(dir: string): string[] {
    const results: string[] = [];
    let entries: Dirent[];
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return results;
    }
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...find_markdown_files(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            results.push(fullPath);
        }
    }
    return results;
}

/**
 * Interactive selection using fzf.
 * @param {string[]} items
 * @param {{ multi?: boolean }} opts
 * @returns {string | string[] | null}
 */
export function fzf_select(
    items: string[],
    opts: { multi?: boolean } = {}
): string | string[] | null {
    const input = items.join('\n');
    const args = opts.multi ? ['--multi'] : [];
    const result = spawnSync('fzf', args, {
        input,
        encoding: 'utf8',
        shell: false,
    });
    if (result.error) {
        if (
            result.error instanceof Error &&
            'code' in result.error &&
            result.error.code === 'ENOENT'
        ) {
            throw new Error(
                'fzf not found. Please install fzf (brew install fzf)'
            );
        }
        throw result.error;
    }
    if (result.status !== 0 || !result.stdout.trim()) {
        return null;
    }
    const lines = result.stdout.trim().split('\n');
    return opts.multi ? lines : lines[0];
}

/**
 * Prompt for user input via readline.
 * @param {string} promptText
 * @param {string} defaultVal
 * @returns {Promise<string>}
 */
export async function prompt_input(
    promptText: string,
    defaultVal = ''
): Promise<string> {
    const readline = await import('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(promptText, (answer) => {
            rl.close();
            resolve(answer || defaultVal);
        });
    });
}


/**
 * Check if a command exists in PATH.
 * @param {string} command
 * @returns {boolean}
 */
export function command_exists(command: string): boolean {
    const result = spawnSync(
        process.platform === 'win32' ? 'where' : 'which',
        [command],
        { stdio: 'pipe' }
    );
    return result.status === 0;
}

/**
 * Safely split a command string into program and arguments.
 * Does NOT support shell metacharacters (pipes, redirection, etc.).
 */
export function split_command(commandStr: string): { program: string; args: string[] } {
    const parts = commandStr.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) throw new Error('Empty command string');
    const [program, ...args] = parts;
    return { program, args };
}
