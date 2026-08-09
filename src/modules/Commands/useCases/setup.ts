import { createHash, randomBytes } from 'node:crypto';
import {
    closeSync,
    constants,
    existsSync,
    fsyncSync,
    lstatSync,
    openSync,
    readFileSync,
    readdirSync,
    realpathSync,
    renameSync,
    rmSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import type { Stats } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
    AGENT_POLICY,
    AGENT_POLICY_SHA256,
    AGENT_POLICY_VERSION,
    RECOGNIZED_AGENT_POLICIES,
} from '../../../generated/agentPolicy.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';

export const SETUP_FLAG_SPEC = {
    booleans: ['--check', '--remove', '--dry-run', '--yes', '--json'],
    strings: [],
} as const;

const HARNESSES = ['codex', 'claude-code', 'kimi-code', 'zcode', 'opencode'] as const;
type Harness = (typeof HARNESSES)[number];
type State = 'current' | 'changed' | 'missing' | 'drifted' | 'blocked' | 'unknown';
type Operation = 'check' | 'install' | 'remove' | 'dry-run';

type TargetResult = {
    harness: Harness;
    state: State;
    paths: string[];
    message?: string;
};

type SetupEnvelope = {
    version: '2';
    operation: Operation;
    ok: boolean;
    targets: TargetResult[];
};

type SetupContext = {
    env: NodeJS.ProcessEnv;
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    uid: number | undefined;
};

type ResolvedTarget = {
    harness: Harness;
    path: string;
    body: string;
    note?: string;
};

type OwnedSpan = {
    start: number;
    end: number;
    prefix: string;
    policyKey: string;
    originalExisted: boolean;
};

type FileSnapshot =
    | { exists: false }
    | {
          exists: true;
          source: string;
          dev: number;
          ino: number;
          mode: number;
          uid: number;
          nlink: number;
      };

class SetupFailure extends Error {
    readonly state: Extract<State, 'blocked' | 'drifted' | 'unknown'>;

    constructor(message: string, state: Extract<State, 'blocked' | 'drifted' | 'unknown'> = 'blocked') {
        super(message);
        this.state = state;
    }
}

const START_PREFIX = '<!-- agent-policy ';
const END_MARKER = '<!-- /agent-policy -->';

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function is_harness(value: string): value is Harness {
    return (HARNESSES as readonly string[]).includes(value);
}

function operation_from(flags: Map<string, string | boolean>): Operation {
    if (flags.get('check') === true) return 'check';
    if (flags.get('remove') === true) return 'remove';
    if (flags.get('dry-run') === true) return 'dry-run';
    return 'install';
}

function emit(envelope: SetupEnvelope, json: boolean, context: SetupContext, forcedCode?: number): number {
    const rank: Record<State, number> = {
        current: 0,
        changed: 0,
        missing: 1,
        drifted: 1,
        unknown: 1,
        blocked: 2,
    };
    let code = 0;
    for (const target of envelope.targets) code = Math.max(code, rank[target.state]);
    if (forcedCode !== undefined) code = Math.max(code, forcedCode);
    envelope.ok = code === 0;
    if (json) {
        context.stdout(`${JSON.stringify(envelope)}\n`);
    } else {
        for (const target of envelope.targets) {
            const suffix = target.message === undefined ? '' : `: ${target.message}`;
            context.stdout(`${target.harness}: ${target.state}${suffix}\n`);
            for (const path of target.paths) context.stdout(`  ${path}\n`);
        }
    }
    return code;
}

function emit_usage(message: string, operation: Operation, json: boolean, context: SetupContext): number {
    const envelope: SetupEnvelope = { version: '2', operation, ok: false, targets: [] };
    if (json) context.stdout(`${JSON.stringify({ ...envelope, error: message })}\n`);
    else context.stderr(`suspec setup: ${message}\n`);
    return 2;
}

function require_home(env: NodeJS.ProcessEnv): string {
    const home = env.HOME;
    if (home === undefined || !isAbsolute(home)) throw new SetupFailure('HOME must be an absolute path');
    const suppliedStats = lstatSync(home);
    if (!suppliedStats.isDirectory() || suppliedStats.isSymbolicLink()) {
        throw new SetupFailure('HOME is not a safe directory');
    }
    const canonical = realpathSync(home);
    const stats = lstatSync(canonical);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new SetupFailure('HOME is not a safe directory');
    return canonical;
}

