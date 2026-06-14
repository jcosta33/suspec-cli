import { describe, it, expect, vi } from 'vitest';

import { print_help, print_command_help } from '../useCases/help.ts';
import { COMMAND_CATALOG } from '../useCases/catalog.ts';

function capture(fn: () => void): string {
    const out: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        out.push(String(chunk));
        return true;
    });
    try {
        fn();
    } finally {
        spy.mockRestore();
    }
    return out.join('');
}

describe('print_help', () => {
    it('lists exactly the dispatchable commands and the contract', () => {
        const out: string[] = [];
        const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            out.push(String(chunk));
            return true;
        });
        try {
            print_help();
        } finally {
            spy.mockRestore();
        }
        const text = out.join('');
        expect(text).toContain('swarm');
        expect(text).toContain('Usage');
        for (const command of COMMAND_CATALOG) {
            expect(text).toContain(command.name);
        }
        expect(text).toContain('0 clean');
    });
});

describe('print_command_help', () => {
    it('prints one command’s usage block', () => {
        const text = capture(() => print_command_help('worktree'));
        expect(text).toContain('swarm worktree');
        expect(text).toContain('Usage');
        expect(text).toContain('create');
    });

    it('falls back to the full reference for an unknown command', () => {
        const text = capture(() => print_command_help('nope'));
        expect(text).toContain('Commands');
    });
});
