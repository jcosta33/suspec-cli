import { read_state, write_state, remove_state, is_process_running } from '../useCases/state.ts';
import { is_agent_state, validate_state } from '../useCases/state.ts';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('agent-state module', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'swarm-state-test-'));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    it('read_state returns empty object when state file does not exist', () => {
        const state = read_state(tempDir);
        expect(state).toEqual({});
    });

    function ensureStateFile() {
        const agentsDir = join(tempDir, '.agents');
        if (!existsSync(agentsDir)) mkdirSync(agentsDir, { recursive: true });
        const statePath = join(agentsDir, 'state.json');
        if (!existsSync(statePath)) writeFileSync(statePath, '{}', 'utf8');
    }

    it('write_state creates state file and stores agent data', () => {
        ensureStateFile();
        write_state(tempDir, 'test-slug', { status: 'running', agent: 'claude', pid: 1234 });

        const state = read_state(tempDir);
        expect(state['test-slug']).toBeDefined();
        expect(state['test-slug']?.status).toBe('running');
        expect(state['test-slug']?.agent).toBe('claude');
        expect(state['test-slug']?.pid).toBe(1234);
        expect(state['test-slug']?.lastUpdated).toBeTypeOf('string');
    });

    it('write_state merges new data with existing state', () => {
        ensureStateFile();
        write_state(tempDir, 'slug-a', { status: 'running', agent: 'claude' });
        write_state(tempDir, 'slug-b', { status: 'idle', agent: 'gemini' });
        write_state(tempDir, 'slug-a', { status: 'completed', exitCode: 0 });

        const state = read_state(tempDir);
        expect(state['slug-a']?.status).toBe('completed');
        expect(state['slug-a']?.agent).toBe('claude');
        expect(state['slug-a']?.exitCode).toBe(0);
        expect(state['slug-b']?.status).toBe('idle');
        expect(state['slug-b']?.agent).toBe('gemini');
    });

    it('remove_state deletes an agent entry', () => {
        ensureStateFile();
        write_state(tempDir, 'slug-a', { status: 'running' });
        write_state(tempDir, 'slug-b', { status: 'idle' });

        remove_state(tempDir, 'slug-a');

        const state = read_state(tempDir);
        expect(state['slug-a']).toBeUndefined();
        expect(state['slug-b']).toBeDefined();
    });

    it('remove_state is a no-op when slug does not exist', () => {
        ensureStateFile();
        write_state(tempDir, 'slug-a', { status: 'running' });

        remove_state(tempDir, 'nonexistent');

        const state = read_state(tempDir);
        expect(state['slug-a']).toBeDefined();
    });

    it('is_process_running returns false for null/undefined/0 pid', () => {
        expect(is_process_running(null)).toBe(false);
        expect(is_process_running(undefined)).toBe(false);
        expect(is_process_running(0)).toBe(false);
    });

    it('is_process_running returns true for current process and false for non-existent', () => {
        expect(is_process_running(process.pid)).toBe(true);
        expect(is_process_running(999999)).toBe(false);
    });

    describe('is_agent_state', () => {
        it('returns true for valid agent state objects', () => {
            expect(is_agent_state({ status: 'running' })).toBe(true);
            expect(is_agent_state({ status: 'running', pid: 1234, backend: 'terminal', agent: 'claude' })).toBe(true);
        });

        it('returns false for non-objects', () => {
            expect(is_agent_state(null)).toBe(false);
            expect(is_agent_state('string')).toBe(false);
            expect(is_agent_state(123)).toBe(false);
        });

        it('returns false for objects with invalid keys', () => {
            expect(is_agent_state({ status: 'running', invalidKey: 'x' })).toBe(false);
        });
    });

    describe('validate_state', () => {
        it('returns empty object for non-object input', () => {
            expect(validate_state(null)).toEqual({});
            expect(validate_state('string')).toEqual({});
            expect(validate_state(123)).toEqual({});
        });

        it('filters out invalid entries and keeps valid ones', () => {
            const input = {
                'valid-slug': { status: 'running', agent: 'claude' },
                'invalid-slug': { status: 'running', extraField: 'bad' },
            };
            const result = validate_state(input);
            expect(result['valid-slug']).toEqual({ status: 'running', agent: 'claude' });
            expect(result['invalid-slug']).toBeUndefined();
        });
    });
});