function assert_below_home(home: string, path: string, label: string): string {
    if (!isAbsolute(path)) throw new SetupFailure(`${label} must be absolute`);
    const normalized = resolve(path);
    const rel = relative(home, normalized);
    if (rel === '' || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
        throw new SetupFailure(`${label} must stay below HOME`);
    }
    return normalized;
}

function require_directory(home: string, path: string, label: string): string {
    const normalized = assert_below_home(home, path, label);
    if (!existsSync(normalized)) throw new SetupFailure(`${label} does not exist`);
    const suppliedStats = lstatSync(normalized);
    if (!suppliedStats.isDirectory() || suppliedStats.isSymbolicLink()) {
        /* v8 ignore next -- exercised by unsafe config-root tests; throw coverage is not reported */
        throw new SetupFailure(`${label} is not a safe directory`);
    }
    const canonical = realpathSync(normalized);
    assert_below_home(home, canonical, label);
    const stats = lstatSync(canonical);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new SetupFailure(`${label} is not a safe directory`);
    let cursor = canonical;
    while (cursor !== home) {
        if (existsSync(join(cursor, '.git'))) throw new SetupFailure(`${label} is inside a Git worktree`);
        cursor = dirname(cursor);
    }
    return canonical;
}

function assert_safe_stats(path: string, stats: Stats, uid: number | undefined): void {
    if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink !== 1) {
        throw new SetupFailure(`unsafe target: ${path}`);
    }
    if (uid !== undefined && stats.uid !== uid) throw new SetupFailure(`target has a foreign owner: ${path}`);
}

function same_snapshot(left: FileSnapshot, right: FileSnapshot): boolean {
    if (!left.exists || !right.exists) return left.exists === right.exists;
    return (
        left.source === right.source &&
        left.dev === right.dev &&
        left.ino === right.ino &&
        left.mode === right.mode &&
        left.uid === right.uid &&
        left.nlink === right.nlink
    );
}

function inspect_file(path: string, uid: number | undefined): FileSnapshot {
    if (!existsSync(path)) return { exists: false };
    const before = lstatSync(path);
    assert_safe_stats(path, before, uid);
    const bytes = readFileSync(path);
    const source = bytes.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(bytes)) throw new SetupFailure(`target is not valid UTF-8: ${path}`);
    const after = lstatSync(path);
    assert_safe_stats(path, after, uid);
    if (
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.mode !== after.mode ||
        before.uid !== after.uid ||
        before.nlink !== after.nlink
    ) {
        /* v8 ignore next -- requires a filesystem race */
        throw new SetupFailure(`target changed during inspection: ${path}`, 'unknown');
    }
    return {
        exists: true,
        source,
        dev: after.dev,
        ino: after.ino,
        mode: after.mode,
        uid: after.uid,
        nlink: after.nlink,
    };
}

function inspect_twice(path: string, uid: number | undefined): FileSnapshot {
    const first = inspect_file(path, uid);
    const second = inspect_file(path, uid);
    /* v8 ignore next -- requires a filesystem race */
    if (!same_snapshot(first, second)) throw new SetupFailure(`target changed during inspection: ${path}`, 'unknown');
    return second;
}

function optional_source(path: string, uid: number | undefined): string | null {
    const snapshot = inspect_file(path, uid);
    return snapshot.exists ? snapshot.source : null;
}

