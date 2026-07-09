// Resolve one finding from the store's flat `finding-*.md` files by id or filename
// (SPEC-suspec-v2 AC-016/AC-017) — the lookup `suspec promote <FIND>` and `suspec fix <FIND>`
// share. A frontmatter-id match or a filename match (with or without `.md`) both resolve; the
// scan only compares against names readdir returned, so a traversal-shaped ref can never escape
// the store. `includeArchived` extends the scan into `archive/` (the `fix` face resurrects
// archived findings; `promote` works open ones only). Read-only; null when nothing matches.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { fm_scalar, read_frontmatter } from '../services/readFrontmatter.ts';
import { archive_dir } from '../services/storeLayout.ts';

export type StoreFinding = Readonly<{
    filename: string; // the flat store basename, e.g. finding-007.md
    path: string;
    source: string;
    body: string; // the source minus its frontmatter block — what a fix-spec scaffold carries over
    id: string | null;
    title: string; // the first `# ` heading, else the filename
    run: string | null;
    severity: string | null;
    affectedAreas: readonly string[];
    archived: boolean;
}>;

const FINDING_FILE = /^finding-.+\.md$/;

// The body below a leading `---` frontmatter block, or the whole text when there is none (or the
// fence never closes — keep everything rather than guess).
function strip_frontmatter(source: string): string {
    const lines = source.split(/\r\n|[\r\n]/);
    /* v8 ignore next 3 -- a resolved finding always parsed a frontmatter `type:`, so a fence-less source cannot reach here */
    if (lines[0] !== '---') {
        return source.trim();
    }
    let close = 1;
    while (close < lines.length && lines[close] !== '---') {
        close += 1;
    }
    if (close >= lines.length) {
        return source.trim();
    }
    return lines
        .slice(close + 1)
        .join('\n')
        .trim();
}

function scan_dir(dir: string, ref: string, archived: boolean): StoreFinding | null {
    if (!existsSync(dir)) {
        return null;
    }
    let names: string[];
    try {
        names = readdirSync(dir).sort();
    } catch {
        return null;
    }
    for (const name of names) {
        if (!FINDING_FILE.test(name)) {
            continue;
        }
        const path = join(dir, name);
        let source: string;
        try {
            source = readFileSync(path, 'utf8');
        } catch {
            continue; // a dir masquerading as finding-*.md — not an artifact, skip
        }
        const fm = read_frontmatter(source);
        if (fm_scalar(fm.type) !== 'finding') {
            continue;
        }
        const id = fm_scalar(fm.id) ?? null;
        if (id !== ref && name !== ref && name !== `${ref}.md`) {
            continue;
        }
        const heading = /^#\s+(.+)$/m.exec(source);
        const rawAreas = fm.affected_areas ?? [];
        return {
            filename: name,
            path,
            source,
            body: strip_frontmatter(source),
            id,
            title: heading !== null ? heading[1].trim() : name,
            run: fm_scalar(fm.run) ?? null,
            severity: fm_scalar(fm.severity) ?? null,
            affectedAreas: typeof rawAreas === 'string' ? [rawAreas] : [...rawAreas],
            archived,
        };
    }
    return null;
}

export function find_store_finding(
    storeDir: string,
    ref: string,
    opts: Readonly<{ includeArchived?: boolean }> = {}
): StoreFinding | null {
    const open = scan_dir(storeDir, ref, false);
    if (open !== null) {
        return open;
    }
    if (opts.includeArchived !== true) {
        return null;
    }
    return scan_dir(archive_dir(storeDir), ref, true);
}
