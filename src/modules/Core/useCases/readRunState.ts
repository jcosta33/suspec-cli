// Read a store run file's current state — existence, raw content, and the parsed lock fields
// (SPEC-suspec-v2 AC-008). The read half of the run lock: `suspec work` consults it before
// launching (refuse a fresh heartbeat / reclaim a dead one) and again after the runner exits (the
// agent may have appended to the body, so the release re-reads rather than reusing the launch-time
// content). A missing or unreadable file reads as NO state — a lock that cannot be read never
// blocks a launch.

import { existsSync, readFileSync } from 'fs';

import { read_run_lock, type RunLock } from '../services/runArtifact.ts';

export type RunState = Readonly<{ path: string; content: string; lock: RunLock }>;

export function read_run_state(path: string): RunState | null {
    if (!existsSync(path)) {
        return null;
    }
    let content: string;
    try {
        content = readFileSync(path, 'utf8');
    } catch {
        return null;
    }
    return { path, content, lock: read_run_lock(content) };
}