function has_model_instructions(root: string, uid: number | undefined): boolean {
    const candidates = [join(root, 'config.toml')];
    for (const name of readdirSync(root)) {
        if (name.endsWith('.config.toml')) candidates.push(join(root, name));
    }
    return candidates.some((path) => {
        const source = optional_source(path, uid);
        return source !== null && /^(?!\s*#)\s*model_instructions_file\s*=/m.test(source);
    });
}

function has_nonempty_instructions(path: string, uid: number | undefined): boolean {
    const source = optional_source(path, uid);
    return source !== null && /["']instructions["']\s*:\s*(?!\[\s*\])/m.test(source);
}

function resolve_target(
    harness: Harness,
    home: string,
    env: NodeJS.ProcessEnv,
    uid: number | undefined
): ResolvedTarget {
    if (harness === 'codex') {
        const configured = env.CODEX_HOME ?? join(home, '.codex');
        const root = require_directory(home, configured, 'CODEX_HOME');
        if (has_model_instructions(root, uid)) {
            throw new SetupFailure('model_instructions_file makes future profile selection ambiguous', 'unknown');
        }
        const override = join(root, 'AGENTS.override.md');
        if ((optional_source(override, uid) ?? '').trim().length > 0) {
            throw new SetupFailure('non-empty AGENTS.override.md shadows AGENTS.md');
        }
        return { harness, path: join(root, 'AGENTS.md'), body: AGENT_POLICY.replace(/\n$/, '') };
    }
    if (harness === 'claude-code') {
        const configured = env.CLAUDE_CONFIG_DIR ?? join(home, '.claude');
        const root = require_directory(home, configured, 'CLAUDE_CONFIG_DIR');
        return { harness, path: join(root, 'CLAUDE.md'), body: AGENT_POLICY.replace(/\n$/, '') };
    }
    if (harness === 'kimi-code') {
        const configured = env.KIMI_CODE_HOME ?? join(home, '.kimi-code');
        const root = require_directory(home, configured, 'KIMI_CODE_HOME');
        return { harness, path: join(root, 'AGENTS.md'), body: AGENT_POLICY.replace(/\n$/, '') };
    }
    if (harness === 'zcode') {
        const root = require_directory(home, join(home, '.zcode'), 'ZCode config directory');
        return { harness, path: join(root, 'AGENTS.md'), body: AGENT_POLICY.replace(/\n$/, '') };
    }
    for (const name of ['OPENCODE_CONFIG_DIR', 'XDG_CONFIG_HOME', 'OPENCODE_CONFIG', 'OPENCODE_CONFIG_CONTENT']) {
        if (env[name] !== undefined) throw new SetupFailure(`${name} is unsupported; OpenCode target is ambiguous`);
    }
    const root = require_directory(home, join(home, '.config', 'opencode'), 'OpenCode config directory');
    if (
        has_nonempty_instructions(join(root, 'opencode.json'), uid) ||
        has_nonempty_instructions(join(root, 'opencode.jsonc'), uid)
    ) {
        throw new SetupFailure('global OpenCode instructions are combined; setup refuses the conflict');
    }
    return {
        harness,
        path: join(root, 'AGENTS.md'),
        body: AGENT_POLICY.replace(/\n$/, ''),
        note: 'project-local rules are unassessed',
    };
}

function line_ending(source: string): string {
    return source.includes('\r\n') ? '\r\n' : '\n';
}

function build_fragment(body: string, eol: string, finalNewline: boolean, originalExisted: boolean): string {
    const normalizedBody = body.replace(/\r?\n/g, eol);
    const contentHash = sha256(normalizedBody);
    const origin = originalExisted ? 'existing' : 'missing';
    const start = `${START_PREFIX}version=${AGENT_POLICY_VERSION} policy=${AGENT_POLICY_SHA256} content=${contentHash} origin=${origin} -->`;
    const terminal = finalNewline ? eol : '';
    return `${start}${eol}${normalizedBody}${eol}${END_MARKER}${terminal}`;
}

function attach_fragment(source: string, body: string, originalExisted: boolean): string {
    const eol = line_ending(source);
    const finalNewline = source.length === 0 || source.endsWith('\n');
    const separator = source.length === 0 ? '' : eol;
    return `${source}${separator}${build_fragment(body, eol, finalNewline, originalExisted)}`;
}

function same_with_terminal_newline_normalized(source: string, expected: string): boolean {
    if (source === expected) return true;
    if (expected.endsWith('\r\n')) return source === expected.slice(0, -2);
    if (expected.endsWith('\n')) return source === expected.slice(0, -1);
    return source === `${expected}${line_ending(source)}`;
}

function parse_owned_span(source: string): OwnedSpan | null {
    const starts = [
        ...source.matchAll(
            /<!-- agent-policy version=(\d+) policy=([a-f0-9]{64}) content=([a-f0-9]{64}) origin=(missing|existing) -->/g
        ),
    ];
    const endCount = source.split(END_MARKER).length - 1;
    if (starts.length === 0 && endCount === 0) return null;
    if (starts.length !== 1 || endCount !== 1) throw new SetupFailure('malformed or duplicated agent policy marker');
    const match = starts[0];
    const markerStart = match.index ?? 0;
    const markerEnd = markerStart + match[0].length;
    let eol: string | null = null;
    if (source.startsWith('\r\n', markerEnd)) eol = '\r\n';
    else if (source.startsWith('\n', markerEnd)) eol = '\n';
    if (eol === null) throw new SetupFailure('agent policy marker has no body separator');
    const endMarkerAt = source.indexOf(END_MARKER, markerEnd + eol.length);
    const bodyEnd = endMarkerAt - eol.length;
    if (bodyEnd < markerEnd || source.slice(bodyEnd, endMarkerAt) !== eol) {
        throw new SetupFailure('agent policy marker has malformed closing separator');
    }
    const body = source.slice(markerEnd + eol.length, bodyEnd);
    if (sha256(body) !== match[3]) throw new SetupFailure('agent policy content drifted', 'drifted');
    if (sha256(`${body.replace(/\r\n/g, '\n')}\n`) !== match[2])
        throw new SetupFailure('agent policy bytes do not match its version', 'drifted');
    const policyKey = `${match[1]}:${match[2]}`;
    if (!RECOGNIZED_AGENT_POLICIES.has(policyKey))
        throw new SetupFailure('agent policy version is unrecognized', 'drifted');
    let end = endMarkerAt + END_MARKER.length;
    if (source.startsWith(eol, end)) end += eol.length;
    if (end !== source.length) throw new SetupFailure('agent policy must remain at the end of the file');
    let start = markerStart;
    if (markerStart > 0) {
        if (source.slice(markerStart - 2, markerStart) === '\r\n') start -= 2;
        else if (source[markerStart - 1] === '\n') start -= 1;
        else throw new SetupFailure('economy block lost its owned separator');
    }
    const prefix = source.slice(0, start);
    const originalExisted = match[4] === 'existing';
    if (!originalExisted && prefix.length > 0) {
        throw new SetupFailure('foreign content precedes a setup-created block');
    }
    return { start, end, prefix, policyKey, originalExisted };
}

function expected_target(
    source: string,
    body: string,
    existed: boolean
): { current: boolean; expected: string; original: string; originalExisted: boolean } {
    const owned = parse_owned_span(source);
    const original = owned === null ? source : owned.prefix;
    const originalExisted = owned?.originalExisted ?? existed;
    const expected = attach_fragment(original, body, originalExisted);
    return { current: same_with_terminal_newline_normalized(source, expected), expected, original, originalExisted };
}

function atomic_write(path: string, content: string, uid: number | undefined, expected: FileSnapshot): void {
    /* v8 ignore next -- requires a filesystem race */
    if (!same_snapshot(inspect_file(path, uid), expected))
        throw new SetupFailure(`target changed before write: ${path}`);
    const mode = expected.exists ? expected.mode & 0o777 : 0o600;
    const temp = join(dirname(path), `.${randomBytes(8).toString('hex')}.agent-policy.tmp`);
    const descriptor = openSync(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, mode);
    try {
        writeFileSync(descriptor, content, 'utf8');
        fsyncSync(descriptor);
    } finally {
        closeSync(descriptor);
    }
    try {
        /* v8 ignore next -- requires a filesystem race */
        if (!same_snapshot(inspect_file(path, uid), expected))
            throw new SetupFailure(`target changed during write: ${path}`);
        renameSync(temp, path);
        const parent = openSync(dirname(path), constants.O_RDONLY);
        try {
            fsyncSync(parent);
        } finally {
            closeSync(parent);
        }
    } /* v8 ignore next 3 -- requires an injected write or rename failure */ catch (caught) {
        rmSync(temp, { force: true });
        throw caught;
    }
}

function unlink_unchanged(path: string, uid: number | undefined, expected: FileSnapshot): void {
    /* v8 ignore next -- requires a filesystem race */
    if (!expected.exists || !same_snapshot(inspect_file(path, uid), expected)) {
        throw new SetupFailure(`target changed before removal: ${path}`);
    }
    unlinkSync(path);
}

function with_lock<T>(home: string, action: () => T): T {
    const lock = join(home, '.agent-policy.lock');
    let descriptor: number;
    try {
        descriptor = openSync(lock, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    } catch {
        throw new SetupFailure(`setup lock is held: ${lock}`);
    }
    closeSync(descriptor);
    try {
        return action();
    } finally {
        unlinkSync(lock);
    }
}

function execute(
    operation: Operation,
    harnesses: Harness[],
    yes: boolean,
    home: string,
    context: SetupContext
): SetupEnvelope {
    const mutating = (operation === 'install' || operation === 'remove') && yes;
    const work = (): SetupEnvelope => {
        const targets: TargetResult[] = [];
        for (const harness of harnesses) {
            try {
                const target = resolve_target(harness, home, context.env, context.uid);
                const snapshot =
                    operation === 'check'
                        ? inspect_twice(target.path, context.uid)
                        : inspect_file(target.path, context.uid);
                const source = snapshot.exists ? snapshot.source : '';
                const assessed = expected_target(source, target.body, snapshot.exists);
                if (operation === 'check') {
                    const state: State = assessed.current ? 'current' : 'missing';
                    targets.push({ harness, state, paths: [target.path], message: target.note });
                    continue;
                }
                if (operation === 'remove') {
                    const owned = parse_owned_span(source);
                    if (owned === null) {
                        targets.push({ harness, state: 'missing', paths: [target.path] });
                    } else if (!yes) {
                        targets.push({
                            harness,
                            state: 'changed',
                            paths: [target.path],
                            message: 'removal preview; rerun with --yes',
                        });
                    } else {
                        if (owned.originalExisted) atomic_write(target.path, owned.prefix, context.uid, snapshot);
                        else unlink_unchanged(target.path, context.uid, snapshot);
                        targets.push({ harness, state: 'changed', paths: [target.path] });
                    }
                    continue;
                }
                if (assessed.current) {
                    targets.push({
                        harness,
                        state: 'current',
                        paths: [target.path],
                        message: target.note,
                    });
                } else if (operation === 'dry-run') {
                    targets.push({ harness, state: 'changed', paths: [target.path], message: 'dry-run' });
                } else if (!yes) {
                    targets.push({
                        harness,
                        state: 'changed',
                        paths: [target.path],
                        message: 'install preview; rerun with --yes',
                    });
                } else {
                    atomic_write(target.path, assessed.expected, context.uid, snapshot);
                    targets.push({
                        harness,
                        state: 'changed',
                        paths: [target.path],
                        message: target.note,
                    });
                }
            } catch (caught) {
                const failure =
                    caught instanceof SetupFailure
                        ? caught
                        : new SetupFailure(caught instanceof Error ? caught.message : String(caught));
                targets.push({ harness, state: failure.state, paths: [], message: failure.message });
            }
        }
        return { version: '2', operation, ok: false, targets };
    };
    return mutating ? with_lock(home, work) : work();
}

export function run(argv: string[], contextOrCwd?: SetupContext | string): number {
    const context: SetupContext =
        typeof contextOrCwd === 'object'
            ? contextOrCwd
            : {
                  env: process.env,
                  stdout: (text) => process.stdout.write(text),
                  stderr: (text) => process.stderr.write(text),
                  uid: process.geteuid?.(),
              };
    const parsed = parse_flags(argv, SETUP_FLAG_SPEC);
    const operation = operation_from(parsed.flags);
    const json = parsed.flags.get('json') === true;
    try {
        if (parsed.errors.length > 0) return emit_usage(parsed.errors.join('; '), operation, json, context);
        if (parsed.unknown.length > 0)
            return emit_usage(`unknown option: ${parsed.unknown.join(', ')}`, operation, json, context);
        const modes = ['check', 'remove', 'dry-run'].filter((name) => parsed.flags.get(name) === true);
        if (modes.length > 1)
            return emit_usage('--check, --remove, and --dry-run are mutually exclusive', operation, json, context);
        if ((operation === 'check' || operation === 'dry-run') && parsed.flags.get('yes') === true) {
            return emit_usage('--yes is valid only for install or remove', operation, json, context);
        }
        if (parsed.positional.length === 0) return emit_usage('name at least one harness', operation, json, context);
        const unknownHarnesses = parsed.positional.filter((value) => !is_harness(value));
        if (unknownHarnesses.length > 0)
            return emit_usage(`unknown harness: ${unknownHarnesses.join(', ')}`, operation, json, context);
        const harnesses = parsed.positional as Harness[];
        if (new Set(harnesses).size !== harnesses.length)
            return emit_usage('harness identifiers must be unique', operation, json, context);
        const home = require_home(context.env);
        const envelope = execute(operation, harnesses, parsed.flags.get('yes') === true, home, context);
        const preview = (operation === 'install' || operation === 'remove') && parsed.flags.get('yes') !== true;
        return emit(envelope, json, context, preview ? 1 : undefined);
    } catch (caught) {
        return emit_usage(caught instanceof Error ? caught.message : String(caught), operation, json, context);
    }
}
