import { createAppError, type AppError } from './errors/createAppError.ts';
import { err, ok, type Result } from './errors/result.ts';

export type FrontmatterValue = string | readonly string[];
export type FrontmatterFields = Readonly<Record<string, FrontmatterValue>>;

export type ParsedFrontmatter = Readonly<{
    fields: FrontmatterFields;
    lines: readonly string[];
    frontmatterEndLine: number;
}>;

export type FrontmatterFailure = AppError<'ParseFailure', { reason: 'unparseable-frontmatter'; line: number | null }>;

const KEY = /^([A-Za-z0-9_-]+):\s*(.*)$/;
const LIST_ITEM = /^( +)-[ \t]+(.*)$/;

function failure(message: string, line: number | null): FrontmatterFailure {
    return createAppError('ParseFailure', message, { reason: 'unparseable-frontmatter', line });
}

function strip_comment(raw: string, line: number): Result<string, FrontmatterFailure> {
    let quote: 'single' | 'double' | null = null;
    for (let index = 0; index < raw.length; index += 1) {
        const character = raw[index];
        if (quote === 'double' && character === '\\') {
            index += 1;
            continue;
        }
        if (character === '"' && quote !== 'single') {
            quote = quote === 'double' ? null : 'double';
            continue;
        }
        if (character === "'" && quote !== 'double') {
            if (quote === 'single' && raw[index + 1] === "'") {
                index += 1;
                continue;
            }
            quote = quote === 'single' ? null : 'single';
            continue;
        }
        if (character === '#' && quote === null && (index === 0 || /\s/.test(raw[index - 1]))) {
            return ok(raw.slice(0, index).trim());
        }
    }
    if (quote !== null) {
        return err(failure('frontmatter contains an unbalanced quoted scalar', line));
    }
    return ok(raw.trim());
}

function parse_scalar(raw: string, line: number): Result<string, FrontmatterFailure> {
    const withoutComment = strip_comment(raw, line);
    if (!withoutComment.ok) {
        return withoutComment;
    }
    const value = withoutComment.value;
    if (value.startsWith('"') || value.startsWith("'")) {
        const quote = value[0];
        let closingIndex = -1;
        for (let index = 1; index < value.length; index += 1) {
            if (quote === '"' && value[index] === '\\') {
                index += 1;
                continue;
            }
            if (quote === "'" && value[index] === "'" && value[index + 1] === "'") {
                index += 1;
                continue;
            }
            if (value[index] === quote) {
                closingIndex = index;
                break;
            }
        }
        if (closingIndex !== value.length - 1) {
            return err(failure('frontmatter quotes must surround the complete scalar', line));
        }
        return ok(value.slice(1, -1));
    }
    if (value.startsWith('[') || value.startsWith('{')) {
        return err(failure('frontmatter scalar contains unsupported nested or list syntax', line));
    }
    if (/^[>|&*!]/.test(value)) {
        return err(failure('frontmatter contains unsupported multiline, anchor, alias, or tag syntax', line));
    }
    if (/^-\s/.test(value) || /:\s/.test(value)) {
        return err(failure('frontmatter maps and nested list items are unsupported', line));
    }
    if (value.includes('"') || value.includes("'")) {
        return err(failure('frontmatter quotes must surround the complete scalar', line));
    }
    return ok(value);
}

