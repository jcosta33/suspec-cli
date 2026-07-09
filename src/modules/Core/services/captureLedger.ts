// The CLI-owned capture ledger (hardening AC-010/AC-011 against evidence forgery). The evidence
// record + raw output pair under `evidence/<run>/` lives INSIDE the store dir, which the agent
// writes directly — so a self-consistent .md/.out pair can be forged wholesale. The ledger is the
// CLI's own append-only record of what IT captured, kept OUTSIDE the store dir at
// `<state-root>/.captures/<store-dirname>.jsonl` (a sibling of the stores): `evidence add`
// appends a capture line per record it writes, `work` appends a launch line binding the run to
// the driving spec's content hash, and `done` cross-checks both.
//
// HONESTY NOTE (partial defense, ADR-0137 D6): this defeats sandboxed runners (writable_roots =
// the store dir only, per D2's adapter note) and casual in-store forgery. A same-user UNSANDBOXED
// agent can write the ledger file too — the ledger raises the bar, it is not a cryptographic
// authority. Durable trust still comes from promotion (tests, PRs), never from store artifacts.
//
// PURE: line building/parsing/matching only — the append/read fs edges live in the sibling use
// cases (appendCaptureLedgerLine / readCaptureLedger).

import { createHash } from 'crypto';
import { basename, dirname, join } from 'path';

import type { EvidenceRecord } from './evidenceArtifact.ts';

export type CaptureLedgerCaptureEntry = Readonly<{
    kind: 'capture';
    run: string;
    seq: number;
    file: string; // the `<seq>-<slug>.out` raw-capture basename
    sha256: string;
    bytes: number;
    exit: number;
    command: string;
    ts: string; // ISO timestamp
}>;

export type CaptureLedgerLaunchEntry = Readonly<{
    kind: 'launch';
    run: string;
    spec_id: string;
    spec_sha256: string; // sha256 of the driving spec's content at launch
    ts: string;
}>;

export type CaptureLedgerEntry = CaptureLedgerCaptureEntry | CaptureLedgerLaunchEntry;

// `<state-root>/.captures/<store-dirname>.jsonl` — state-root itself, a SIBLING of the store
// dirs, so a store wipe (`store purge`, a hostile rm -rf) never takes the ledger with it.
export function capture_ledger_path(storeDir: string): string {
    return join(dirname(storeDir), '.captures', `${basename(storeDir)}.jsonl`);
}

export function build_ledger_line(entry: CaptureLedgerEntry): string {
    return `${JSON.stringify(entry)}\n`;
}

// Append-only JSONL survives crashes as a truncated last line — parse line-by-line and skip
// anything malformed instead of failing the whole ledger.
export function parse_capture_ledger(content: string): CaptureLedgerEntry[] {
    const entries: CaptureLedgerEntry[] = [];
    for (const line of content.split('\n')) {
        if (line.trim().length === 0) {
            continue;
        }
        let raw: unknown;
        try {
            raw = JSON.parse(line);
        } catch {
            continue;
        }
        if (typeof raw !== 'object' || raw === null) {
            continue;
        }
        const kind = (raw as Record<string, unknown>).kind;
        if (kind === 'capture' || kind === 'launch') {
            entries.push(raw as CaptureLedgerEntry);
        }
    }
    return entries;
}

// Does a CLI-written capture line back this cli-verified record? Keyed on the facts the record
// itself claims: the raw-capture file name, its hash + byte length, and the exit code.
export function ledger_backs_record(
    entries: readonly CaptureLedgerEntry[],
    runSlug: string,
    record: EvidenceRecord
): boolean {
    return entries.some(
        (entry) =>
            entry.kind === 'capture' &&
            entry.run === runSlug &&
            entry.file === record.captureFile &&
            entry.sha256 === record.captureSha256 &&
            entry.bytes === record.captureBytes &&
            entry.exit === record.exit
    );
}

// The LATEST launch line for a run — a legitimate relaunch (`suspec work` again) appends a fresh
// line, so the newest binding is the one `done` checks against.
export function latest_launch_line(
    entries: readonly CaptureLedgerEntry[],
    runSlug: string
): CaptureLedgerLaunchEntry | null {
    let latest: CaptureLedgerLaunchEntry | null = null;
    for (const entry of entries) {
        if (entry.kind === 'launch' && entry.run === runSlug) {
            latest = entry;
        }
    }
    return latest;
}

export function spec_content_sha256(source: string): string {
    return createHash('sha256').update(source, 'utf8').digest('hex');
}
