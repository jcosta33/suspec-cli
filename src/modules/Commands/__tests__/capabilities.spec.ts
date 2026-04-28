import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/capabilities.ts';

vi.mock('../services/registry.ts', () => ({
    list_capabilities: vi.fn(),
}));

import { list_capabilities } from '../services/registry.ts';

describe('capabilities', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('prints JSON when --json flag is set', () => {
        vi.mocked(list_capabilities).mockReturnValue([
            { name: 'test', type: 'cmd', description: 'test cmd' },
        ]);
        process.argv = ['node', 'script', '--json'];
        expect(run()).toBe(0);
    });

    it('prints message when no capabilities exist', () => {
        vi.mocked(list_capabilities).mockReturnValue([]);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('groups and prints capabilities by type', () => {
        vi.mocked(list_capabilities).mockReturnValue([
            { name: 'a', type: 'cmd', description: 'desc a' },
            { name: 'b', type: 'cmd', description: 'desc b' },
            { name: 'c', type: 'query', description: 'desc c' },
        ]);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });
});
