// The `setup_copy` copier (SPEC-suspec-v2 AC-005): copy the allowlisted (typically gitignored)
// files declared in suspec.config.json from the repo root into the worktree — `.env.local` and
// friends, which a fresh worktree checkout never carries. The declared list IS the allowlist, and
// every entry is repo-root-relative: an ABSOLUTE path or one ESCAPING the repo is refused (never
// copied), and a missing source is reported — the command decides whether a failure blocks the
// launch (AC-005's runtime rule) or stays a warning. A Workspace leaf beside runSetup.ts: file
// edges live here, not in Core.

import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, isAbsolute, join, resolve, sep } from 'path';

export type SetupCopyResult = Readonly<{
    path: string; // the declared entry, verbatim
    ok: boolean;
    reason: string | null; // why the copy did not happen; null on success
}>;

export function copy_setup_files(
    repoRoot: string,
    worktreePath: string,
    paths: readonly string[]
): readonly SetupCopyResult[] {
    const results: SetupCopyResult[] = [];
    const rootPrefix = resolve(repoRoot) + sep;
    for (const path of paths) {
        if (isAbsolute(path)) {
            results.push({
                path,
                ok: false,
                reason: 'absolute path refused — setup_copy paths are repo-root-relative',
            });
            continue;
        }
        const source = resolve(repoRoot, path);
        if (!source.startsWith(rootPrefix)) {
            results.push({ path, ok: false, reason: 'path escapes the repo root — refused' });
            continue;
        }
        if (!existsSync(source)) {
            results.push({ path, ok: false, reason: 'not found in the repo root' });
            continue;
        }
        // The same relative entry lands at the same relative spot in the worktree; the escape guard
        // above bounds it there too (identical relative path, identical containment).
        const target = join(resolve(worktreePath), path);
        try {
            mkdirSync(dirname(target), { recursive: true });
            copyFileSync(source, target);
            results.push({ path, ok: true, reason: null });
        } catch (caught: unknown) {
            results.push({ path, ok: false, reason: caught instanceof Error ? caught.message : String(caught) });
        }
    }
    return results;
}
