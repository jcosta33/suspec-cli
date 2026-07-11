import { describe, it, expect } from 'vitest';

import { createAppError } from '../createAppError.ts';

describe('AppError', () => {
    it('createAppError() creates the expected flattened shape', () => {
        const error = createAppError('TestError', 'A test error', { foo: 'bar', baz: 123 });

        expect(error._tag).toBe('TestError');
        expect(error.message).toBe('A test error');
        expect(error.foo).toBe('bar');
        expect(error.baz).toBe(123);
        expect(error.cause).toBeUndefined();
    });

    it('error data fields are accessible directly (no .details)', () => {
        const error = createAppError('MyError', 'Msg', { id: 42 });
        expect(error.id).toBe(42);
        expect(error).not.toHaveProperty('details');
    });

    it('data cannot shadow the _tag or message discriminant', () => {
        const error = createAppError('RealTag', 'real message', { _tag: 'FAKE', message: 'fake' });
        expect(error._tag).toBe('RealTag');
        expect(error.message).toBe('real message');
    });

    it('creates a real Error instance', () => {
        expect(createAppError('TestError', 'A test error occurred')).toBeInstanceOf(Error);
    });

    it('propagates a provided cause and omits the property entirely when absent', () => {
        const cause = new Error('root cause');
        expect(createAppError('DetailedError', 'A detailed error', { id: 123 }, cause).cause).toBe(cause);
        expect('cause' in createAppError('TestError', 'msg')).toBe(false);
    });
});
