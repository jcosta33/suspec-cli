import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { read_verify_commands } from '../useCases/readVerifyCommands.ts';

// SPEC-suspec-v2 AC-021: the `verify` list from suspec.config.json — check-my-work's gate face.
// Absence/malformation degrades to no declared commands, never an error.

let repo: string;

beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'suspec-verifycfg-'));
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('read_verify_commands', () => {
    it('reads the declared command strings', () => {
        writeFileSync(join(repo, 'suspec.config.json'), JSON.stringify({ verify: ['pnpm test:run', 'pnpm lint'] }));
        expect(read_verify_commands(repo)).toEqual(['pnpm test:run', 'pnpm lint']);
    });

    it('filters non-string and empty entries', () => {
        writeFileSync(join(repo, 'suspec.config.json'), JSON.stringify({ verify: ['pnpm lint', 7, '', '  '] }));
        expect(read_verify_commands(repo)).toEqual(['pnpm lint']);
    });

    it('degrades to empty: no file, malformed JSON, non-object, non-list verify', () => {
        expect(read_verify_commands(repo)).toEqual([]);
        writeFileSync(join(repo, 'suspec.config.json'), '{oops');
        expect(read_verify_commands(repo)).toEqual([]);
        writeFileSync(join(repo, 'suspec.config.json'), '"just a string"');
        expect(read_verify_commands(repo)).toEqual([]);
        writeFileSync(join(repo, 'suspec.config.json'), JSON.stringify({ verify: 'pnpm lint' }));
        expect(read_verify_commands(repo)).toEqual([]);
    });
});
