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
        // Own-property writes only: a computed `__proto__` key would hit Object.prototype's
        // accessor and reassign the parsed object's prototype instead of storing a field — drop
        // it (kin to the Object.hasOwn dispatch guard in src/index.ts). Any `- item` lines that
        // follow fall through the keyMatch === null branch above.
        if (key === '__proto__') {
            index += 1;
            continue;
        }
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
