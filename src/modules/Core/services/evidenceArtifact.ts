// The evidence record's CLI-owned grammar (SPEC-suspec-v2 AC-010/AC-012). `suspec evidence add`
// runs a command itself and writes TWO files under `evidence/<run>/`: the raw captured output
// (`<seq>-<slug>.out`, byte-exact, never inlined anywhere) and the markdown record
// (`<seq>-<slug>.md`) whose frontmatter carries the mapping (run, ac, command, exit), the
// provenance, the staleness digest (AC-012), and the CAPTURE BLOCK — `capture_file` /
// `capture_bytes` / `capture_sha256`, the structural marker only the CLI's capture path writes.
// A hand-authored record claiming `provenance: cli-verified` cannot back that block with a
// consistent raw file, which is exactly what the lint checks (AC-013). PURE (strings in, strings
// out); the writes live in add_evidence.

import { createHash } from 'crypto';

import { fm_scalar, read_frontmatter } from './readFrontmatter.ts';

// The provenance values the grammar admits: `cli-verified` is reserved for the CLI capture path;
// anything an agent or developer writes by hand records `agent` or `dev` (AC-010).
export const EVIDENCE_PROVENANCES = ['cli-verified', 'agent', 'dev'] as const;
export type EvidenceProvenance = (typeof EVIDENCE_PROVENANCES)[number];

// `<seq>-<slug>` — the shared stem of the .md record and its .out raw capture.
export function evidence_stem(seq: number, slug: string): string {
    return `${String(seq).padStart(3, '0')}-${slug}`;
}

// A filesystem-safe slug for the captured command (`pnpm test:run` → `pnpm-test-run`), capped so
// a long argv never produces an unwieldy filename.
export function evidence_slug(command: readonly string[]): string {
    const slug = command
        .join(' ')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40)
        .replace(/-+$/, '');
    return slug.length > 0 ? slug : 'cmd';
}

// The next sequence number for a run's evidence dir, from the names already in it (001-… → 2).
export function next_evidence_seq(existingNames: readonly string[]): number {
    let max = 0;
    for (const name of existingNames) {
        const match = /^(\d+)-/.exec(name);
        if (match !== null) {
            max = Math.max(max, Number.parseInt(match[1], 10));
        }
    }
    return max + 1;
}

export function capture_sha256(raw: string): string {
    return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export type EvidenceFields = Readonly<{
    runSlug: string;
    ac: string;
    command: readonly string[];
    exit: number;
    worktree: string;
    capturedAt: string; // ISO timestamp
    worktreeDiffSha: string; // the AC-012 staleness digest at capture
    captureFile: string; // `<seq>-<slug>.out` — the raw output stored beside this record
    captureBytes: number;
    captureSha256: string;
}>;

// The full content of a fresh cli-verified evidence record. grammar_version is injected by
// write_store_artifact (AC-003); this service builds only the fields it owns. The recorded
// command string is whitespace-collapsed onto one line — an argv element carrying a newline must
// not inject frontmatter keys into the record.
export function build_evidence_content(fields: EvidenceFields): string {
    return [
        '---',
        'type: evidence',
        `run: ${fields.runSlug}`,
        `ac: ${fields.ac}`,
        `command: ${fields.command.join(' ').replace(/\s+/g, ' ')}`,
        `exit: ${fields.exit}`,
        'provenance: cli-verified',
        `captured_at: ${fields.capturedAt}`,
        `worktree: ${fields.worktree}`,
        `worktree_diff_sha: ${fields.worktreeDiffSha}`,
        `capture_file: ${fields.captureFile}`,
        `capture_bytes: ${fields.captureBytes}`,
        `capture_sha256: ${fields.captureSha256}`,
        '---',
        '',
        `# Evidence — ${fields.ac}`,
        '',
        `Captured by \`suspec evidence add\`. The raw output lives beside this record in`,
        `${fields.captureFile} — it never leaves the store (AC-014).`,
        '',
    ].join('\n');
}

// The parsed view of one evidence record — whatever wrote it. Absent fields read null so the
// lint/gate can surface the gap instead of crashing on a hand-authored file.
export type EvidenceRecord = Readonly<{
    filename: string; // the .md basename
    ac: string | null;
    command: string | null;
    exit: number | null;
    provenance: string | null;
    worktree: string | null;
    worktreeDiffSha: string | null;
    captureFile: string | null;
    captureBytes: number | null;
    captureSha256: string | null;
}>;

function parse_int_or_null(raw: string | undefined): number | null {
    if (raw === undefined) {
        return null;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

export function read_evidence_record(filename: string, content: string): EvidenceRecord {
    const fm = read_frontmatter(content);
    return {
        filename,
        ac: fm_scalar(fm.ac) ?? null,
        command: fm_scalar(fm.command) ?? null,
        exit: parse_int_or_null(fm_scalar(fm.exit)),
        provenance: fm_scalar(fm.provenance) ?? null,
        worktree: fm_scalar(fm.worktree) ?? null,
        worktreeDiffSha: fm_scalar(fm.worktree_diff_sha) ?? null,
        captureFile: fm_scalar(fm.capture_file) ?? null,
        captureBytes: parse_int_or_null(fm_scalar(fm.capture_bytes)),
        captureSha256: fm_scalar(fm.capture_sha256) ?? null,
    };
}

// --- the run file's evidence table (AC-010: `evidence add` appends an entry) --------------------

const EVIDENCE_HEADING = /^## Evidence\s*$/m;
const TABLE_HEADER = ['| evidence | ac | exit | provenance |', '| --- | --- | --- | --- |'];

export type EvidenceRow = Readonly<{ stem: string; ac: string; exit: number; provenance: EvidenceProvenance }>;

function render_row(row: EvidenceRow): string {
    return `| ${row.stem} | ${row.ac} | ${row.exit} | ${row.provenance} |`;
}

// Append one row to the run file's `## Evidence` table — creating the section (at EOF) when the
// run body has none yet, inserting after the section's last table line when it does. The rest of
// the body (agent-owned) is preserved byte-for-byte.
export function append_evidence_row(runContent: string, row: EvidenceRow): string {
    const match = EVIDENCE_HEADING.exec(runContent);
    if (match === null) {
        const base = runContent.endsWith('\n') ? runContent : `${runContent}\n`;
        return `${base}\n## Evidence\n\n${TABLE_HEADER.join('\n')}\n${render_row(row)}\n`;
    }
    // Walk from the heading to the end of its contiguous table block (the last `|`-led line).
    const lines = runContent.split('\n');
    const headingIndex = runContent.slice(0, match.index).split('\n').length - 1;
    let insertAfter = headingIndex;
    for (let i = headingIndex + 1; i < lines.length; i += 1) {
        const line = lines[i].trim();
        if (line.startsWith('|')) {
            insertAfter = i;
        } else if (line.length > 0) {
            break;
        }
    }
    if (insertAfter === headingIndex) {
        // A bare `## Evidence` heading with no table yet — lay the header down with the first row.
        lines.splice(headingIndex + 1, 0, '', ...TABLE_HEADER, render_row(row));
    } else {
        lines.splice(insertAfter + 1, 0, render_row(row));
    }
    return lines.join('\n');
}
