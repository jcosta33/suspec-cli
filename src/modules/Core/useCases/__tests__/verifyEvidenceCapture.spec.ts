import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { verify_evidence_capture } from '../verifyEvidenceCapture.ts';
import { capture_sha256, type EvidenceRecord } from '../../services/evidenceArtifact.ts';

// SPEC-suspec-v2 AC-010/AC-013: the capture cross-check — the structural marker only the CLI
// writes. A hand-authored `provenance: cli-verified` cannot back it, so the lint/gate refuse it.

let store: string;
let dir: string;

const RAW = 'test output\n';

function record(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
    return {
        filename: '001-cmd.md',
        ac: 'AC-001',
        command: 'cmd',
        exit: 0,
        provenance: 'cli-verified',
        worktree: '/wt',
        worktreeDiffSha: 'x',
        captureFile: '001-cmd.out',
        captureBytes: Buffer.byteLength(RAW, 'utf8'),
        captureSha256: capture_sha256(RAW),
        ...overrides,
    };
}

beforeEach(() => {
    store = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-capture-'));
    dir = join(store, 'evidence', 'feat');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '001-cmd.out'), RAW);
});

afterEach(() => {
    rmSync(store, { recursive: true, force: true });
});

describe('verify_evidence_capture', () => {
    it('accepts a consistent CLI-written capture block', () => {
        expect(verify_evidence_capture(store, 'feat', record())).toBe(true);
    });

    it('refuses a record with no capture block at all (the hand-authored forgery)', () => {
        expect(
            verify_evidence_capture(store, 'feat', record({ captureFile: null, captureBytes: null, captureSha256: null }))
        ).toBe(false);
        expect(verify_evidence_capture(store, 'feat', record({ captureBytes: null }))).toBe(false);
    });

    it('refuses a capture that is not the record\'s own (pointing at another record\'s .out)', () => {
        writeFileSync(join(dir, '002-other.out'), RAW);
        expect(verify_evidence_capture(store, 'feat', record({ captureFile: '002-other.out' }))).toBe(false);
    });

    it('refuses a missing raw file, a directory squatting on it, and a tampered hash/length', () => {
        expect(verify_evidence_capture(store, 'feat', record({ filename: '003-x.md', captureFile: '003-x.out' }))).toBe(
            false
        );
        mkdirSync(join(dir, '004-dir.out'));
        expect(
            verify_evidence_capture(store, 'feat', record({ filename: '004-dir.md', captureFile: '004-dir.out' }))
        ).toBe(false);
        expect(verify_evidence_capture(store, 'feat', record({ captureSha256: 'not-the-hash' }))).toBe(false);
        expect(verify_evidence_capture(store, 'feat', record({ captureBytes: 999 }))).toBe(false);
    });
});
