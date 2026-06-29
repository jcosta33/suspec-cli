// Read the key/value pairs from a markdown file's leading `---` frontmatter block. Pure.
// A scalar `key: value` yields a string; a YAML block list (a bare `key:` followed by `- item`
// lines) yields a string[] — the reconcile engine needs a task's `source` list (a spec, optionally a
// change-plan) as well as scalar fields (`status`, a review's `task`). A light line-scanner, not a
// full YAML parser: nesting beyond one list level, and flow-style `[a, b]`, are kept as raw strings.

import { normalize_scalar } from '../../../infra/yamlScalar.ts';

export type Frontmatter = Record<string, string | string[]>;

// Collapse a frontmatter value to its scalar reading: a string stays as-is, a block list
// reads as its first item, undefined stays undefined. Use when a field is logically singular
// (`id`, `status`, `task`, `spec`) but the parser may have widened it to string[].
export function fm_scalar(value: string | readonly string[] | undefined): string | undefined {
    if (value === undefined || typeof value === 'string') {
        return value;
    }
    return value[0];
}

const KEY = /^(\w[\w-]*):\s*(.*)$/;
const LIST_ITEM = /^\s*-\s+(.*)$/;
const BOM = 0xfeff;

export function read_frontmatter(source: string): Frontmatter {
    // Tolerate CRLF (Windows) line endings and a leading UTF-8 BOM, else `lines[0]` would be `'---\r'`
    // (or BOM-prefixed) and the whole file would read as having no frontmatter.
    const text = source.charCodeAt(0) === BOM ? source.slice(1) : source;
    const lines = text.split(/\r\n|[\r\n]/);
    if (lines[0] !== '---') {
        return {};
    }
    const out: Frontmatter = {};
    let index = 1;
    while (index < lines.length && lines[index] !== '---') {
        const keyMatch = KEY.exec(lines[index]);
        if (keyMatch === null) {
            index += 1;
            continue;
        }
        const key = keyMatch[1];
        const value = normalize_scalar(keyMatch[2]);
        if (value.length > 0) {
            out[key] = value;
            index += 1;
            continue;
        }
        // A bare `key:` may head a block list — collect the contiguous `- item` lines that follow.
        const items: string[] = [];
        index += 1;
        while (index < lines.length) {
            const itemMatch = LIST_ITEM.exec(lines[index]);
            if (itemMatch === null) {
                break;
            }
            const item = itemMatch[1].trim();
            if (item.length > 0) {
                items.push(item);
            }
            index += 1;
        }
        if (items.length > 0) {
            out[key] = items;
        }
    }
    return out;
}

// Upsert scalar keys into the leading `---` frontmatter block — replaced as a scalar where the key
// exists (its whole value range, so a former block list leaves no orphaned `- item` lines), else
// inserted just before the closing fence. A duplicate of an updated key is collapsed to the single
// stamped value (no stale second copy). The body below the closing fence is byte-preserved. Pure;
// a file with no (or an unterminated) frontmatter fence is returned unchanged. `suspec stamp` uses it
// to write a spec's `snapshot:` or a review's `reviewed_sha:`/`evidence_hash:`.
export function upsert_frontmatter(source: string, updates: Readonly<Record<string, string>>): string {
    const hasBom = source.charCodeAt(0) === BOM;
    const text = hasBom ? source.slice(1) : source;
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r\n|[\r\n]/);
    if (lines[0] !== '---') {
        return source;
    }
    let close = 1;
    while (close < lines.length && lines[close] !== '---') {
        close += 1;
    }
    if (close >= lines.length) {
        return source; // unterminated frontmatter — do not touch
    }
    const pending = new Map(Object.entries(updates));
    const updated = new Set<string>();
    const body: string[] = []; // the rebuilt frontmatter lines, between the fences
    let i = 1;
    while (i < close) {
        const keyMatch = KEY.exec(lines[i]);
        const value = keyMatch !== null ? pending.get(keyMatch[1]) : undefined;
        if (keyMatch !== null && value !== undefined) {
            const key = keyMatch[1];
            // Skip this key's whole value range: the key line plus any block-list (`- item`) lines that
            // followed it — so replacing a list with a scalar orphans nothing.
            i += 1;
            while (i < close && LIST_ITEM.test(lines[i])) {
                i += 1;
            }
            // Emit the scalar once; a later duplicate of the same key is dropped (no stale second copy).
            if (!updated.has(key)) {
                body.push(`${key}: ${value}`);
                updated.add(key);
            }
            continue;
        }
        body.push(lines[i]);
        i += 1;
    }
    for (const [key, value] of pending) {
        if (!updated.has(key)) {
            body.push(`${key}: ${value}`);
        }
    }
    const out = [lines[0], ...body, ...lines.slice(close)];
    return (hasBom ? '﻿' : '') + out.join(eol);
}
