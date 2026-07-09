// List the OPEN finding artifacts linked to one run (SPEC-suspec-v2 AC-015) — the set `done`
// triages. A finding is linked by its frontmatter `run:` and open by position: it sits in the
// store ROOT (archive/ is the closed state — discard moves it there, promote archives it after
// the gh issue exists). Flat `finding-*.md` only, per the store layout (AC-002). Read-only.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { fm_scalar, read_frontmatter } from '../services/readFrontmatter.ts';

export type OpenFinding = Readonly<{
    filename: string; // the flat store basename, e.g. finding-007.md
    path: string;
    id: string | null;
    title: string; // the first `# ` heading, else the filename
    severity: string | null; // `critical` findings are never discardable by default
    expires: string | null; // the keep/defer expiry stamp, when one was set
}>;

const FINDING_FILE = /^finding-.+\.md$/;

export function list_open_findings(storeDir: string, runSlug: string): OpenFinding[] {
    if (!existsSync(storeDir)) {
        return [];
    }
    const findings: OpenFinding[] = [];
    for (const name of readdirSync(storeDir).sort()) {
        if (!FINDING_FILE.test(name)) {
            continue;
        }
        const path = join(storeDir, name);
        let source: string;
        try {
            source = readFileSync(path, 'utf8');
        } catch {
            continue; // a dir masquerading as finding-*.md — not an artifact, skip
        }
        const fm = read_frontmatter(source);
        if (fm_scalar(fm.type) !== 'finding' || fm_scalar(fm.run) !== runSlug) {
            continue;
        }
        const heading = /^#\s+(.+)$/m.exec(source);
        findings.push({
            filename: name,
            path,
            id: fm_scalar(fm.id) ?? null,
            title: heading !== null ? heading[1].trim() : name,
            severity: fm_scalar(fm.severity) ?? null,
            expires: fm_scalar(fm.expires) ?? null,
        });
    }
    return findings;
}
