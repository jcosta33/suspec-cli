import { type Result, ok, err } from '../../../infra/errors/result.ts';
import { createAppError } from '../../../infra/errors/createAppError.ts';
import type { ParseFailure } from '../models/parseFailure.ts';

// The source split into lines plus the 1-based line number of the closing `---` fence. Pure.
export type FrontmatterSplit = Readonly<{
    lines: readonly string[];
    frontmatter_end_line: number;
}>;

const BOM = 0xfeff;

// Locate the YAML frontmatter fence. The body begins on the line after `frontmatter_end_line`.
// Increment 1 needs only the fence boundary + a handful of scalar fields, so this is a deliberate
// line-scanner, not a full YAML parser (nested frontmatter would need one — a later concern).
export function split_frontmatter(source: string): Result<FrontmatterSplit, ParseFailure> {
    // Tolerate CRLF (Windows) line endings + a leading UTF-8 BOM, else `lines[0]` is `'---\r'` (or
    // BOM-prefixed) and a well-formed spec is wrongly rejected as having no frontmatter fence.
    const text = source.charCodeAt(0) === BOM ? source.slice(1) : source;
    const lines = text.split(/\r\n|[\r\n]/);
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
