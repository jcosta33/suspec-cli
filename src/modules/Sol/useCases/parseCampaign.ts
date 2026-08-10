import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { err, isErr, ok, type Result } from '../../../infra/errors/result.ts';
import { list_field, parse_frontmatter, scalar_field } from '../../../infra/frontmatter.ts';
import { atx_heading, scan_markdown } from '../../../infra/markdownScan.ts';

export type CampaignRecord = Readonly<{
    frontmatter: Readonly<{
        type: string | null;
        id: string | null;
        status: string | null;
        ledger: string | null;
        sources: readonly string[];
    }>;
    sectionTitles: readonly string[];
    sectionBodies: Readonly<Record<string, string>>;
    bodyText: string;
    taskListLines: readonly number[];
}>;

export type ParseCampaignResult = Result<
    CampaignRecord,
    AppError<'ParseFailure', { reason: string; line: number | null }>
>;

export function parse_campaign(source: string): ParseCampaignResult {
    const parsedFrontmatter = parse_frontmatter(source);
    if (isErr(parsedFrontmatter)) return err(parsedFrontmatter.error);

    const { fields, fieldLines, lines, frontmatterEndLine } = parsedFrontmatter.value;
    for (const key of ['type', 'id', 'status', 'ledger'] as const) {
        if (fields[key] !== undefined && typeof fields[key] !== 'string') {
            return err(
                createAppError('ParseFailure', `frontmatter \`${key}:\` must be a scalar`, {
                    reason: 'unparseable-frontmatter',
                    line: fieldLines[key] ?? null,
                })
            );
        }
    }
    if (fields.sources !== undefined && !Array.isArray(fields.sources)) {
        return err(
            createAppError('ParseFailure', 'frontmatter `sources:` must be a list', {
                reason: 'unparseable-frontmatter',
                line: fieldLines.sources ?? null,
            })
        );
    }

    const bodyLines = lines.slice(frontmatterEndLine);
    const scanned = scan_markdown(bodyLines);
    const sectionTitles: string[] = [];
    const sectionBodies = new Map<string, string[]>();
    const taskListLines: number[] = [];
    let currentSection: string | null = null;

    scanned.forEach((line, index) => {
        if (line.inFence) return;
        const heading = atx_heading(line.text);
        if (heading?.level === 2 && heading.title.length > 0) {
            currentSection = heading.title;
            sectionTitles.push(currentSection);
            const existing = sectionBodies.get(currentSection) ?? [];
            sectionBodies.set(currentSection, existing);
            return;
        }
        if (heading !== null && heading.level <= 2) {
            currentSection = null;
            return;
        }
        if (/^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+\[[ xX]\](?:[ \t]+.*)?$/.test(line.text)) {
            taskListLines.push(frontmatterEndLine + index + 1);
        }
        if (currentSection !== null) {
            sectionBodies.get(currentSection)?.push(line.text);
        }
    });

    return ok({
        frontmatter: {
            type: scalar_field(fields, 'type') ?? null,
            id: scalar_field(fields, 'id') ?? null,
            status: scalar_field(fields, 'status') ?? null,
            ledger: scalar_field(fields, 'ledger') ?? null,
            sources: list_field(fields, 'sources') ?? [],
        },
        sectionTitles,
        sectionBodies: Object.fromEntries([...sectionBodies].map(([title, body]) => [title, body.join('\n')])),
        bodyText: scanned
            .filter((line) => !line.inFence)
            .map((line) => line.text)
            .join('\n'),
        taskListLines,
    });
}
