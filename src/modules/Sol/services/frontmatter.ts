import { type Result, ok, err } from '../../../infra/errors/result.ts';
import { createAppError } from '../../../infra/errors/createAppError.ts';
import type { IrMeta } from '../models/ir.ts';
import type { ParseFailure } from '../models/parseFailure.ts';

// The source split into lines plus the 1-based line number of the closing `---` fence. Pure.
export type FrontmatterSplit = Readonly<{
    lines: readonly string[];
    frontmatter_end_line: number;
}>;

// Locate the YAML frontmatter fence. The body begins on the line after `frontmatter_end_line`.
// Increment 1 needs only the fence boundary + a handful of scalar fields, so this is a deliberate
// line-scanner, not a full YAML parser (nested frontmatter would need one — a later concern).
export function split_frontmatter(source: string): Result<FrontmatterSplit, ParseFailure> {
    const lines = source.split('\n');
    if (lines[0] !== '---') {
        return err(
            createAppError('ParseFailure', 'source MUST begin with a `---` frontmatter fence', {
                reason: 'unparseable-frontmatter',
                line: 1,
            })
        );
    }
    for (let index = 1; index < lines.length; index += 1) {
        if (lines[index] === '---') {
            return ok({ lines, frontmatter_end_line: index + 1 });
        }
    }
    return err(
        createAppError('ParseFailure', 'frontmatter `---` fence is never closed', {
            reason: 'unparseable-frontmatter',
            line: null,
        })
    );
}

export type ParseMetaInput = Readonly<{
    lines: readonly string[];
    frontmatter_end_line: number;
}>;

// Read the scalar meta the IR needs (id, language, spec_version) from the frontmatter region.
export function parse_meta(input: ParseMetaInput): Result<IrMeta, ParseFailure> {
    const fields = new Map<string, string>();
    for (let index = 1; index < input.frontmatter_end_line - 1; index += 1) {
        const line = input.lines[index];
        const separator = line.indexOf(':');
        if (separator === -1) {
            continue;
        }
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        fields.set(key, value);
    }
    const id = fields.get('id');
    const language = fields.get('swarm_language');
    if (id === undefined || id === '' || language === undefined || language === '') {
        return err(
            createAppError('ParseFailure', 'frontmatter MUST declare a non-empty `id` and `swarm_language`', {
                reason: 'unparseable-frontmatter',
                line: null,
            })
        );
    }
    return ok({ id, language, spec_version: fields.get('spec_version') ?? '0.0.0' });
}
