// Read the CLI-owned capture ledger for one store (see services/captureLedger.ts). `exists`
// travels with the entries because ABSENCE is a distinct state: no ledger file at all means
// pre-ledger history or a wiped state-root — the consumers degrade to capture-block verification
// with a printed note instead of reading every record as unledgered (no permanent wedge). An
// unreadable file degrades the same way.

import { existsSync, readFileSync } from 'fs';

import { capture_ledger_path, parse_capture_ledger, type CaptureLedgerEntry } from '../services/captureLedger.ts';

export type CaptureLedgerView = Readonly<{ exists: boolean; entries: readonly CaptureLedgerEntry[] }>;

export function read_capture_ledger(storeDir: string): CaptureLedgerView {
    const path = capture_ledger_path(storeDir);
    if (!existsSync(path)) {
        return { exists: false, entries: [] };
    }
    let content: string;
    try {
        content = readFileSync(path, 'utf8');
        /* v8 ignore next 3 -- existsSync just passed; an unreadable ledger needs it to vanish or flip permissions between the two calls */
    } catch {
        return { exists: false, entries: [] };
    }
    return { exists: true, entries: parse_capture_ledger(content) };
}
