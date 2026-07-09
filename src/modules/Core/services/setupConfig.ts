// Setup commands (SPEC-suspec-cli-work AC-003; setup v2 SPEC-suspec-v2 AC-005): the optional
// `setup` block in the consumer-side `suspec.config.json` — a list of command strings `suspec work`
// runs in the fresh worktree before it launches the agent — plus the v2 faces: the `setup_copy`
// allowlist of gitignored files to copy into the worktree, and the lockfile AUTODETECT fallback
// used when no `setup` is declared. Pure parsers beside runtimeIsolation.ts (use-cases depend on
// services, never the reverse); the disk reads live in the resolve_setup_plan use-case. Any shape that is not a list of non-empty strings parses to an
// empty list — setup is then a no-op.

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function parse_setup_config(raw: unknown): readonly string[] {
    if (!is_record(raw)) {
        return [];
    }
    const setup = raw.setup;
    if (!Array.isArray(setup)) {
        return [];
    }
    return setup.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

// The `setup_copy` allowlist (AC-005): repo-root-relative paths of (typically gitignored) files to
// copy into the worktree, e.g. `.env.local`. The declared list IS the allowlist — the copier
// (copy_setup_files) refuses absolute paths and paths escaping the repo.
export function parse_setup_copy(raw: unknown): readonly string[] {
    if (!is_record(raw)) {
        return [];
    }
    const copy = raw.setup_copy;
    if (!Array.isArray(copy)) {
        return [];
    }
    return copy.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

// The JS package managers are alternatives — one repo, one manager — so the FIRST matching
// lockfile wins, in this order.
const JS_LOCKFILES: readonly (readonly [string, string])[] = [
    ['pnpm-lock.yaml', 'pnpm install'],
    ['package-lock.json', 'npm ci'],
    ['yarn.lock', 'yarn install --frozen-lockfile'],
];

// Lockfile autodetect (AC-005): when no `setup` is declared, infer the install commands from the
// manifest/lockfiles present. JS: first match wins; Cargo is additive (a polyglot repo installs
// both); Python prefers `uv.lock` over `requirements.txt` (uv's lock subsumes it). `exists` is the
// caller-supplied probe (a file name, repo-root-relative), so the table stays pure.
export function detect_setup_commands(exists: (name: string) => boolean): readonly string[] {
    const out: string[] = [];
    for (const [file, command] of JS_LOCKFILES) {
        if (exists(file)) {
            out.push(command);
            break;
        }
    }
    if (exists('Cargo.toml')) {
        out.push('cargo fetch');
    }
    if (exists('uv.lock')) {
        out.push('uv sync');
    } else if (exists('requirements.txt')) {
        out.push('pip install -r requirements.txt');
    }
    return out;
}
