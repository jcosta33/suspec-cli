// Atomic store writes (SPEC-suspec-v2 AC-003): every store write lands in a temp file in the same
// directory and is renamed over the target, so a crash mid-write leaves no partial artifact — the
// target either holds the old content or the new, never a torn write. Markdown artifacts the CLI
// authors get `grammar_version: <current>` injected into frontmatter when absent; a recorded
// version is never touched here — `migrate_store` is the only function allowed to rewrite
// pre-existing artifacts. Non-markdown payloads (evidence captures) pass through byte-identical.

import { randomBytes } from 'crypto';
import { existsSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';

import { ok, err, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { ensure_grammar_version } from '../services/grammarVersion.ts';

export type WriteStoreArtifactOptions = Readonly<{
    // Injectable rename so the crash-mid-write path is testable; defaults to fs.renameSync.
    rename?: (from: string, to: string) => void;
}>;

export function write_store_artifact(
    path: string,
    content: string,
    options?: WriteStoreArtifactOptions
): Result<{ path: string }, AppError> {
    const finalContent = path.endsWith('.md') ? ensure_grammar_version(content) : content;
    // The temp lives in the target's own directory — rename() is only atomic within a filesystem.
    const temp = join(dirname(path), `.${basename(path)}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`);
    const rename = options?.rename ?? renameSync;
    try {
        writeFileSync(temp, finalContent, 'utf8');
        rename(temp, path);
    } catch (cause) {
        // A failed write must leave nothing behind: the target was never touched, and the temp —
        // if it got as far as existing — is removed.
        if (existsSync(temp)) {
            unlinkSync(temp);
        }
        return err(createAppError('store_write_failed', `Atomic write failed for ${path}`, { path }, cause));
    }
    return ok({ path });
}
