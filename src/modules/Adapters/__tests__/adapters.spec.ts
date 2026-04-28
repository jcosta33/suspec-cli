import { get_adapter, adapter_capabilities } from '../useCases/index.ts';
import { build_args as claude_build_args } from '../useCases/claude.ts';
import { build_args as codex_build_args } from '../useCases/codex.ts';
import { build_args as gemini_build_args } from '../useCases/gemini.ts';
import { build_args as droid_build_args } from '../useCases/droid.ts';
import { build_args as kimi_build_args } from '../useCases/kimi.ts';
import { build_args as opencode_build_args } from '../useCases/opencode.ts';

import { describe, expect, it } from 'vitest';

describe('adapters module', () => {
    it('exports 6 adapter capabilities', () => {
        expect(adapter_capabilities).toHaveLength(6);
        const names = adapter_capabilities.map((c) => c.name);
        expect(names).toContain('claude');
        expect(names).toContain('codex');
        expect(names).toContain('droid');
        expect(names).toContain('gemini');
        expect(names).toContain('kimi');
        expect(names).toContain('opencode');
    });

    it('each capability has required fields', () => {
        for (const cap of adapter_capabilities) {
            expect(cap.name).toBeTypeOf('string');
            expect(cap.version).toBeTypeOf('string');
            expect(cap.type).toBe('adapter');
            expect(cap.description).toBeTypeOf('string');
            expect(cap.entry_point).toBeTypeOf('string');
        }
    });

    it('resolves known adapters by name', () => {
        const claude = get_adapter('claude');
        expect(claude).toBeDefined();
        expect(claude?.command).toBe('claude');
        expect(typeof claude?.build_args).toBe('function');

        const codex = get_adapter('codex');
        expect(codex).toBeDefined();
        expect(codex?.command).toBe('codex');
    });

    it('returns undefined for unknown adapters', () => {
        expect(get_adapter('nonexistent')).toBeUndefined();
        expect(get_adapter('')).toBeUndefined();
    });

    it('build_args returns array for each adapter', () => {
        for (const cap of adapter_capabilities) {
            const adapter = get_adapter(cap.name);
            expect(adapter).toBeDefined();
            if (adapter) {
                const args = adapter.build_args('test-slug');
                expect(Array.isArray(args)).toBe(true);
            }
        }
    });

    describe('claude build_args', () => {
        it('adds --name flag with slug', () => {
            const args = claude_build_args('my-task');
            expect(args).toContain('--name');
            expect(args).toContain('my-task');
        });

        it('appends extra args after slug', () => {
            const args = claude_build_args('my-task', ['--verbose']);
            expect(args).toEqual(['--name', 'my-task', '--verbose']);
        });
    });

    describe('codex build_args', () => {
        it('adds --full-auto flag', () => {
            const args = codex_build_args('my-task');
            expect(args).toContain('--full-auto');
        });

        it('appends extra args after --full-auto', () => {
            const args = codex_build_args('my-task', ['--model', 'gpt-4']);
            expect(args).toEqual(['--full-auto', '--model', 'gpt-4']);
        });
    });

    describe('gemini build_args', () => {
        it('passes through extra args only', () => {
            const args = gemini_build_args('my-task', ['--debug']);
            expect(args).toEqual(['--debug']);
        });

        it('returns empty array when no extra args', () => {
            expect(gemini_build_args('my-task')).toEqual([]);
        });
    });

    describe('droid build_args', () => {
        it('passes through extra args only', () => {
            const args = droid_build_args('my-task', ['--flag']);
            expect(args).toEqual(['--flag']);
        });
    });

    describe('kimi build_args', () => {
        it('passes through extra args only', () => {
            const args = kimi_build_args('my-task', ['--option']);
            expect(args).toEqual(['--option']);
        });
    });

    describe('opencode build_args', () => {
        it('passes through extra args only', () => {
            const args = opencode_build_args('my-task', ['--config', 'x']);
            expect(args).toEqual(['--config', 'x']);
        });
    });
});
