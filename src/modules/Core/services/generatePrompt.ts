// Generate the launch prompt `suspec work` hands the runner (SPEC-suspec-v2 AC-006). PURE (inputs
// in, string out). The prompt is a POINTER INTO THE STORE, not a plan: it carries the ABSOLUTE
// paths of the driving spec and the run file, instructs the agent to read the spec and append its
// run/evidence notes to the run file DIRECTLY, and stops — no spec body is copied, and no other
// store artifact is referenced (only the driving spec auto-loads; ADR-0137 D2/D4/D6). It stays on
// the safe side of the launcher boundary: the CLI templates a prompt, it never becomes the model
// loop (ADR-0136 D3).

export type GeneratePromptInput = Readonly<{
    specId: string;
    specPath: string; // the driving spec's ABSOLUTE store path
    runPath: string; // the run file's ABSOLUTE store path
}>;

export function generate_prompt(input: GeneratePromptInput): string {
    const lines: string[] = [];
    lines.push(`You are working on Suspec spec ${input.specId}.`);
    lines.push('');
    lines.push('Read first:');
    lines.push(`- the spec at ${input.specPath}`);
    lines.push('- AGENTS.md / CLAUDE.md in this repo, if present');
    lines.push('');
    lines.push(`Your run file is ${input.runPath} — append your run and evidence notes to it directly`);
    lines.push('as you work: commands run, verbatim output, files changed, blockers. Do not move or');
    lines.push('summarize the spec; read it where it is.');
    lines.push('');
    lines.push('Do the smallest correct change that satisfies the spec. Stay inside its scope; if a');
    lines.push('requirement cannot be met as written, stop and say why instead of improvising.');
    lines.push('Run every Verify item and paste the real output — a claim without output is unverified.');
    lines.push('');
    lines.push('Before you stop: list the changed files, the checks you ran and their result, and any');
    lines.push('blocker or unresolved question.');
    return lines.join('\n');
}
