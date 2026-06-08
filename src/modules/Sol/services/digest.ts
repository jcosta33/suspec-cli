import { createHash } from 'node:crypto';

// Content digest for source spans and the whole-source provenance hash. Pure and deterministic.
// Format `sha256:<hex>` matches the Swarm IR examples. The parser is the *tool*, so it emits real digests.
export const sha256 = (text: string): string => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
