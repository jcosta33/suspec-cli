// List a run's evidence records from `evidence/<run>/` (SPEC-suspec-v2 AC-010..013) — the read
// half the gate (`done`) and the artifact lint share. Every `*.md` in the run's evidence dir is
// parsed into the common EvidenceRecord view, whoever wrote it (the CLI capture path, an agent, a
// hand edit) — absent fields read null so the consumers surface gaps instead of crashing. A
// missing dir is an empty list (a run with no evidence yet), never an error.

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { evidence_dir } from '../services/storeLayout.ts';
import { read_evidence_record, type EvidenceRecord } from '../services/evidenceArtifact.ts';

export function list_evidence_records(storeDir: string, runSlug: string): EvidenceRecord[] {
    const dir = evidence_dir(storeDir, runSlug);
    // readdir inside the try: the dir can vanish between an existence probe and the read (TOCTOU)
    // — a run with no readable evidence dir simply has no records.
    let names: string[];
    try {
        names = readdirSync(dir).sort();
    } catch {
        return [];
    }
    const records: EvidenceRecord[] = [];
    for (const name of names) {
        if (!name.endsWith('.md')) {
            continue;
        }
        let content: string;
        try {
            content = readFileSync(join(dir, name), 'utf8');
        } catch {
            continue; // a dir masquerading as *.md — not a record, skip
        }
        records.push(read_evidence_record(name, content));
    }
    return records;
}
