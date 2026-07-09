// Merge a Suspec-managed block into a user file without disturbing the user's other content
// (AC-016). The block is delimited by start/end markers: if the file already has that block it is
// replaced in place (so a re-run is idempotent); otherwise it is appended. Used for the living PR
// digest comment (doneDigest) — one marker-tagged block upserted in place across `suspec done` runs.

export type MergeMarkerBlockInput = Readonly<{
    existing: string;
    block: string;
    startMarker: string;
    endMarker: string;
}>;

function escape_regex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function merge_marker_block(input: MergeMarkerBlockInput): string {
    const managed = `${input.startMarker}\n${input.block.trim()}\n${input.endMarker}\n`;
    const blockPattern = new RegExp(`${escape_regex(input.startMarker)}[\\s\\S]*?${escape_regex(input.endMarker)}\\n?`);

    if (blockPattern.test(input.existing)) {
        return input.existing.replace(blockPattern, managed);
    }
    if (input.existing.trim().length === 0) {
        return managed;
    }
    const base = input.existing.endsWith('\n') ? input.existing : `${input.existing}\n`;
    return `${base}\n${managed}`;
}

// Whether a file already carries the managed block (used by the report to label a "merged" target).
export function has_marker_block(existing: string, startMarker: string): boolean {
    return existing.includes(startMarker);
}
