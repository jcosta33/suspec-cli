import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
    read_store_settings,
    DEFAULT_WIP_CAP,
    DEFAULT_RETENTION_DAYS,
} from '../useCases/readStoreSettings.ts';

// SPEC-suspec-v2 AC-019/AC-020/AC-025: wip_cap + retention_days from suspec.config.json, with
// graceful degradation — absence, garbage, and non-positive values all read as the defaults.

let repo: string;

beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'suspec-settings-'));
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('read_store_settings', () => {
    it('defaults (wip_cap 3, retention_days 30) with no config file at all — AC-025', () => {
        expect(read_store_settings(repo)).toEqual({ wipCap: DEFAULT_WIP_CAP, retentionDays: DEFAULT_RETENTION_DAYS });
        expect(DEFAULT_WIP_CAP).toBe(3);
        expect(DEFAULT_RETENTION_DAYS).toBe(30);
    });

    it('honors configured integer overrides', () => {
        writeFileSync(join(repo, 'suspec.config.json'), JSON.stringify({ wip_cap: 7, retention_days: 90 }));
        expect(read_store_settings(repo)).toEqual({ wipCap: 7, retentionDays: 90 });
    });

    it('malformed JSON, a non-object payload, and unusable values degrade to the defaults', () => {
        writeFileSync(join(repo, 'suspec.config.json'), '{nope');
        expect(read_store_settings(repo)).toEqual({ wipCap: 3, retentionDays: 30 });
        writeFileSync(join(repo, 'suspec.config.json'), '"a string"');
        expect(read_store_settings(repo)).toEqual({ wipCap: 3, retentionDays: 30 });
        writeFileSync(
            join(repo, 'suspec.config.json'),
            JSON.stringify({ wip_cap: 0, retention_days: 2.5 })
        );
        expect(read_store_settings(repo)).toEqual({ wipCap: 3, retentionDays: 30 });
        writeFileSync(join(repo, 'suspec.config.json'), JSON.stringify({ wip_cap: '5' }));
        expect(read_store_settings(repo)).toEqual({ wipCap: 3, retentionDays: 30 });
    });
});
