import { describe, it, expect } from 'vitest';

import { ok, err } from '../../../infra/errors/result.ts';
import { createAppError } from '../../../infra/errors/createAppError.ts';
import {
    project,
    emit_error,
    exit_code_for,
    usage_error,
    type OutputWriters,
    type OutcomeLevel,
} from '../useCases/unixOutcome.ts';

type Captured = { out: string[]; err: string[]; writers: OutputWriters };

function capture(): Captured {
    const out: string[] = [];
    const errs: string[] = [];
    return { out, err: errs, writers: { out: (text) => out.push(text), err: (text) => errs.push(text) } };
}

describe('exit_code_for', () => {
    it('maps clean to 0, warning to 1, blocking to 2', () => {
        expect(exit_code_for('clean')).toBe(0);
        expect(exit_code_for('warning')).toBe(1);
        expect(exit_code_for('blocking')).toBe(2);
    });
});

describe('project', () => {
    const value = (level: OutcomeLevel) => ({ level, verdict: level, count: 3 });
    const render = (v: { readonly level: OutcomeLevel }) => {
        const val = v as unknown as { verdict: string; count: number };
        return `${val.verdict}: ${val.count}`;
    };

    it('writes the rendered result to stdout and returns 0 on a clean success', () => {
        const c = capture();
        const code = project({ result: ok(value('clean')), json: false, render }, c.writers);
        expect(code).toBe(0);
        expect(c.out).toEqual(['clean: 3\n']);
        expect(c.err).toEqual([]);
    });

    it('returns 1 on a warning success', () => {
        const c = capture();
        const code = project({ result: ok(value('warning')), json: false, render }, c.writers);
        expect(code).toBe(1);
    });

    it('returns 2 on a blocking success', () => {
        const c = capture();
        const code = project({ result: ok(value('blocking')), json: false, render }, c.writers);
        expect(code).toBe(2);
    });

    it('writes the value as JSON to stdout under --json and never calls render', () => {
        const c = capture();
        let rendered = false;
        const code = project(
            { result: ok(value('clean')), json: true, render: () => ((rendered = true), '') },
            c.writers
        );
        expect(code).toBe(0);
        expect(rendered).toBe(false);
        expect(JSON.parse(c.out[0])).toEqual({ level: 'clean', verdict: 'clean', count: 3 });
        expect(c.err).toEqual([]);
    });

    it('on Err writes the message to stderr, nothing to stdout, and returns 2 (non-json)', () => {
        const c = capture();
        const code = project({ result: err(createAppError('Boom', 'it broke', {})), json: false, render }, c.writers);
        expect(code).toBe(2);
        expect(c.out).toEqual([]);
        expect(c.err).toEqual(['it broke\n']);
    });

    it('on Err under --json writes a machine error object to stdout and the message to stderr', () => {
        const c = capture();
        const code = project({ result: err(createAppError('Boom', 'it broke', {})), json: true, render }, c.writers);
        expect(code).toBe(2);
        expect(JSON.parse(c.out[0])).toEqual({ error: 'Boom', message: 'it broke' });
        expect(c.err).toEqual(['it broke\n']);
    });

    it('routes notes to stderr in both modes without polluting stdout', () => {
        const c = capture();
        project({ result: ok(value('clean')), json: true, render, notes: ['scanning…', 'done'] }, c.writers);
        expect(c.err).toEqual(['scanning…\n', 'done\n']);
        // stdout carries only the JSON payload.
        expect(c.out).toHaveLength(1);
        expect(JSON.parse(c.out[0])).toMatchObject({ level: 'clean' });
    });

    it('uses the real process stdout writer by default (smoke: returns the right code)', () => {
        // Exercises the default out-writer branch; output goes to the real stream.
        const code = project({ result: ok(value('clean')), json: true, render });
        expect(code).toBe(0);
    });

    it('uses the real process stderr writer by default on Err (smoke)', () => {
        // Exercises the default err-writer branch.
        const code = project({ result: err(createAppError('Boom', 'boom', {})), json: false, render });
        expect(code).toBe(2);
    });
});

describe('emit_error', () => {
    it('writes the message to stderr and returns 2 (non-json)', () => {
        const c = capture();
        const code = emit_error(createAppError('Boom', 'broke', {}), false, c.writers);
        expect(code).toBe(2);
        expect(c.err).toEqual(['broke\n']);
        expect(c.out).toEqual([]);
    });

    it('also writes a machine error object to stdout under --json', () => {
        const c = capture();
        emit_error(createAppError('Boom', 'broke', {}), true, c.writers);
        expect(JSON.parse(c.out[0])).toEqual({ error: 'Boom', message: 'broke' });
    });

    it('uses the real stderr writer by default (smoke)', () => {
        expect(emit_error(createAppError('Boom', 'broke', {}), false)).toBe(2);
    });
});

describe('error constructors', () => {
    it('usage_error carries the given message under the Usage tag', () => {
        const error = usage_error('unknown subcommand: frob');
        expect(error._tag).toBe('Usage');
        expect(error.message).toBe('unknown subcommand: frob');
    });
});
