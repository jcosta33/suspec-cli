// The Sol module's public surface (the DDD root barrel). Other modules import from here, never deep.
// Runtime only, per the repo barrel convention: a consumer needing the IR shape uses
// `ReturnType<typeof parse_spec>` rather than a re-exported model type (model isolation).

export { parse_spec } from './parseSpec.ts';
