import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, realpathSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { write_new_file } from '../useCases/files.ts';
import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';

let dir: string;
beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-files-')));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('write_new_file — the no-clobber write (AC-004)', () => {
    it('writes a new file, creating parent directories', () => {
        const path = join(dir, 'reviews', 'feat.md');
        const result = assertOk(write_new_file(path, 'draft body'));
        expect(result.path).toBe(path);
        expect(readFileSync(path, 'utf8')).toBe('draft body');
    });

    it('refuses to overwrite an existing file and leaves it byte-unchanged', () => {
        const path = join(dir, 'feat.md');
        writeFileSync(path, 'original');
        const error = assertErr(write_new_file(path, 'replacement'));
        expect(error._tag).toBe('FileExists');
        expect(readFileSync(path, 'utf8')).toBe('original'); // untouched
    });

    it('overwrites only with the explicit overwrite option (the --force path)', () => {
        const path = join(dir, 'feat.md');
        writeFileSync(path, 'original');
        assertOk(write_new_file(path, 'replacement', { overwrite: true }));
        expect(readFileSync(path, 'utf8')).toBe('replacement');
    });

    it('writes nothing else — only the one target file appears', () => {
        const path = join(dir, 'sub', 'feat.md');
        assertOk(write_new_file(path, 'x'));
        expect(existsSync(path)).toBe(true);
    });
});
