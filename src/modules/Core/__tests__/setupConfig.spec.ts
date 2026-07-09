import { describe, it, expect } from 'vitest';

import { parse_setup_config, parse_setup_copy, detect_setup_commands } from '../services/setupConfig.ts';
import { read_setup_commands } from '../useCases/readSetupCommands.ts';

// SPEC-suspec-cli-work AC-003: the optional `setup` list in the consumer-side suspec.config.json.
describe('parse_setup_config', () => {
    it('reads a list of non-empty command strings', () => {
        expect(parse_setup_config({ setup: ['pnpm install --frozen-lockfile', 'pnpm build'] })).toEqual([
            'pnpm install --frozen-lockfile',
            'pnpm build',
        ]);
    });

    it('drops blank and non-string items', () => {
        expect(parse_setup_config({ setup: ['pnpm install', '', '   ', 5, null, {}] })).toEqual(['pnpm install']);
    });

    it('returns [] for a missing/non-array setup or a non-record', () => {
        expect(parse_setup_config({})).toEqual([]);
        expect(parse_setup_config({ setup: 'pnpm install' })).toEqual([]);
        expect(parse_setup_config(null)).toEqual([]);
        expect(parse_setup_config(42)).toEqual([]);
    });
});

// SPEC-suspec-v2 AC-005: the setup_copy allowlist + the lockfile autodetect fallback.
describe('parse_setup_copy (AC-005)', () => {
    it('reads the list, dropping blank and non-string items', () => {
        expect(parse_setup_copy({ setup_copy: ['.env.local', '', 7, 'config/.secrets'] })).toEqual([
            '.env.local',
            'config/.secrets',
        ]);
    });

    it('returns [] for a missing/non-array setup_copy or a non-record', () => {
        expect(parse_setup_copy({})).toEqual([]);
        expect(parse_setup_copy({ setup_copy: '.env' })).toEqual([]);
        expect(parse_setup_copy(null)).toEqual([]);
    });
});

describe('detect_setup_commands (AC-005)', () => {
    const detect = (...files: string[]): readonly string[] => detect_setup_commands((name) => files.includes(name));

    it('maps each lockfile fixture to its install command', () => {
        expect(detect('pnpm-lock.yaml')).toEqual(['pnpm install']);
        expect(detect('package-lock.json')).toEqual(['npm ci']);
        expect(detect('yarn.lock')).toEqual(['yarn install --frozen-lockfile']);
        expect(detect('Cargo.toml')).toEqual(['cargo fetch']);
        expect(detect('uv.lock')).toEqual(['uv sync']);
        expect(detect('requirements.txt')).toEqual(['pip install -r requirements.txt']);
    });

    it('the first JS lockfile wins; uv.lock beats requirements.txt; ecosystems are additive', () => {
        expect(detect('pnpm-lock.yaml', 'package-lock.json', 'yarn.lock')).toEqual(['pnpm install']);
        expect(detect('uv.lock', 'requirements.txt')).toEqual(['uv sync']);
        expect(detect('pnpm-lock.yaml', 'Cargo.toml', 'requirements.txt')).toEqual([
            'pnpm install',
            'cargo fetch',
            'pip install -r requirements.txt',
        ]);
    });

    it('detects nothing in a lockfile-less repo', () => {
        expect(detect()).toEqual([]);
    });
});

describe('read_setup_commands', () => {
    it('reads setup from the config file via the injected reader', () => {
        expect(read_setup_commands('/x', () => JSON.stringify({ setup: ['a', 'b'] }))).toEqual(['a', 'b']);
    });

    it('returns [] when the config is absent', () => {
        expect(read_setup_commands('/x', () => null)).toEqual([]);
    });

    it('returns [] on malformed JSON (never throws)', () => {
        expect(read_setup_commands('/x', () => '{not json')).toEqual([]);
    });
});
