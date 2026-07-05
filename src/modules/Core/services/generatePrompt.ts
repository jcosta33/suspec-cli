// Generate the lean launch prompt `suspec work` hands the agent (SPEC-suspec-cli-work AC-004). PURE
// (inputs in, string out). The prompt is a POINTER, not a plan: it names the spec (and task, if any) and
// the paths to read, states the role, and stops — it inlines no spec body and does no reasoning, so it
// stays on the safe side of the boundary (ADR-0136 D3 / ADR-0077 D6: the CLI templates a prompt, it does
// not become the model loop). The command writes the result to gitignored scratch, never a committed
// artifact.

export type GeneratePromptInput = Readonly<{
    specId: string;
    specPath: string;
    taskId?: string;
    taskPath?: string;
    adapterName: string;
}>;

export function generate_prompt(input: GeneratePromptInput): string {
    const lines: string[] = [];
    lines.push(`You are working on Suspec spec ${input.specId}.`);
    lines.push('');
    lines.push('Read first:');
    lines.push(`- the spec at ${input.specPath}`);
    if (input.taskId !== undefined && input.taskPath !== undefined) {
        lines.push(`- the task packet ${input.taskId} at ${input.taskPath} — stay within its scope`);
    }
    lines.push('- AGENTS.md / CLAUDE.md in this repo, if present');
    lines.push('');
    lines.push('Do the smallest correct change that satisfies the spec. Stay inside its scope; if a');
    lines.push('requirement cannot be met as written, stop and say why instead of improvising.');
    lines.push('Run every Verify item and paste the real output — a claim without output is unverified.');
    lines.push('The review anchors on the spec, not the task.');
    lines.push('');
    lines.push('Before you stop: list the changed files, the checks you ran and their result, and any');
    lines.push('blocker or unresolved question.');
    return lines.join('\n');
}
