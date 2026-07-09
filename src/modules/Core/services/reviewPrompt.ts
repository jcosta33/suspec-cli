// The single-reviewer prompt `suspec check-my-work` dispatches (SPEC-suspec-v2 AC-021). PURE
// (inputs in, string out) — generate_prompt's store-free sibling: there is no spec and no run
// file to point at, so the prompt carries the one-line INTENT and the DIFF SUMMARY (the changed
// files against the named base) and instructs the reviewer to review the working tree
// adversarially, reporting findings as file:line. It stays on the safe side of the launcher
// boundary (ADR-0136 D3): the CLI templates a prompt; the reviewer is the runner's model, never
// the CLI.

export type GenerateReviewPromptInput = Readonly<{
    intent: string; // the one-line intent the developer stated
    baseRef: string; // what the diff was taken against (a branch, or HEAD for uncommitted work)
    changedFiles: readonly string[]; // repo-relative paths — the diff summary
}>;

export function generate_review_prompt(input: GenerateReviewPromptInput): string {
    const lines: string[] = [];
    lines.push('You are reviewing the current repository diff — adversarially.');
    lines.push('');
    lines.push(`Stated intent: ${input.intent}`);
    lines.push('');
    lines.push(`Diff summary (${input.changedFiles.length} file(s) changed against ${input.baseRef}):`);
    for (const file of input.changedFiles) {
        lines.push(`- ${file}`);
    }
    lines.push('');
    lines.push('Read the actual diff yourself (git diff / git status) — the list above is only the map.');
    lines.push('Refute by default: assume the change is wrong until the code convinces you otherwise.');
    lines.push('Check that the diff does what the stated intent says — no more, no less: flag');
    lines.push('unrelated edits, missing pieces, broken edge cases, and untested behavior.');
    lines.push('');
    lines.push('Report every finding as file:line with one sentence on what is wrong and why it');
    lines.push('matters. End with a one-line summary: the count of findings, or "no findings".');
    return lines.join('\n');
}
