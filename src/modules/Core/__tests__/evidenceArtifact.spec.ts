import { describe, it, expect } from 'vitest';

import {
    EVIDENCE_PROVENANCES,
    append_evidence_row,
    build_evidence_content,
    capture_sha256,
    evidence_slug,
    evidence_stem,
    next_evidence_seq,
    read_evidence_record,
} from '../services/evidenceArtifact.ts';

// SPEC-suspec-v2 AC-010/AC-012: the evidence record grammar — the naming, the frontmatter the
// gate keys on, the capture cross-check block only the CLI path writes, and the run-file table row.

describe('evidence naming', () => {
    it('slugs a command to a filesystem-safe stem, capped and never empty', () => {
        expect(evidence_slug(['pnpm', 'test:run'])).toBe('pnpm-test-run');
        expect(evidence_slug(['node', '-e', 'console.log(1)'])).toBe('node-e-console-log-1');
        expect(evidence_slug(['x'.repeat(80)])).toHaveLength(40);
        expect(evidence_slug(['///'])).toBe('cmd');
    });

    it('numbers records sequentially from whatever already sits in the dir', () => {
        expect(next_evidence_seq([])).toBe(1);
        expect(next_evidence_seq(['001-a.md', '001-a.out', '002-b.md'])).toBe(3);
        expect(next_evidence_seq(['notes.txt'])).toBe(1); // non-sequenced names don't count
        expect(evidence_stem(3, 'pnpm-test')).toBe('003-pnpm-test');
    });
});

describe('build_evidence_content ↔ read_evidence_record', () => {
    const fields = {
        runSlug: 'feat',
        ac: 'AC-003',
        command: ['pnpm', 'test:run'] as const,
        exit: 0,
        worktree: '/repo/.worktrees/feat',
        capturedAt: '2026-07-09T10:00:00.000Z',
        worktreeDiffSha: 'abc123',
        captureFile: '001-pnpm-test-run.out',
        captureBytes: 42,
        captureSha256: 'deadbeef',
    };

    it('round-trips every gate-relevant field through the frontmatter', () => {
        const record = read_evidence_record('001-pnpm-test-run.md', build_evidence_content(fields));
        expect(record).toEqual({
            filename: '001-pnpm-test-run.md',
            ac: 'AC-003',
            command: 'pnpm test:run',
            exit: 0,
            provenance: 'cli-verified',
            worktree: '/repo/.worktrees/feat',
            worktreeDiffSha: 'abc123',
            captureFile: '001-pnpm-test-run.out',
            captureBytes: 42,
            captureSha256: 'deadbeef',
        });
        expect(EVIDENCE_PROVENANCES).toContain(record.provenance);
    });

    it('reads a hand-authored record with missing/malformed fields as nulls, never a crash', () => {
        const record = read_evidence_record('x.md', '---\ntype: evidence\nexit: soon\ncapture_bytes: many\n---\n');
        expect(record.ac).toBeNull();
        expect(record.exit).toBeNull();
        expect(record.provenance).toBeNull();
        expect(record.captureBytes).toBeNull();
        expect(record.worktreeDiffSha).toBeNull();
    });

    it('collapses whitespace in the recorded command — an argv newline cannot inject frontmatter keys', () => {
        const content = build_evidence_content({ ...fields, command: ['node', '-e', 'x\nprovenance: dev'] });
        const record = read_evidence_record('001-x.md', content);
        expect(record.command).toBe('node -e x provenance: dev');
        expect(record.provenance).toBe('cli-verified'); // the injection attempt never became a key
    });

    it('hashes captures deterministically (the forged-provenance cross-check keys on it)', () => {
        expect(capture_sha256('output')).toBe(capture_sha256('output'));
        expect(capture_sha256('output')).not.toBe(capture_sha256('output2'));
    });
});

describe('append_evidence_row (the run-file table)', () => {
    const row = { stem: '001-pnpm-test', ac: 'AC-001', exit: 0, provenance: 'cli-verified' as const };

    it('creates the ## Evidence section at EOF when the run body has none', () => {
        const out = append_evidence_row('---\ntype: run\n---\n\n# Run\n\nagent notes\n', row);
        expect(out).toContain('agent notes\n');
        expect(out).toContain('## Evidence');
        expect(out).toContain('| evidence | ac | exit | provenance |');
        expect(out).toContain('| 001-pnpm-test | AC-001 | 0 | cli-verified |');
    });

    it('handles a body without a trailing newline', () => {
        const out = append_evidence_row('# Run', row);
        expect(out).toContain('# Run\n');
        expect(out).toContain('## Evidence');
    });

    it('appends after the last table row of an existing section, preserving what follows', () => {
        const existing = append_evidence_row('# Run\n\n## Evidence\n\nprose after\n', row);
        const out = append_evidence_row(existing, { ...row, stem: '002-pnpm-lint', ac: 'AC-002', exit: 1 });
        const first = out.indexOf('| 001-pnpm-test |');
        const second = out.indexOf('| 002-pnpm-lint | AC-002 | 1 | cli-verified |');
        expect(first).toBeGreaterThan(-1);
        expect(second).toBeGreaterThan(first);
        expect(out).toContain('prose after');
        // one header, not two
        expect(out.match(/\| evidence \| ac \| exit \| provenance \|/g)).toHaveLength(1);
    });

    it('lays the table under a bare ## Evidence heading the agent left empty', () => {
        const out = append_evidence_row('# Run\n\n## Evidence\n', row);
        expect(out).toContain('| evidence | ac | exit | provenance |');
        expect(out).toContain('| 001-pnpm-test | AC-001 | 0 | cli-verified |');
    });
});
