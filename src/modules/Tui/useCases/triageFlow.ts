// The findings-triage prompt loop inside `suspec done` (SPEC-suspec-v2 AC-015): one select per
// open finding — promote (gh issue), keep (expiry stamped), or discard (archive). Pure prompt
// logic over the injected Prompter (tested with the mock; the clack adapter is the shell): it
// COLLECTS choices and applies nothing — the command owns the writes and the critical-discard
// guard. A cancelled prompt defers that finding and every remaining one (expiry-stamped, exactly
// like non-interactive `done`), so bailing out mid-triage never drops a finding on the floor.

import { is_cancelled, type Prompter } from './prompter.ts';

export type TriageFinding = Readonly<{ filename: string; title: string; severity: string | null }>;

export type TriageAction = 'promote' | 'keep' | 'discard' | 'defer';

export type TriageDecision = Readonly<{ filename: string; action: TriageAction }>;

export async function run_triage_flow(
    prompter: Prompter,
    findings: readonly TriageFinding[]
): Promise<TriageDecision[]> {
    prompter.intro(`triage — ${findings.length} open finding(s)`);
    const decisions: TriageDecision[] = [];
    let cancelled = false;
    for (const finding of findings) {
        if (cancelled) {
            decisions.push({ filename: finding.filename, action: 'defer' });
            continue;
        }
        const severity = finding.severity !== null ? ` [${finding.severity}]` : '';
        const choice = await prompter.select({
            message: `${finding.filename}${severity} — ${finding.title}`,
            options: [
                { value: 'promote', label: 'promote', hint: 'create a gh issue and archive the finding' },
                { value: 'keep', label: 'keep', hint: 'stays in the store with an expiry date' },
                {
                    value: 'discard',
                    label: 'discard',
                    hint:
                        finding.severity === 'critical'
                            ? 'critical — refused unless done ran with --discard-critical'
                            : 'archive it unpromoted',
                },
            ],
        });
        if (is_cancelled(choice)) {
            cancelled = true;
            decisions.push({ filename: finding.filename, action: 'defer' });
            continue;
        }
        decisions.push({ filename: finding.filename, action: choice as TriageAction });
    }
    prompter.outro('triage collected — done applies it');
    return decisions;
}
