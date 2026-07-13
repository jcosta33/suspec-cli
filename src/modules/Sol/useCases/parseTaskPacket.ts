import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { err, isErr, ok, type Result } from '../../../infra/errors/result.ts';
import { list_field, parse_frontmatter, scalar_field } from '../../../infra/frontmatter.ts';
import { scan_markdown, visible_text } from '../../../infra/markdownScan.ts';

export type TaskPacket = Readonly<{
    frontmatter: Readonly<{
        type: string | null;
        id: string | null;
        source: readonly string[];
        scope: readonly string[];
        status: string | null;
    }>;
    sectionTitles: readonly string[];
    verifyBody: string;
    bodyText: string;
}>;

export type ParseTaskPacketResult = Result<
    TaskPacket,
    AppError<'ParseFailure', { reason: string; line: number | null }>
>;

const SECTION_HEADING = /^##\s+(.+?)\s*$/;

export function parse_task_packet(source: string): ParseTaskPacketResult {
    const parsedFrontmatter = parse_frontmatter(source);
    if (isErr(parsedFrontmatter)) {
        return err(parsedFrontmatter.error);
    }
    const { fields, lines, frontmatterEndLine } = parsedFrontmatter.value;
    for (const key of ['type', 'id', 'status'] as const) {
        if (fields[key] !== undefined && typeof fields[key] !== 'string') {
            return err(
                createAppError('ParseFailure', `frontmatter \`${key}:\` must be a scalar`, {
                    reason: 'unparseable-frontmatter',
                    line: null,
                })
            );
        }
    }
    for (const key of ['source', 'scope'] as const) {
        if (fields[key] !== undefined && !Array.isArray(fields[key])) {
            return err(
                createAppError('ParseFailure', `frontmatter \`${key}:\` must be a list`, {
                    reason: 'unparseable-frontmatter',
                    line: null,
                })
            );
        }
    }

    const bodyLines = lines.slice(frontmatterEndLine);
    const scanned = scan_markdown(bodyLines);
    const sectionTitles: string[] = [];
    let inVerify = false;
    let verifyBody = '';
    for (const line of scanned) {
        if (line.inFence) {
            if (inVerify) {
                verifyBody += `${line.text}\n`;
            }
            continue;
        }
        const heading = SECTION_HEADING.exec(line.text);
        if (heading !== null) {
            sectionTitles.push(heading[1]);
            inVerify = heading[1].toLowerCase() === 'verify';
            continue;
        }
        if (inVerify) {
            verifyBody += `${line.text}\n`;
        }
    }

    return ok({
        frontmatter: {
            type: scalar_field(fields, 'type') ?? null,
            id: scalar_field(fields, 'id') ?? null,
            source: list_field(fields, 'source') ?? [],
            scope: list_field(fields, 'scope') ?? [],
            status: scalar_field(fields, 'status') ?? null,
        },
        sectionTitles,
        verifyBody,
        bodyText: visible_text(scanned),
    });
}
