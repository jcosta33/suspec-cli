// List the ACTIVE specs in the store root (SPEC-suspec-v2 AC-019) — the WIP-cap count `suspec
// work` gates on. Active = a flat `spec-*.md` whose frontmatter `status` is `ready` or `live`
// (draft work-in-writing and terminal statuses do not occupy a WIP slot; an archived spec left
// the root entirely). Read-only.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { fm_scalar, read_frontmatter } from '../services/readFrontmatter.ts';

export type ActiveSpec = Readonly<{ slug: string; id: string; status: string }>;

const SPEC_FILE = /^spec-(.+)\.md$/;
const ACTIVE_STATUSES = new Set(['ready', 'live']);

export function list_active_specs(storeDir: string): ActiveSpec[] {
    if (!existsSync(storeDir)) {
        return [];
    }
    const active: ActiveSpec[] = [];
    for (const name of readdirSync(storeDir).sort()) {
        const match = SPEC_FILE.exec(name);
        if (match === null) {
            continue;
        }
        let source: string;
        try {
            source = readFileSync(join(storeDir, name), 'utf8');
        } catch {
            continue; // a dir masquerading as spec-*.md — not an artifact, skip
        }
        const fm = read_frontmatter(source);
        const status = fm_scalar(fm.status) ?? '';
        if (!ACTIVE_STATUSES.has(status)) {
            continue;
        }
        const slug = match[1];
        active.push({ slug, id: fm_scalar(fm.id) ?? slug, status });
    }
    return active;
}
