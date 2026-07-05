import { describe, it, expect } from 'vitest';

import { parse_setup_config } from '../services/setupConfig.ts';
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
