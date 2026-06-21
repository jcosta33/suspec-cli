// A fence- and code-span-aware view of a markdown document. The hand-rolled artifact parsers
// (review packet, spec record, change plan) and the body-text checks (C004 strength words, C007
// TBD-at-ready) route their line scanning through this so a `## Requirement coverage` heading, a
// `### AC-001`, a `| … |` table row, a strength word, or a `TODO` marker that appears INSIDE a
// fenced code block or an inline-code span is read as verbatim example text, never as live
// structure. No markdown dependency — a small linear state machine. Pure.

export type ScannedLine = Readonly<{
    text: string; // the line, verbatim
    inFence: boolean; // the line is a fence delimiter or fenced content (verbatim, not structure)
    opensFence: boolean; // this line opens a fenced code block
    fenceInfo: string; // the info string after an opening fence marker (e.g. `verify id=…`); '' otherwise
}>;

const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/;

// Classify every line by whether it sits inside a fenced code block. An opening run of >= 3 of the
// same marker char (``` or ~~~) opens a fence; the next line that is only that marker char, run
// length >= the opener's, closes it (CommonMark). The fence delimiter lines are themselves marked
// inFence so a caller skipping inFence lines never mis-reads a delimiter as structure — but the
// opening line still exposes its `fenceInfo` so a caller (the review packet) can read a
// ```verify …``` info-string before skipping the verbatim body.
export function scan_markdown(lines: readonly string[]): ScannedLine[] {
    const out: ScannedLine[] = [];
    let marker: string | null = null; // the open fence's char ('`' or '~'), or null when not in a fence
    let runLen = 0;
    for (const text of lines) {
        if (marker === null) {
            const open = FENCE.exec(text);
            if (open !== null) {
                marker = open[2][0];
                runLen = open[2].length;
                out.push({ text, inFence: true, opensFence: true, fenceInfo: open[3].trim() });
                continue;
            }
            out.push({ text, inFence: false, opensFence: false, fenceInfo: '' });
            continue;
        }
        // Inside a fence: a closing fence is a line of only the marker char, run length >= the opener.
        const trimmed = text.trim();
        const isClose =
            trimmed.length >= runLen && trimmed.length > 0 && [...trimmed].every((ch) => ch === marker);
        out.push({ text, inFence: true, opensFence: false, fenceInfo: '' });
        if (isClose) {
            marker = null;
            runLen = 0;
        }
    }
    return out;
}

// Blank out inline-code spans (`` `…` ``, including multi-backtick runs) with equal-length spaces,
// so a downstream scan (strength words, a `|` table delimiter, a TBD marker) never matches inside a
// code span. Length is preserved so a caller can map a position in the result back onto the original
// line. A GFM backslash-escaped char (`\|`, `` \` ``) is kept verbatim and never opens a span. An
// unclosed backtick run is treated as literal text.
export function strip_inline_code(line: string): string {
    let out = '';
    let i = 0;
    while (i < line.length) {
        if (line[i] === '\\' && i + 1 < line.length) {
            out += line[i] + line[i + 1];
            i += 2;
            continue;
        }
        if (line[i] === '`') {
            let n = 0;
            while (i + n < line.length && line[i + n] === '`') {
                n += 1;
            }
            let j = i + n;
            let close = -1;
            while (j < line.length) {
                if (line[j] === '`') {
                    let m = 0;
                    while (j + m < line.length && line[j + m] === '`') {
                        m += 1;
                    }
                    if (m === n) {
                        close = j;
                        break;
                    }
                    j += m;
                    continue;
                }
                j += 1;
            }
            if (close !== -1) {
                out += ' '.repeat(close + n - i);
                i = close + n;
                continue;
            }
            out += line.slice(i, i + n);
            i += n;
            continue;
        }
        out += line[i];
        i += 1;
    }
    return out;
}

// The non-fenced, inline-code-stripped text of a scanned document — what a body-level check (C007)
// should scan so a marker inside a fence or a code span is invisible.
export function visible_text(scanned: readonly ScannedLine[]): string {
    return scanned
        .filter((line) => !line.inFence)
        .map((line) => strip_inline_code(line.text))
        .join('\n');
}

// A logical markdown block — the structure model the field parsers were missing (they read physical
// lines, so a soft-wrapped bullet or a label-then-list layout dropped its tail). A `list-item` or
// `paragraph` FOLDS its soft-wrapped continuation lines (a CommonMark lazy continuation: a following
// non-blank line that is not itself a list item, a heading, or fenced) into one logical `text`; a
// blank line, a new list item, a heading, or a fence ends the block. Fenced content is excluded
// entirely (verbatim example text, never structure). `text` keeps backticks intact (path/code tokens
// live there); use `strip_inline_code` separately for prose scans.
export type LogicalBlock = Readonly<{
    kind: 'list-item' | 'heading' | 'paragraph';
    indent: number; // leading spaces before the marker (list-item / heading) or the content (paragraph)
    marker: string; // the list marker (`-`/`*`/`+`/`1.`) or the heading hashes (`##`); '' for a paragraph
    text: string; // the logical content with soft-wrapped continuation lines folded in (joined by ' ')
    startLine: number; // 0-based index of the block's first line in the input
}>;

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const BLOCK_HEADING = /^(\s*)(#{1,6})\s+(.*)$/;

export function logical_blocks(lines: readonly string[]): LogicalBlock[] {
    const scanned = scan_markdown(lines);
    const blocks: LogicalBlock[] = [];
    let open: { kind: 'list-item' | 'paragraph'; indent: number; marker: string; parts: string[]; startLine: number } | null = null;
    const flush = (): void => {
        if (open !== null) {
            blocks.push({ kind: open.kind, indent: open.indent, marker: open.marker, text: open.parts.join(' ').trim(), startLine: open.startLine });
            open = null;
        }
    };
    for (let index = 0; index < lines.length; index += 1) {
        if (scanned[index].inFence) {
            flush();
            continue;
        }
        const line = lines[index];
        if (line.trim().length === 0) {
            flush();
            continue;
        }
        const item = LIST_ITEM.exec(line);
        if (item !== null) {
            flush();
            open = { kind: 'list-item', indent: item[1].length, marker: item[2], parts: [item[3]], startLine: index };
            continue;
        }
        const heading = BLOCK_HEADING.exec(line);
        if (heading !== null) {
            flush();
            blocks.push({ kind: 'heading', indent: heading[1].length, marker: heading[2], text: heading[3].trim(), startLine: index });
            continue;
        }
        // A non-blank, non-item, non-heading, non-fenced line: fold it into the open block (a lazy
        // continuation), or start a fresh paragraph.
        if (open !== null) {
            open.parts.push(line.trim());
        } else {
            open = { kind: 'paragraph', indent: line.length - line.trimStart().length, marker: '', parts: [line.trim()], startLine: index };
        }
    }
    flush();
    return blocks;
}
