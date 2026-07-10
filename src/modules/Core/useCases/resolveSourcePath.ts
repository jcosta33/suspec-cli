// C009 (`broken-source-link`) resolution base. A spec's `sources:`/requirement ref is checked
// against the filesystem to decide whether it resolves — ARTIFACT-RELATIVE (ADR-0143 D4): a ref
// resolves against the passed spec's own directory, never a workspace root. A ref living elsewhere
// is written as a relative path from the spec (`../intake/x.md`); only a ref that does not exist
// relative to the spec's directory is a broken C009 link. Builds the injected `exists` predicate so
// the engine (check_spec) stays pure.

import { existsSync } from 'fs';
import { dirname, resolve } from 'path';

export function build_source_exists(specPath: string): (ref: string) => boolean {
    const specDir = dirname(resolve(specPath));
    return (ref: string) => existsSync(resolve(specDir, ref));
}
