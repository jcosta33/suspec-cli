// Parse a review packet's markdown into the ReviewPacket record the structural + coverage reconciles
// key on (M2, AC-019/020/021). Pure: source string in, record out. A light line-scanner (like the
// spec parser), not a full markdown engine — it reads the frontmatter `status`, the H2 section
// titles, and the Requirement coverage table's rows (ID / Result / Evidence).
//
// The coverage table is the GFM pipe table under `## Requirement coverage`: a header row
// (`| ID | Result | Evidence | Human attention |`), a `|---|` separator, then data rows. Template
// placeholder rows (`| AC-001 | Pass | {{test}} … |`) and the example rows shipped in the template
// are real-looking; the engine only parses a packet a real run produced, and a row whose id is not a
// requirement id is simply read as an orphan by C012 — no special-casing here.

import type { CoverageRow, ReviewPacket } from './reconcileFacts.ts';

const FRONTMATTER_FENCE = '---';
const STATUS_KEY = /^status:\s*(.*)$/;
const SECTION_HEADING = /^##\s+(.+?)\s*$/;
const COVERAGE_HEADING = /^##\s+Requirement coverage\s*$/i;
const REQUIREMENT_ID = /^[A-Z][A-Z0-9]*-\d+$/;

// The cells of a GFM table row (`| a | b | c |`), trimmed, surrounding empties from the outer pipes
// dropped. A non-table line yields null.
function table_cells(line: string): string[] | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
        return null;
    }
    const cells = trimmed.split('|').map((cell) => cell.trim());
    // `| a | b |`.split('|') → ['', ' a ', ' b ', ''] → drop the leading/trailing empties.
    cells.shift();
    cells.pop();
    return cells;
}

// A markdown table separator row (`|---|:--:|`): every cell is dashes/colons only.
function is_separator_row(cells: readonly string[]): boolean {
    return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function read_frontmatter_status(lines: readonly string[]): string | null {
    if (lines[0] !== FRONTMATTER_FENCE) {
        return null;
    }
    for (let index = 1; index < lines.length && lines[index] !== FRONTMATTER_FENCE; index += 1) {
        const match = STATUS_KEY.exec(lines[index]);
        if (match !== null) {
            const value = match[1].trim();
            return value.length > 0 ? value : null;
        }
    }
    return null;
}

export function parse_review_packet(source: string): ReviewPacket {
    const lines = source.split(/\r\n|[\r\n]/);
    const status = read_frontmatter_status(lines);

    const sectionTitles: string[] = [];
    const coverageRows: CoverageRow[] = [];
    let inCoverage = false;

    for (const line of lines) {
        if (COVERAGE_HEADING.test(line)) {
            sectionTitles.push('Requirement coverage');
            inCoverage = true;
            continue;
        }
        const heading = SECTION_HEADING.exec(line);
        if (heading !== null) {
            sectionTitles.push(heading[1]);
            inCoverage = false;
            continue;
        }
        if (!inCoverage) {
            continue;
        }
        const cells = table_cells(line);
        if (cells === null || cells.length === 0) {
            continue;
        }
        // Skip the header row (`ID | Result | …`) and the `|---|` separator.
        if (is_separator_row(cells) || cells[0].toLowerCase() === 'id') {
            continue;
        }
        // A data row keys on a requirement id in column 1; read ID + Result + Evidence (absent → '').
        if (REQUIREMENT_ID.test(cells[0])) {
            coverageRows.push({ id: cells[0], result: cells[1] ?? '', evidence: cells[2] ?? '' });
        }
    }

    return { status, sectionTitles, coverageRows };
}
