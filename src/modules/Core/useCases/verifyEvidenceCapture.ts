// Verify one evidence record's CAPTURE BLOCK against the raw output file stored beside it
// (SPEC-suspec-v2 AC-010/AC-013) — the honesty cross-check behind `provenance: cli-verified`.
// The CLI capture path is the only writer of a consistent block: `capture_file` must be this
// record's own stem (a hand-authored record cannot point at another record's capture), the raw
// file must exist, and its bytes must hash to `capture_sha256` at `capture_bytes` length. Any
// miss means the cli-verified claim is unbacked — the lint flags it as forged and the gate
// refuses to count it. Read-only.

import { readFileSync, statSync } from 'fs';
import { join } from 'path';

import { evidence_dir } from '../services/storeLayout.ts';
import { capture_sha256, type EvidenceRecord } from '../services/evidenceArtifact.ts';

export function verify_evidence_capture(storeDir: string, runSlug: string, record: EvidenceRecord): boolean {
    if (record.captureFile === null || record.captureBytes === null || record.captureSha256 === null) {
        return false;
    }
    // The capture must be the record's OWN: `<stem>.md` ↔ `<stem>.out`, same dir.
    const stem = record.filename.replace(/\.md$/, '');
    if (record.captureFile !== `${stem}.out`) {
        return false;
    }
    const rawPath = join(evidence_dir(storeDir, runSlug), record.captureFile);
    // stat + read inside one try: the file can vanish between any two of these calls (TOCTOU) —
    // an unreadable capture is an unbacked claim, never a crash.
    let raw: Buffer;
    try {
        if (!statSync(rawPath).isFile()) {
            return false;
        }
        // Raw BYTES — the capture is byte-exact, so the hash/length check must not decode.
        raw = readFileSync(rawPath);
    } catch {
        return false;
    }
    return raw.length === record.captureBytes && capture_sha256(raw) === record.captureSha256;
}
