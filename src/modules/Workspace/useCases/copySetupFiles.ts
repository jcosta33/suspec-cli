// The `setup_copy` copier (SPEC-suspec-v2 AC-005): copy the allowlisted (typically gitignored)
// files declared in suspec.config.json from the repo root into the worktree — `.env.local` and
// friends, which a fresh worktree checkout never carries. The declared list IS the allowlist, and
// every entry is repo-root-relative: an ABSOLUTE path, one ESCAPING the repo, or a SYMLINK (the
// link would defeat the escape guard — its content can come from anywhere) is refused (never
// copied), and a missing source is reported — the command decides whether a failure blocks the
// launch (AC-005's runtime rule) or stays a warning. A Workspace leaf beside runSetup.ts: file
// edges live here, not in Core.

import { copyFileSync, existsSync, lstatSync, mkdirSync } from 'fs';
import { dirname, isAbsolute, join, resolve, sep } from 'path';

export type SetupCopyResult = Readonly<{
    path: string; // the declared entry, verbatim
    ok: boolean;
    reason: string | null; // why the copy did not happen; null on success
}>;

// One declared entry: validate, then copy. The refusal reasons are the contract the command prints.
function copy_one(repoRoot: string, worktreePath: string, path: string): SetupCopyResult {
    if (isAbsolute(path)) {
        return { path, ok: false, reason: 'absolute path refused — setup_copy paths are repo-root-relative' };
    }
    const source = resolve(repoRoot, path);
    if (!source.startsWith(resolve(repoRoot) + sep)) {
        return { path, ok: false, reason: 'path escapes the repo root — refused' };
    }
    if (!existsSync(source)) {
        return { path, ok: false, reason: 'not found in the repo root' };
    }
    // lstat the SOURCE (not its target): a symlink at the declared path defeats the escape guard
    // above — the link itself lives inside the repo while its content can come from anywhere
    // (`.env.local -> /etc/passwd`). Refused with a clear reason, never followed.
    try {
        if (lstatSync(source).isSymbolicLink()) {
            return {
                path,
                ok: false,
                reason: 'symlink refused — setup_copy copies regular files only (the link could point outside the repo)',
            };
        }
        // The same relative entry lands at the same relative spot in the worktree; the escape
        // guard above bounds it there too (identical relative path, identical containment).
        const target = join(resolve(worktreePath), path);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(source, target);
        return { path, ok: true, reason: null };
    } catch (caught: unknown) {
        return { path, ok: false, reason: caught instanceof Error ? caught.message : String(caught) };
    }
}

export function copy_setup_files(
    repoRoot: string,
    worktreePath: string,
    paths: readonly string[]
): readonly SetupCopyResult[] {
    return paths.map((path) => copy_one(repoRoot, worktreePath, path));
}
