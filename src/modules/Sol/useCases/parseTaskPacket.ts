// Parse the task packet scope used to key review coverage. Pure: the source string is never mutated
// and no state is held between calls.

import { isErr } from '../../../infra/errors/result.ts';
import { normalize_scalar } from '../../../infra/yamlScalar.ts';
import { split_frontmatter } from '../services/frontmatter.ts';

export type TaskPacket = Readonly<{
    scope: readonly string[];
}>;

const REQUIREMENT_ID = /\b[A-Z][A-Z0-9]*-\d+\b/g;
const SCOPE_KEY = /^scope:\s*(.*)$/;
const TOP_LEVEL_KEY = /^[A-Za-z0-9_-]+:/;

function split_scope(rawValue: string): string[] {
    const inner = rawValue.trim().replace(/^\[/, '').replace(/\]$/, '');
    const ids: string[] = [];
    for (const segment of inner.split(',')) {
        const matches = segment.match(REQUIREMENT_ID);
        if (matches !== null) {
            ids.push(...matches);
        }
    }
    return ids;
}

function read_scope(source: string): string[] {
    const split = split_frontmatter(source);
    if (isErr(split)) {
        return [];
    }
    const { lines, frontmatter_end_line } = split.value;
    for (let index = 1; index < frontmatter_end_line - 1; index += 1) {
        const match = SCOPE_KEY.exec(lines[index]);
        if (match === null) {
            continue;
        }
        let value = normalize_scalar(match[1]);
        if (!value.includes(']')) {
            for (let next = index + 1; next < frontmatter_end_line - 1; next += 1) {
                if (TOP_LEVEL_KEY.test(lines[next])) {
                    break;
                }
                const fragment = normalize_scalar(lines[next]);
                value += ` ${fragment}`;
                if (fragment.includes(']')) {
                    break;
                }
            }
        }
        return split_scope(value);
    }
    return [];
}

export function parse_task_packet(source: string): TaskPacket {
    return { scope: read_scope(source) };
}
