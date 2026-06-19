// Build the `anchor_resolves` predicate the citation check (C015) injects: does a `[[KEY]]` citation
// resolve to a matching `<a id="KEY">` anchor in the workspace's sources.md? Reads the filesystem;
// the engine (check_spec) stays pure by taking the resulting predicate (mirrors C009's `exists` and
// C010's `spec_ref_resolves`).
//
// The sources.md is the one the spec's own frontmatter `sources:` names — the self-contained source
// the dangling case actually arose from (ADR-0087 Decision 2). When no `sources.md` entry is found,
// or it cannot be read, the predicate admits EVERY key (the skip-when-nothing-to-check rule, ADR-0087
// Decision 3) so a spec that names no resolvable sources.md is never false-flagged.

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

import { parse_spec_record } from '../../Sol/useCases/index.ts';

// Every `<a id="…">` anchor declared in a sources.md (the HTML anchor the `[[KEY]]` form links).
const ANCHOR_PATTERN = /<a\s+id="([^"]+)"/g;

function extract_anchors(sourcesText: string): Set<string> {
    const anchors = new Set<string>();
    for (const match of sourcesText.matchAll(ANCHOR_PATTERN)) {
        anchors.add(match[1]);
    }
    return anchors;
}

// The admit-every-key resolver — the skip when nothing is resolvable (never false-flags).
const ADMIT_ALL = (): boolean => true;

// Build the C015 resolver for one spec. `specSource` is the spec's text (so the frontmatter
// `sources:` can be read), `specPath` its on-disk path (so a sources.md ref resolves relative to it).
export function build_anchor_resolver(specSource: string, specPath: string): (key: string) => boolean {
    const parsed = parse_spec_record({ source: specSource, path: specPath });
    if (!parsed.ok) {
        return ADMIT_ALL;
    }
    // The frontmatter `sources:` entry whose path ends in `sources.md` (the citation bibliography).
    const sourcesRef = parsed.value.frontmatter.sources.find((ref) => /(^|\/)sources\.md$/.test(ref));
    if (sourcesRef === undefined) {
        return ADMIT_ALL;
    }
    const sourcesPath = resolve(dirname(specPath), sourcesRef);
    if (!existsSync(sourcesPath)) {
        return ADMIT_ALL;
    }
    let sourcesText: string;
    try {
        sourcesText = readFileSync(sourcesPath, 'utf8');
    } catch {
        return ADMIT_ALL;
    }
    const anchors = extract_anchors(sourcesText);
    return (key: string) => anchors.has(key);
}
