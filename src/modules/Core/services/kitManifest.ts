// The kit layout manifest (ADR-0135). The kit declares WHERE its content lives; the CLI reads it
// instead of assuming a fixed `templates/` layout — decoupling the CLI (an additive accelerator) from
// the kit's structure (ADR-0134). A light line-scanner over `<dir>/suspec-kit.yaml`, matching this
// repo's `read_frontmatter` philosophy (not a full YAML parser): two block lists — `kit_owned:` (the
// path prefixes `suspec update --write` refreshes) and `required:` (paths a valid workspace must
// contain). Pure: reads one file, writes nothing. An absent file → null, so the caller falls back to
// the built-in defaults and a pre-manifest kit/workspace still works unchanged (ADR-0135 AC-004).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const MANIFEST_FILENAME = 'suspec-kit.yaml';

// The built-in fallback, used when no manifest is present (a pre-ADR-0135 kit/workspace). These mirror
// the layout the kit has always shipped, so behavior is unchanged until a manifest declares otherwise.
export const DEFAULT_KIT_OWNED = ['templates/', '.agents/skills/', 'advanced/', 'hooks/'] as const;
export const DEFAULT_REQUIRED = ['templates'] as const;

export type KitManifest = Readonly<{
    // Path prefixes the kit owns and `suspec update --write` refreshes (a bare filename matches exactly).
    kitOwned: readonly string[];
    // Paths a valid workspace must contain (`suspec check` blocks when one is missing).
    required: readonly string[];
}>;

const BLOCK_KEY = /^([\w-]+):\s*$/; // a bare `key:` opening a block list
const LIST_ITEM = /^\s*-\s+(.+?)\s*$/; // `  - value`

// Parse the manifest's block lists from raw text. Only `kit_owned:` and `required:` are read; any other
// key is ignored. A key present with no items reads as an empty list (the kit's explicit choice); a key
// entirely absent falls back to its default. Comments (`#`) and blank lines are skipped.
function parse_manifest(text: string): KitManifest {
    const lists: Record<string, string[]> = {};
    let current: string | null = null;
    for (const line of text.split(/\r\n|[\r\n]/)) {
        if (line.trim() === '' || line.trimStart().startsWith('#')) {
            continue;
        }
        const keyMatch = BLOCK_KEY.exec(line);
        if (keyMatch !== null) {
            current = keyMatch[1];
            lists[current] = [];
            continue;
        }
        const itemMatch = LIST_ITEM.exec(line);
        if (itemMatch !== null && current !== null) {
            lists[current].push(itemMatch[1]);
            continue;
        }
        // A non-list, non-key line ends the current block (e.g. a top-level scalar we do not read).
        current = null;
    }
    return {
        kitOwned: lists.kit_owned ?? [...DEFAULT_KIT_OWNED],
        required: lists.required ?? [...DEFAULT_REQUIRED],
    };
}

// Read the kit manifest from `<dir>/suspec-kit.yaml`. Returns null when the file is absent so the caller
// falls back to the defaults (ADR-0135 AC-004: a manifest-less kit/workspace never breaks).
export function read_kit_manifest(dir: string): KitManifest | null {
    const path = join(dir, MANIFEST_FILENAME);
    if (!existsSync(path)) {
        return null;
    }
    return parse_manifest(readFileSync(path, 'utf8'));
}
