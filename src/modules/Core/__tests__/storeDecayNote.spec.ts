import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';

import { store_decay_note } from '../useCases/storeDecayNote.ts';

// SPEC-suspec-v2 AC-019: the shared surface hook — probe-only (never creates a store), silent on
// every miss, one line when the store decayed. `work`, `status`, and `next` wire it.

let root: string;
let repo: string;
let store: string;
let savedStateDir: string | undefined;

beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-decaynote-')));
    repo = join(root, 'repo');
    mkdirSync(repo, { recursive: true });
    store = join(root, 'state', basename(repo));
    savedStateDir = process.env.SUSPEC_STATE_DIR;
    process.env.SUSPEC_STATE_DIR = join(root, 'state');
});
afterEach(() => {
    if (savedStateDir === undefined) {
        delete process.env.SUSPEC_STATE_DIR;
    } else {
        process.env.SUSPEC_STATE_DIR = savedStateDir;
    }
    rmSync(root, { recursive: true, force: true });
});

describe('store_decay_note', () => {
    it('null when the repo has no store yet — and the probe creates nothing', () => {
        expect(store_decay_note(repo)).toBeNull();
        expect(() => rmSync(store)).toThrow(); // still absent
    });

    it('null when the store exists but nothing decayed', () => {
        mkdirSync(store, { recursive: true });
        writeFileSync(join(store, '.repo-path'), `${repo}\n`);
        writeFileSync(join(store, 'spec-a.md'), '---\ntype: spec\nstatus: ready\n---\n');
        expect(store_decay_note(repo)).toBeNull();
    });

    it('the one-line nudge when the store holds decayed items', () => {
        mkdirSync(store, { recursive: true });
        writeFileSync(join(store, '.repo-path'), `${repo}\n`);
        writeFileSync(join(store, 'finding-001.md'), '---\ntype: finding\nexpires: 2001-01-01\n---\n');
        expect(store_decay_note(repo)).toBe('1 stale — suspec store doctor');
    });
});
