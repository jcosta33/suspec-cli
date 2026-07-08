// The artifact grammar version (SPEC-suspec-v2 AC-003). Every artifact the CLI authors carries
// `grammar_version: <N>` in frontmatter so a future grammar change can upgrade the store in place.
// This service is the pure half: read the recorded version, inject it where absent, force-stamp it
// during migration. The per-version transform table lives here too — `GRAMMAR_MIGRATIONS[n]`
// rewrites an artifact from grammar `n` to `n + 1`; version 1 is the first grammar, so the table is
// empty today. `migrate_store` is the only caller allowed to rewrite pre-existing artifacts.

import { fm_scalar, read_frontmatter, upsert_frontmatter } from './readFrontmatter.ts';

export const CURRENT_GRAMMAR_VERSION = 1;

export type GrammarTransform = (content: string) => string;

// n → n+1 upgrade steps. A gap in the chain is a refusal in `migrate_store`, never a guess.
export const GRAMMAR_MIGRATIONS: Readonly<Record<number, GrammarTransform>> = {};

const BOM = 0xfeff;
const FENCE = /^---(\r\n|\n)/;

// Does the content open with a frontmatter fence? (BOM-tolerant, like read_frontmatter.)
function has_fence(content: string): boolean {
    const text = content.charCodeAt(0) === BOM ? content.slice(1) : content;
    return FENCE.test(text);
}

// The version recorded in frontmatter, or null when absent or non-numeric.
export function read_grammar_version(content: string): number | null {
    const raw = fm_scalar(read_frontmatter(content).grammar_version);
    if (raw === undefined) {
        return null;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

// Force-set `grammar_version` — the migration stamp. Content with a frontmatter block gets the key
// upserted; content without one gets a minimal block prepended. An unterminated fence is left
// unchanged (upsert_frontmatter refuses it): a malformed artifact is a lint finding, not something
// to guess at.
export function stamp_grammar_version(content: string, version: number): string {
    if (has_fence(content)) {
        return upsert_frontmatter(content, { grammar_version: String(version) });
    }
    return `---\ngrammar_version: ${version}\n---\n\n${content}`;
}

// Inject the current version only where none is recorded — the write-path guarantee for artifacts
// the CLI authors. A recorded version is never touched here; only `migrate_store` moves it.
export function ensure_grammar_version(content: string, version: number = CURRENT_GRAMMAR_VERSION): string {
    if (read_grammar_version(content) !== null) {
        return content;
    }
    return stamp_grammar_version(content, version);
}