function split_inline_items(raw: string, line: number): Result<readonly string[], FrontmatterFailure> {
    const withoutComment = strip_comment(raw, line);
    if (!withoutComment.ok) {
        return withoutComment;
    }
    const value = withoutComment.value;
    if (!value.endsWith(']')) {
        return err(failure('frontmatter inline list is not closed on the same line', line));
    }
    const inner = value.slice(1, -1).trim();
    if (inner.length === 0) {
        return ok([]);
    }

    const items: string[] = [];
    let start = 0;
    let quote: 'single' | 'double' | null = null;
    for (let index = 0; index <= inner.length; index += 1) {
        const character = inner[index];
        if (quote === 'double' && character === '\\') {
            index += 1;
            continue;
        }
        if (character === '"' && quote !== 'single') {
            quote = quote === 'double' ? null : 'double';
        } else if (character === "'" && quote !== 'double') {
            if (quote === 'single' && inner[index + 1] === "'") {
                index += 1;
                continue;
            }
            quote = quote === 'single' ? null : 'single';
        } else if ((character === ',' || index === inner.length) && quote === null) {
            const parsed = parse_scalar(inner.slice(start, index), line);
            if (!parsed.ok) {
                return parsed;
            }
            if (parsed.value.length === 0) {
                return err(failure('frontmatter inline list contains an empty item', line));
            }
            items.push(parsed.value);
            start = index + 1;
        } else if (
            (character === '[' || character === ']' || character === '{' || character === '}') &&
            quote === null
        ) {
            return err(failure('frontmatter lists must be flat', line));
        }
    }
    if (quote !== null) {
        return err(failure('frontmatter inline list contains an unbalanced quote', line));
    }
    return ok(items);
}

export function parse_frontmatter(source: string): Result<ParsedFrontmatter, FrontmatterFailure> {
    const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
    const lines = text.split(/\r\n|[\r\n]/);
    if (lines[0] !== '---') {
        return err(failure('source MUST begin with a `---` frontmatter fence', 1));
    }

    const closingIndex = lines.findIndex((line, index) => index > 0 && line === '---');
    if (closingIndex < 0) {
        return err(failure('frontmatter `---` fence is never closed', null));
    }

    const entries: [string, FrontmatterValue][] = [];
    const seen = new Set<string>();
    for (let index = 1; index < closingIndex; index += 1) {
        const lineNumber = index + 1;
        const line = lines[index];
        if (line.trim().length === 0 || line.trimStart().startsWith('#')) {
            continue;
        }
        const match = KEY.exec(line);
        if (match === null || /^\s/.test(line)) {
            return err(failure('frontmatter accepts top-level `key: value` entries only', lineNumber));
        }
        const [, key, raw] = match;
        if (seen.has(key)) {
            return err(failure(`frontmatter key \`${key}\` appears more than once`, lineNumber));
        }
        seen.add(key);

        const stripped = strip_comment(raw, lineNumber);
        if (!stripped.ok) {
            return stripped;
        }
        if (stripped.value.startsWith('[')) {
            const list = split_inline_items(raw, lineNumber);
            if (!list.ok) {
                return list;
            }
            entries.push([key, list.value]);
            continue;
        }
        if (stripped.value.length > 0) {
            const scalar = parse_scalar(raw, lineNumber);
            if (!scalar.ok) {
                return scalar;
            }
            entries.push([key, scalar.value]);
            continue;
        }

        const items: string[] = [];
        let listIndent: string | null = null;
        while (index + 1 < closingIndex) {
            const nextLine = lines[index + 1];
            if (nextLine.trim().length === 0 || nextLine.trimStart().startsWith('#')) {
                index += 1;
                continue;
            }
            const item = LIST_ITEM.exec(nextLine);
            if (item === null) {
                break;
            }
            if (listIndent === null) {
                listIndent = item[1];
            } else if (item[1] !== listIndent) {
                return err(
                    failure('frontmatter block-list items must use one consistent indentation level', index + 2)
                );
            }
            index += 1;
            const parsed = parse_scalar(item[2], index + 1);
            if (!parsed.ok) {
                return parsed;
            }
            if (parsed.value.length === 0) {
                return err(failure('frontmatter block list contains an empty item', index + 1));
            }
            items.push(parsed.value);
        }
        if (items.length === 0) {
            return err(failure(`frontmatter list \`${key}\` has no items`, lineNumber));
        }
        entries.push([key, items]);
    }

    return ok({
        fields: Object.fromEntries(entries),
        lines,
        frontmatterEndLine: closingIndex + 1,
    });
}

export function scalar_field(fields: FrontmatterFields, key: string): string | undefined {
    const value = fields[key];
    return typeof value === 'string' ? value : undefined;
}

export function list_field(fields: FrontmatterFields, key: string): readonly string[] | undefined {
    const value = fields[key];
    return Array.isArray(value) ? value : undefined;
}
