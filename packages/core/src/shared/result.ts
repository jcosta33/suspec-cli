// Minimal Result algebra for swarm-core. Mirrors src/infra/errors/result.ts; duplicated here because the
// legacy infra is unreachable across the (not-yet-established) package boundary. See task open question
// "shared infra home" — a shared package is the eventual home.

export type Ok<TValue> = Readonly<{ ok: true; value: TValue }>;
export type Err<TError> = Readonly<{ ok: false; error: TError }>;
export type Result<TValue, TError> = Ok<TValue> | Err<TError>;

export const ok = <TValue>(value: TValue): Ok<TValue> => ({ ok: true, value });
export const err = <TError>(error: TError): Err<TError> => ({ ok: false, error });

export const isOk = <TValue, TError>(result: Result<TValue, TError>): result is Ok<TValue> => result.ok === true;
export const isErr = <TValue, TError>(result: Result<TValue, TError>): result is Err<TError> => result.ok === false;
