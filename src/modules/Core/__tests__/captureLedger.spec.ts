import { describe, it, expect } from 'vitest';

import {
    build_ledger_line,
    capture_ledger_path,
    latest_launch_line,
    ledger_backs_record,
    parse_capture_ledger,
    spec_content_sha256,
    type CaptureLedgerEntry,
} from '../services/captureLedger.ts';
import type { EvidenceRecord } from '../services/evidenceArtifact.ts';

// The CLI-owned capture ledger's pure grammar: path derivation, line build/parse (crash-tolerant
// JSONL), record backing, and the latest-launch-line rule.

const CAPTURE: CaptureLedgerEntry = {
    kind: 'capture',
    run: 'feat',
    seq: 1,
    file: '001-cmd.out',
    sha256: 'abc',
    bytes: 3,
    exit: 0,
    command: 'pnpm test:run',
    ts: '2026-07-09T00:00:00.000Z',
};

function record(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
    return {
        filename: '001-cmd.md',
        ac: 'AC-001',
        command: 'pnpm test:run',
        exit: 0,
        provenance: 'cli-verified',
        worktree: '/wt',
        worktreeDiffSha: 'x',
        captureFile: '001-cmd.out',
        captureBytes: 3,
        captureSha256: 'abc',
        ...overrides,
    };
}

describe('capture ledger — pure grammar', () => {
    it('derives the ledger path OUTSIDE the store dir: <state-root>/.captures/<store-dirname>.jsonl', () => {
        expect(capture_ledger_path('/home/u/.claude/state/proj-2')).toBe(
            '/home/u/.claude/state/.captures/proj-2.jsonl'
        );
    });

    it('round-trips a line and skips malformed / truncated / non-object / unknown-kind lines', () => {
        const content = [
            build_ledger_line(CAPTURE).trimEnd(),
            '{ truncated by a crash',
            '42',
            'null',
            '{"kind":"mystery"}',
            '',
        ].join('\n');
        const entries = parse_capture_ledger(content);
        expect(entries).toEqual([CAPTURE]);
    });

    it('backs a record only when run + file + sha256 + bytes + exit ALL match', () => {
        const entries = [CAPTURE];
        expect(ledger_backs_record(entries, 'feat', record())).toBe(true);
        expect(ledger_backs_record(entries, 'other-run', record())).toBe(false);
        expect(ledger_backs_record(entries, 'feat', record({ captureSha256: 'evil' }))).toBe(false);
        expect(ledger_backs_record(entries, 'feat', record({ captureBytes: 999 }))).toBe(false);
        expect(ledger_backs_record(entries, 'feat', record({ exit: 1 }))).toBe(false);
        expect(ledger_backs_record(entries, 'feat', record({ captureFile: '002-cmd.out' }))).toBe(false);
    });

    it('latest_launch_line returns the NEWEST launch line for the run, null when none', () => {
        const launches: CaptureLedgerEntry[] = [
            { kind: 'launch', run: 'feat', spec_id: 'SPEC-a', spec_sha256: '1', ts: 't1' },
            { kind: 'launch', run: 'other', spec_id: 'SPEC-x', spec_sha256: '9', ts: 't2' },
            { kind: 'launch', run: 'feat', spec_id: 'SPEC-a', spec_sha256: '2', ts: 't3' },
            CAPTURE,
        ];
        expect(latest_launch_line(launches, 'feat')).toMatchObject({ spec_sha256: '2' });
        expect(latest_launch_line(launches, 'ghost')).toBeNull();
        expect(latest_launch_line([], 'feat')).toBeNull();
    });

    it('spec_content_sha256 is a plain utf8 sha256', () => {
        expect(spec_content_sha256('abc')).toBe(
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
        );
    });
});
