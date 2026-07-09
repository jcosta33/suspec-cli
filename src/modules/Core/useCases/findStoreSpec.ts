// Resolve a spec ref (id or slug) against the store's flat `spec-*.md` files (SPEC-suspec-v2
// AC-004) — the one store-spec lookup, shared by the launch resolver (`work`) and the evidence
// gate (`done`, which resolves the run's DRIVING spec by its recorded id). A frontmatter-id match
// wins; a slug (filename-tail) match is the fallback. The scan never joins the raw ref into a
// path — it only compares against names readdir returned — so a traversal-shaped ref can never
// escape the store. Read-only; null when nothing matches.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { fm_scalar, read_frontmatter } from '../services/readFrontmatter.ts';

export type FoundStoreSpec = Readonly<{ id: string; slug: string; path: string; source: string }>;

const SPEC_FILE = /^spec-(.+)\.md$/;

export function find_store_spec(storeDir: string, ref: string): FoundStoreSpec | null {
    if (!existsSync(storeDir)) {
        return null;
    }
    let names: string[];
    try {
        names = readdirSync(storeDir).sort();
    } catch {
        return null;
    }
    let bySlug: FoundStoreSpec | null = null;
    for (const name of names) {
        const match = SPEC_FILE.exec(name);
        if (match === null) {
            continue;
        }
        const path = join(storeDir, name);
        let source: string;
        try {
            source = readFileSync(path, 'utf8');
        } catch {
            continue; // a dir masquerading as spec-*.md — not an artifact, skip
        }
        const slug = match[1];
        const id = fm_scalar(read_frontmatter(source).id) ?? slug;
        if (id === ref) {
            return { id, slug, path, source };
        }
        if (slug === ref && bySlug === null) {
            bySlug = { id, slug, path, source };
        }
    }
    return bySlug;
}
