// The spec-author prompt `suspec write spec --launch` dispatches (SPEC-suspec-v2 AC-023). PURE
// (inputs in, string out) — a POINTER at the scaffolded store spec, like generate_prompt: the CLI
// scaffolds the skeleton and authors NO requirement content itself; the prompt instructs the
// runner's model to interrogate the intent into acceptance criteria IN PLACE. Same launcher
// boundary as ever (ADR-0136 D3): template a prompt, never become the model loop.

export type GenerateSpecAuthorPromptInput = Readonly<{
    specId: string;
    specPath: string; // the scaffolded spec's ABSOLUTE store path
    intent: string; // the one-line intent the skeleton was cut from
}>;

export function generate_spec_author_prompt(input: GenerateSpecAuthorPromptInput): string {
    const lines: string[] = [];
    lines.push(`You are authoring Suspec spec ${input.specId}.`);
    lines.push('');
    lines.push(`The scaffolded spec is at ${input.specPath} — edit it IN PLACE.`);
    lines.push(`Stated intent: ${input.intent}`);
    lines.push('');
    lines.push('Interrogate the intent into acceptance criteria: ask what observable behavior would');
    lines.push('prove it done, split every independent behavior into its own `### AC-NNN` requirement,');
    lines.push('and give each exactly one binding strength word (MUST/SHOULD/…) and its own');
    lines.push('`Verify with:` line naming a real command or check. Record what you deliberately');
    lines.push('exclude under Non-goals, and any unresolved ambiguity under Open questions — never');
    lines.push('guess past one. Keep the frontmatter keys as they are (type, id, status, base_sha).');
    lines.push('Leave `status: draft`; a human promotes it to ready.');
    return lines.join('\n');
}
