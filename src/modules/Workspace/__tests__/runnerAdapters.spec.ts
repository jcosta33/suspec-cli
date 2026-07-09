import { describe, it, expect } from 'vitest';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import {
    parse_runner_config,
    resolve_runner,
    render_runner_command,
    runner_attach_hint,
} from '../useCases/runnerAdapters.ts';

// SPEC-suspec-v2 AC-009: runners resolve from suspec.config.json `runners` (default + per-runner
// command_template); claude/codex are built-ins; unknown runner errors listing the known ones.

describe('parse_runner_config (AC-009)', () => {
    it('reads runners.default and each runner`s command_template', () => {
        const config = parse_runner_config({
            runners: {
                default: 'mine',
                mine: { command_template: '/bin/agent {prompt}' },
                other: { command_template: 'other-cli --cwd {cwd} {prompt}' },
            },
        });
        expect(config.default).toBe('mine');
        expect(config.templates.get('mine')).toBe('/bin/agent {prompt}');
        expect(config.templates.get('other')).toBe('other-cli --cwd {cwd} {prompt}');
    });

    it('degrades malformed shapes to an empty config — no runners block, non-object, bad entries', () => {
        for (const raw of [null, 42, 'runners', {}, { runners: 'claude' }, { runners: ['claude'] }]) {
            const config = parse_runner_config(raw);
            expect(config.default).toBeNull();
            expect(config.templates.size).toBe(0);
        }
        // Entries without a usable command_template (and a non-string default) are dropped.
        const partial = parse_runner_config({
            runners: { default: 7, a: { command_template: '' }, b: {}, c: 'nope', d: { command_template: '  ' } },
        });
        expect(partial.default).toBeNull();
        expect(partial.templates.size).toBe(0);
    });
});

describe('resolve_runner (AC-009)', () => {
    const empty = parse_runner_config(null);

    it('defaults to the claude built-in with no config and no request', () => {
        const runner = assertOk(resolve_runner(empty));
        expect(runner.name).toBe('claude');
        expect(runner.command_template).toBe('claude {prompt}');
    });

    it('resolves the codex built-in, whose template puts the store in the sandbox writable_roots', () => {
        const runner = assertOk(resolve_runner(empty, 'codex'));
        expect(runner.command_template).toContain('codex exec --sandbox workspace-write');
        expect(runner.command_template).toContain('sandbox_workspace_write.writable_roots=["{store}"]');
        expect(runner.command_template).toContain('{prompt}');
    });

    it('honors runners.default and lets a config template shadow a built-in', () => {
        const config = parse_runner_config({
            runners: {
                default: 'mine',
                mine: { command_template: 'agent {prompt}' },
                claude: { command_template: 'claude --custom {prompt}' },
            },
        });
        expect(assertOk(resolve_runner(config)).name).toBe('mine');
        expect(assertOk(resolve_runner(config, 'claude')).command_template).toBe('claude --custom {prompt}');
    });

    it('errors on an unknown runner, listing the known ones (config + built-ins)', () => {
        const config = parse_runner_config({ runners: { mine: { command_template: 'agent {prompt}' } } });
        const error = assertErr(resolve_runner(config, 'nope'));
        expect(error.message).toMatch(/unknown runner "nope"/);
        expect(error.message).toMatch(/claude, codex, mine/);
    });
});

describe('render_runner_command (AC-009)', () => {
    it('renders each adapter template to an argv with prompt, cwd, and store substituted', () => {
        const subs = { prompt: 'line one\nline two', cwd: '/wt/feat', store: '/home/x/.claude/state/proj' };
        expect(render_runner_command('claude {prompt}', subs)).toEqual(['claude', 'line one\nline two']);
        const codex = render_runner_command(
            'codex exec --sandbox workspace-write -c sandbox_workspace_write.writable_roots=["{store}"] {prompt}',
            subs
        );
        expect(codex).toEqual([
            'codex',
            'exec',
            '--sandbox',
            'workspace-write',
            '-c',
            'sandbox_workspace_write.writable_roots=["/home/x/.claude/state/proj"]',
            'line one\nline two',
        ]);
        // {cwd} substitutes inside a token; a multiline prompt stays ONE argv token (split-first).
        expect(render_runner_command('run --dir={cwd} {prompt}', subs)).toEqual([
            'run',
            '--dir=/wt/feat',
            'line one\nline two',
        ]);
    });

    it('collapses stray whitespace in a template', () => {
        expect(render_runner_command('  bin   {prompt}  ', { prompt: 'p', cwd: 'c', store: 's' })).toEqual([
            'bin',
            'p',
        ]);
    });
});

describe('runner_attach_hint (AC-008/009)', () => {
    it('names the runner`s NATIVE session command per adapter', () => {
        expect(runner_attach_hint('claude', '/wt')).toBe('cd /wt && claude --continue');
        expect(runner_attach_hint('codex', '/wt')).toBe('cd /wt && codex resume');
        expect(runner_attach_hint('mine', '/wt')).toBe('re-open your mine session in /wt');
    });
});
