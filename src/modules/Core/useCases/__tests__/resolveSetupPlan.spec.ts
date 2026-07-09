import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { resolve_setup_plan } from '../resolveSetupPlan.ts';

// SPEC-suspec-v2 AC-005: the setup plan's source order — declared `setup` commands first; else the
// lockfile autodetect; `setup_copy` rides along in both cases.

let repo: string;
beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-plan-')));
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('resolve_setup_plan (AC-005)', () => {
    it('declared setup commands win over any lockfile, and carry the setup_copy list', () => {
        writeFileSync(join(repo, 'pnpm-lock.yaml'), '');
        writeFileSync(
            join(repo, 'suspec.config.json'),
            JSON.stringify({ setup: ['make bootstrap'], setup_copy: ['.env.local'] })
        );
        expect(resolve_setup_plan({ repoRoot: repo })).toEqual({
            commands: ['make bootstrap'],
            copies: ['.env.local'],
            source: 'config',
        });
    });

    it('autodetects from the lockfile when no setup is declared — per-lockfile mapping', () => {
        writeFileSync(join(repo, 'suspec.config.json'), JSON.stringify({ setup_copy: ['.env'] }));
        writeFileSync(join(repo, 'package-lock.json'), '{}');
        expect(resolve_setup_plan({ repoRoot: repo })).toEqual({
            commands: ['npm ci'],
            copies: ['.env'],
            source: 'autodetect',
        });
        rmSync(join(repo, 'package-lock.json'));
        writeFileSync(join(repo, 'uv.lock'), '');
        expect(resolve_setup_plan({ repoRoot: repo }).commands).toEqual(['uv sync']);
    });

    it('yields an empty none-plan with no config and no lockfile, and degrades malformed JSON to autodetect', () => {
        expect(resolve_setup_plan({ repoRoot: repo })).toEqual({ commands: [], copies: [], source: 'none' });
        writeFileSync(join(repo, 'suspec.config.json'), '{ not json');
        writeFileSync(join(repo, 'yarn.lock'), '');
        expect(resolve_setup_plan({ repoRoot: repo })).toEqual({
            commands: ['yarn install --frozen-lockfile'],
            copies: [],
            source: 'autodetect',
        });
    });

    it('honors the injected readers (no disk)', () => {
        const plan = resolve_setup_plan({
            repoRoot: '/x',
            readConfig: () => JSON.stringify({ setup: ['a'], setup_copy: ['b'] }),
            exists: () => false,
        });
        expect(plan).toEqual({ commands: ['a'], copies: ['b'], source: 'config' });
    });
});
