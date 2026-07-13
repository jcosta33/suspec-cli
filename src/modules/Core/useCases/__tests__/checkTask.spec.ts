import { describe, expect, it } from 'vitest';

import { assertErr } from '../../../../infra/errors/testing/assertErr.ts';
import { assertOk } from '../../../../infra/errors/testing/assertOk.ts';
import { check_task } from '../checkTask.ts';

const TASK = `---
type: task
id: TASK-x
source: [SPEC-x]
scope: [AC-001]
status: closed
---

## Source
SPEC-x
## Scope
AC-001
## Do not change
None.
## Affected areas
One file.
## Verify
n/a: documentation-only change
## Agent instructions
Make the change.
## Findings
None.
## Run summary
Verified above.
`;

function task(status: string, verify: string, findings = 'None.'): string {
    return TASK.replace('status: closed', `status: ${status}`)
        .replace('n/a: documentation-only change', verify)
        .replace('## Findings\nNone.', `## Findings\n${findings}`);
}

describe('check_task', () => {
    it('returns a clean report for a complete task', () => {
        expect(assertOk(check_task(TASK, 'task.md'))).toMatchObject({ level: 'clean', diagnostics: [] });
    });

    it('returns parser failures without manufacturing diagnostics', () => {
        expect(assertErr(check_task('# no frontmatter\n', 'task.md'))._tag).toBe('ParseFailure');
    });

    it.each(['ready', 'running'])('does not run C023 for a %s task with pending template evidence', (status) => {
        const pending = task(status, '{{cmd}}\n\nExit status: {{exit}}\n\n```text\n{{output}}\n```');
        const report = assertOk(check_task(pending, 'task.md'));
        expect(report.diagnostics.filter((diagnostic) => diagnostic.code === 'C023')).toEqual([]);
    });

    it('leaves an untouched ready task template shape clean', () => {
        const ready = task('ready', '{{cmd}}\n\nExit status: {{exit}}\n\n```text\n{{output}}\n```');
        expect(assertOk(check_task(ready, 'task.md'))).toMatchObject({ level: 'clean', diagnostics: [] });
    });

    it.each(['review-ready', 'closed'])('requires completed evidence for a %s task', (status) => {
        const report = assertOk(check_task(task(status, 'Pending.'), 'task.md'));
        expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('C023');
    });

    it('rejects a fenced bare claim without a numeric Exit status', () => {
        const report = assertOk(check_task(task('review-ready', '```text\nTests passed.\n```'), 'task.md'));
        expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('C023');
    });

    it.each([
        ['backtick', '```text\n1 test passed\n```'],
        ['tilde', '~~~text\n1 test passed\n~~~'],
    ])('accepts numeric Exit status plus non-empty %s-fenced raw output', (_name, fence) => {
        const report = assertOk(check_task(task('review-ready', `Exit status: 0\n\n${fence}`), 'task.md'));
        expect(report.diagnostics.filter((diagnostic) => diagnostic.code === 'C023')).toEqual([]);
    });

    it.each(['tests passed', 'TEST PASSED.', 'all checks succeeded', 'CHECKS SUCCEEDED.'])(
        'rejects numeric Exit status plus a sole generic completion claim: %s',
        (claim) => {
            const verify = `Exit status: 0\n\n\`\`\`text\n\n${claim}\n\n\`\`\``;
            const report = assertOk(check_task(task('review-ready', verify), 'task.md'));
            expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('C023');
        }
    );

    it.each(['pending', 'PENDING.', 'TBD', 'TODO', '???', '{{output}}'])(
        'rejects numeric Exit status plus an untouched fenced placeholder: %s',
        (placeholder) => {
            const verify = `Exit status: 0\n\n\`\`\`text\n${placeholder}\n\`\`\``;
            const report = assertOk(check_task(task('review-ready', verify), 'task.md'));
            expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('C023');
        }
    );

    it('rejects a placeholder fence even when another fence contains valid raw output', () => {
        const verify = [
            'Exit status: 0',
            '',
            '```text',
            '{{output}}',
            '```',
            '',
            '```text',
            'PASS src/auth.spec.ts (3 tests)',
            '```',
        ].join('\n');
        const report = assertOk(check_task(task('review-ready', verify), 'task.md'));
        expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('C023');
    });

    it.each([
        'PASS src/auth.spec.ts (3 tests)',
        'Tests: 12 passed, 12 total',
        'tests passed\nDuration: 1.2s',
        'Implementation Complete',
        'checks succeeded!',
        'done',
    ])('retains deterministic raw output that is not a sole generic completion claim: %s', (output) => {
        const verify = `Exit status: 0\n\n\`\`\`text\n${output}\n\`\`\``;
        const report = assertOk(check_task(task('review-ready', verify), 'task.md'));
        expect(report.diagnostics.filter((diagnostic) => diagnostic.code === 'C023')).toEqual([]);
    });

    it('requires a non-empty fenced raw-output block with the numeric Exit status', () => {
        const report = assertOk(check_task(task('review-ready', 'Exit status: 0\n\n```text\n```'), 'task.md'));
        expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('C023');
    });

    it('does not let an H1 extend the Verify section', () => {
        const verify = '# Outside Verify\n\nExit status: 0\n\n```text\n1 test passed\n```';
        const report = assertOk(check_task(task('review-ready', verify), 'task.md'));
        expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('C023');
    });

    it('rejects a placeholder Exit status even when fenced raw output is non-empty', () => {
        const report = assertOk(
            check_task(task('review-ready', 'Exit status: {{exit}}\n\n```text\n1 test passed\n```'), 'task.md')
        );
        expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('C023');
    });

    it('rejects canonical template placeholders inside inline code', () => {
        const verify = [
            '- Command: `{{exact source check}}`',
            '- Working directory: `{{absolute path}}`',
            '- State: `{{commit or stable snapshot}}`',
            '- Exit status: 0',
            '- Raw output:',
            '  ```text',
            '  PASS src/auth.spec.ts (3 tests)',
            '  ```',
        ].join('\n');
        const report = assertOk(check_task(task('review-ready', verify), 'task.md'));
        expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('C023');
    });

    it('accepts an explicit CI field or explicitly justified n/a without pasted output', () => {
        for (const verify of [
            'CI: https://ci.example.test/runs/1',
            'CI link: https://ci.example.test/runs/2',
            'n/a: verified by external release process',
        ]) {
            const report = assertOk(check_task(task('review-ready', verify), 'task.md'));
            expect(report.diagnostics.filter((diagnostic) => diagnostic.code === 'C023')).toEqual([]);
        }
    });

    it.each([
        'Build log: https://ci.example.test/runs/1',
        'See https://ci.example.test/runs/1',
        'https://ci.example.test/runs/1',
    ])('rejects a URL that is not on an explicit CI field: %s', (verify) => {
        const report = assertOk(check_task(task('review-ready', verify), 'task.md'));
        expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('C023');
    });

    it('accepts the canonical numeric Exit status field with fenced output', () => {
        const report = assertOk(
            check_task(task('review-ready', 'Exit status: 0\n\n```text\n1 test passed\n```'), 'task.md')
        );
        expect(report.diagnostics.filter((diagnostic) => diagnostic.code === 'C023')).toEqual([]);
    });

    it('ignores placeholders in fenced raw output but rejects them in visible Verify prose', () => {
        const raw = task('review-ready', 'Exit status: 0\n\n```text\nTODO TBD ??? are fixture values\n```');
        expect(assertOk(check_task(raw, 'task.md')).diagnostics.filter((d) => d.code === 'C023')).toEqual([]);

        const prose = task('review-ready', 'TODO rerun\n\nExit status: 0\n\n```text\nok\n```');
        expect(assertOk(check_task(prose, 'task.md')).diagnostics.map((d) => d.code)).toContain('C023');
    });

    it.each(['pending', 'todo'])('rejects lowercase visible placeholder prose: %s', (placeholder) => {
        const verify = `${placeholder}\n\nExit status: 0\n\n\`\`\`text\nok\n\`\`\``;
        expect(assertOk(check_task(task('review-ready', verify), 'task.md')).diagnostics.map((d) => d.code)).toContain(
            'C023'
        );
    });

    it('does not accept commented task sections or commented evidence', () => {
        const commentedSection = task('ready', 'Pending.').replace(
            '## Agent instructions\nMake the change.',
            '<!--\n## Agent instructions\nMake the change.\n-->'
        );
        expect(assertOk(check_task(commentedSection, 'task.md')).diagnostics.map((d) => d.code)).toContain('C022');

        const commentedEvidence = task('review-ready', '<!--\nExit status: 0\n```text\npassed\n```\n-->\nPending.');
        expect(assertOk(check_task(commentedEvidence, 'task.md')).diagnostics.map((d) => d.code)).toContain('C023');
    });

    it.each(['TBD', 'TODO', '???'])('C024 rejects a closed task containing %s', (blocker) => {
        const report = assertOk(check_task(task('closed', 'n/a: documentation-only change', blocker), 'task.md'));
        expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('C024');
    });

    it('C024 rejects an unresolved marker inside inline code', () => {
        const report = assertOk(
            check_task(task('closed', 'n/a: documentation-only change', 'Open item: `TODO`'), 'task.md')
        );
        expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('C024');
    });

    it('C024 still ignores unresolved-looking raw fenced output', () => {
        const findings = '```text\nTODO is fixture output\n```';
        const report = assertOk(check_task(task('closed', 'n/a: documentation-only change', findings), 'task.md'));
        expect(report.diagnostics.filter((diagnostic) => diagnostic.code === 'C024')).toEqual([]);
    });

    it.each([
        '- Blocking: choose an API',
        '* Open question (blocking): choose an API',
        '+ Blocked questions: choose an API',
        '1. Blocking: choose an API',
        '2. Open question (blocking): choose an API',
        '10. Blocked questions: choose an API',
    ])('C024 recognizes an ordered-list canonical blocker: %s', (finding) => {
        const report = assertOk(check_task(task('closed', 'n/a: documentation-only change', finding), 'task.md'));
        expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('C024');
    });

    it.each([
        '- Blocking:',
        '- Blocking: none',
        '1. Blocking: n/a',
        '* Open question (blocking): none',
        '+ Blocked questions: none',
    ])('C024 exempts resolved canonical blocker value %s', (finding) => {
        const report = assertOk(check_task(task('closed', 'n/a: documentation-only change', finding), 'task.md'));
        expect(report.diagnostics.filter((diagnostic) => diagnostic.code === 'C024')).toEqual([]);
    });

    it.each([
        'Blocking: choose an API',
        'Open question (blocking): choose an API',
        'Blocked questions: choose an API',
        '2) Blocking: choose an API',
    ])('C024 ignores a canonical label outside the contracted list-item shape: %s', (finding) => {
        const report = assertOk(check_task(task('closed', 'n/a: documentation-only change', finding), 'task.md'));
        expect(report.diagnostics.filter((diagnostic) => diagnostic.code === 'C024')).toEqual([]);
    });
});
