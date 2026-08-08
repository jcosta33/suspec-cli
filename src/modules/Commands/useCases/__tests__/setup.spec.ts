import { createHash } from 'node:crypto';
import {
    chmodSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ECONOMY_POLICY, ECONOMY_POLICY_SHA256 } from '../../../../generated/economyPolicy.ts';
import { run } from '../setup.ts';

function fixture() {
    const home = mkdtempSync(join(tmpdir(), 'suspec-setup-'));
    mkdirSync(join(home, '.codex'));
    mkdirSync(join(home, '.claude'));
    mkdirSync(join(home, '.config', 'opencode'), { recursive: true });
    const stdout: string[] = [];
    const stderr: string[] = [];
    const context = {
        env: { HOME: home } as NodeJS.ProcessEnv,
        stdout: (text: string) => stdout.push(text),
        stderr: (text: string) => stderr.push(text),
        uid: process.geteuid?.(),
    };
    return {
        home,
        context,
        stdout,
        stderr,
        cleanup: () => rmSync(home, { recursive: true, force: true }),
    };
}

describe('setup', () => {
    it('requires explicit unique supported harnesses and coherent modes', () => {
        const f = fixture();
        try {
            expect(run([], f.context)).toBe(2);
            expect(run(['bogus'], f.context)).toBe(2);
            expect(run(['codex', 'codex'], f.context)).toBe(2);
            expect(run(['codex', '--check', '--remove'], f.context)).toBe(2);
            expect(run(['codex', '--check', '--yes'], f.context)).toBe(2);
            expect(run(['codex', '--wat'], f.context)).toBe(2);
            expect(f.stderr.join('')).toContain('name at least one harness');
        } finally {
            f.cleanup();
        }
    });

    it('previews without writing and dry-run succeeds without writing', () => {
        const f = fixture();
        try {
            expect(run(['codex'], f.context)).toBe(1);
            expect(run(['codex', 'claude-code', 'opencode', '--dry-run'], f.context)).toBe(0);
            expect(() => readFileSync(join(f.home, '.agents', 'suspec', 'economy.md'))).toThrow();
            expect(() => readFileSync(join(f.home, '.codex', 'AGENTS.md'))).toThrow();
        } finally {
            f.cleanup();
        }
    });

    it('installs, checks, and removes all harnesses in input order', () => {
        const f = fixture();
        try {
            expect(run(['claude-code', 'codex', 'opencode', '--yes'], f.context)).toBe(0);
            expect(readFileSync(join(f.home, '.agents', 'suspec', 'economy.md'), 'utf8')).toBe(ECONOMY_POLICY);
            expect(readFileSync(join(f.home, '.claude', 'CLAUDE.md'), 'utf8')).toContain(
                `@${join(realpathSync(f.home), '.agents', 'suspec', 'economy.md')}`
            );
            expect(readFileSync(join(f.home, '.codex', 'AGENTS.md'), 'utf8')).toContain('No preamble.');
            expect(readFileSync(join(f.home, '.config', 'opencode', 'AGENTS.md'), 'utf8')).toContain('No preamble.');

            f.stdout.length = 0;
            expect(run(['claude-code', 'codex', 'opencode', '--check', '--json'], f.context)).toBe(0);
            const envelope = JSON.parse(f.stdout.join('')) as {
                ok: boolean;
                targets: { harness: string; state: string }[];
            };
            expect(envelope.ok).toBe(true);
            expect(envelope.targets.map((target) => target.harness)).toEqual(['claude-code', 'codex', 'opencode']);
            expect(envelope.targets.every((target) => target.state === 'current')).toBe(true);

            f.stdout.length = 0;
            expect(run(['claude-code', 'codex', 'opencode', '--remove'], f.context)).toBe(1);
            expect(run(['claude-code', 'codex', 'opencode', '--remove', '--yes'], f.context)).toBe(0);
            expect(() => readFileSync(join(f.home, '.agents', 'suspec', 'economy.md'))).toThrow();
            expect(() => readFileSync(join(f.home, '.codex', 'AGENTS.md'))).toThrow();
        } finally {
            f.cleanup();
        }
    });

    it('round-trips CRLF and no-final-newline foreign content', () => {
        const f = fixture();
        const target = join(f.home, '.codex', 'AGENTS.md');
        const original = 'alpha\r\nbeta';
        try {
            writeFileSync(target, original);
            expect(run(['codex', '--yes'], f.context)).toBe(0);
            const installed = readFileSync(target, 'utf8');
            expect(installed.startsWith(`${original}\r\n`)).toBe(true);
            expect(installed.endsWith('-->')).toBe(true);
            expect(run(['codex', '--remove', '--yes'], f.context)).toBe(0);
            expect(readFileSync(target, 'utf8')).toBe(original);
        } finally {
            f.cleanup();
        }
    });

    it('accepts terminal-newline normalization and still restores foreign bytes', () => {
        for (const original of ['alpha', 'alpha\n']) {
            const f = fixture();
            const target = join(f.home, '.codex', 'AGENTS.md');
            try {
                writeFileSync(target, original);
                expect(run(['codex', '--yes'], f.context)).toBe(0);
                const installed = readFileSync(target, 'utf8');
                writeFileSync(target, installed.endsWith('\n') ? installed.slice(0, -1) : `${installed}\n`);
                expect(run(['codex', '--check'], f.context)).toBe(0);
                expect(run(['codex', '--remove', '--yes'], f.context)).toBe(0);
                expect(readFileSync(target, 'utf8')).toBe(original);
            } finally {
                f.cleanup();
            }
        }
    });

    it('blocks drift, symlinks, held locks, and foreign payloads', () => {
        const f = fixture();
        try {
            expect(run(['codex', '--yes'], f.context)).toBe(0);
            const target = join(f.home, '.codex', 'AGENTS.md');
            writeFileSync(target, readFileSync(target, 'utf8').replace('No preamble.', 'Changed.'));
            expect(run(['codex', '--check'], f.context)).toBe(2);

            rmSync(target, { force: true });
            symlinkSync(join(f.home, '.agents', 'suspec', 'economy.md'), target);
            expect(run(['codex', '--check'], f.context)).toBe(2);
            rmSync(target);

            writeFileSync(join(f.home, '.suspec-setup.lock'), 'held');
            expect(run(['codex', '--yes'], f.context)).toBe(2);
            rmSync(join(f.home, '.suspec-setup.lock'));

            expect(run(['codex', '--yes'], f.context)).toBe(0);
            const managedTarget = readFileSync(target, 'utf8');
            writeFileSync(join(f.home, '.agents', 'suspec', 'economy.md'), 'foreign');
            expect(run(['codex'], f.context)).toBe(1);
            expect(run(['codex', '--dry-run'], f.context)).toBe(1);
            expect(run(['codex', '--yes'], f.context)).toBe(1);
            expect(run(['codex', '--remove'], f.context)).toBe(1);
            expect(run(['codex', '--remove', '--yes'], f.context)).toBe(1);
            expect(readFileSync(target, 'utf8')).toBe(managedTarget);
        } finally {
            f.cleanup();
        }
    });

    it('fails closed on ambiguous harness configuration', () => {
        const f = fixture();
        try {
            writeFileSync(join(f.home, '.codex', 'AGENTS.override.md'), 'override');
            expect(run(['codex', '--check'], f.context)).toBe(2);
            rmSync(join(f.home, '.codex', 'AGENTS.override.md'));
            writeFileSync(join(f.home, '.codex', 'work.config.toml'), 'model_instructions_file = "x"\n');
            expect(run(['codex', '--check'], f.context)).toBe(1);

            f.context.env.OPENCODE_CONFIG_CONTENT = '{}';
            expect(run(['opencode', '--check'], f.context)).toBe(2);
            delete f.context.env.OPENCODE_CONFIG_CONTENT;
            writeFileSync(join(f.home, '.config', 'opencode', 'opencode.jsonc'), '{"instructions":["x"]}');
            expect(run(['opencode', '--check'], f.context)).toBe(2);

            rmSync(join(f.home, '.codex', 'work.config.toml'));
            const outside = join(f.home, 'outside.toml');
            writeFileSync(outside, 'model_instructions_file = "x"\n');
            symlinkSync(outside, join(f.home, '.codex', 'linked.config.toml'));
            expect(run(['codex', '--check'], f.context)).toBe(2);
        } finally {
            f.cleanup();
        }
    });

    it('emits one JSON error and rejects unsafe HOME and missing config roots', () => {
        const f = fixture();
        try {
            expect(run(['codex', '--check', '--json'], { ...f.context, env: { HOME: 'relative' } })).toBe(2);
            const value = JSON.parse(f.stdout.pop() ?? '') as { ok: boolean; error: string };
            expect(value.ok).toBe(false);
            expect(value.error).toContain('HOME must be an absolute path');

            f.context.env.CODEX_HOME = join(f.home, 'missing');
            expect(run(['codex', '--check'], f.context)).toBe(2);
        } finally {
            f.cleanup();
        }
    });

    it('preserves mode and generated policy digest', () => {
        const f = fixture();
        const target = join(f.home, '.codex', 'AGENTS.md');
        try {
            writeFileSync(target, 'existing\n');
            chmodSync(target, 0o640);
            expect(run(['codex', '--yes'], f.context)).toBe(0);
            expect((lstatSync(target).mode & 0o777).toString(8)).toBe('640');
            expect(createHash('sha256').update(ECONOMY_POLICY).digest('hex')).toBe(ECONOMY_POLICY_SHA256);
        } finally {
            f.cleanup();
        }
    });

    it('rejects unsafe homes, config roots, ownership, and worktrees', () => {
        const f = fixture();
        const linkedHome = `${f.home}-link`;
        try {
            const fileHome = join(f.home, 'file-home');
            writeFileSync(fileHome, 'x');
            expect(run(['codex', '--check'], { ...f.context, env: { HOME: fileHome } })).toBe(2);

            symlinkSync(f.home, linkedHome);
            expect(run(['codex', '--check'], { ...f.context, env: { HOME: linkedHome } })).toBe(2);
            rmSync(linkedHome);

            f.context.env.CODEX_HOME = '.codex';
            expect(run(['codex', '--check'], f.context)).toBe(2);
            f.context.env.CODEX_HOME = f.home;
            expect(run(['codex', '--check'], f.context)).toBe(2);
            f.context.env.CODEX_HOME = fileHome;
            expect(run(['codex', '--check'], f.context)).toBe(2);
            const linkedRoot = join(f.home, 'linked-codex');
            symlinkSync(join(f.home, '.codex'), linkedRoot);
            f.context.env.CODEX_HOME = linkedRoot;
            expect(run(['codex', '--check'], f.context)).toBe(2);
            rmSync(linkedRoot);
            f.context.env.CODEX_HOME = join(f.home, '.codex');
            writeFileSync(join(f.home, '.codex', '.git'), 'gitdir: elsewhere');
            expect(run(['codex', '--check'], f.context)).toBe(2);
            rmSync(join(f.home, '.codex', '.git'));

            writeFileSync(join(f.home, '.codex', 'AGENTS.md'), 'foreign');
            expect(run(['codex', '--check'], { ...f.context, uid: (f.context.uid ?? 0) + 1 })).toBe(2);
        } finally {
            rmSync(linkedHome, { force: true });
            f.cleanup();
        }
    });

    it('rejects a symlinked shared policy root', () => {
        const f = fixture();
        try {
            const realAgents = join(f.home, 'real-agents');
            mkdirSync(realAgents);
            symlinkSync(realAgents, join(f.home, '.agents'));
            expect(run(['codex', '--yes'], f.context)).toBe(2);
            expect(() => readFileSync(join(realAgents, 'suspec', 'economy.md'))).toThrow();
        } finally {
            f.cleanup();
        }
    });

    it('rejects every malformed owned-block boundary', () => {
        const mutations = [
            (source: string) => `${source}${source}`,
            (source: string) => source.replace(' -->\nNo preamble.', ' -->No preamble.'),
            (source: string) => source.replace('\n<!-- /suspec-economy -->', '<!-- /suspec-economy -->'),
            (source: string) => source.replace(`policy=${ECONOMY_POLICY_SHA256}`, `policy=${'0'.repeat(64)}`),
            (source: string) => `${source}foreign`,
            (source: string) => source.replace('\n<!-- suspec-economy ', '<!-- suspec-economy '),
        ];
        for (const mutate of mutations) {
            const f = fixture();
            try {
                const target = join(f.home, '.codex', 'AGENTS.md');
                writeFileSync(target, 'prefix');
                expect(run(['codex', '--yes'], f.context)).toBe(0);
                writeFileSync(target, mutate(readFileSync(target, 'utf8')));
                expect(run(['codex', '--check'], f.context)).toBe(2);
            } finally {
                f.cleanup();
            }
        }
    });

    it('covers idempotence, absent removal, payload damage, and default process output', () => {
        const f = fixture();
        try {
            expect(run(['codex', '--remove'], f.context)).toBe(1);
            expect(run(['codex', '--yes'], f.context)).toBe(0);
            expect(run(['codex', '--yes'], f.context)).toBe(0);
            const payload = join(f.home, '.agents', 'suspec', 'economy.md');
            writeFileSync(payload, 'foreign');
            expect(run(['codex', '--check'], f.context)).toBe(1);
            writeFileSync(payload, ECONOMY_POLICY);
            const alias = join(f.home, '.agents', 'suspec', 'economy-alias.md');
            writeFileSync(alias, readFileSync(payload));
            rmSync(payload);
            symlinkSync(alias, payload);
            expect(run(['codex', '--check'], f.context)).toBe(2);

            const previous = process.stderr.write;
            let written = '';
            process.stderr.write = (value: string | Uint8Array) => {
                written += String(value);
                return true;
            };
            try {
                expect(run([])).toBe(2);
            } finally {
                process.stderr.write = previous;
            }
            expect(written).toContain('name at least one harness');

            const previousStdout = process.stdout.write;
            let json = '';
            process.stdout.write = (value: string | Uint8Array) => {
                json += String(value);
                return true;
            };
            try {
                expect(run(['--json'])).toBe(2);
            } finally {
                process.stdout.write = previousStdout;
            }
            expect(JSON.parse(json)).toMatchObject({ ok: false, operation: 'install' });
        } finally {
            f.cleanup();
        }
    });

    it('never deletes foreign content added to a Suspec-created target', () => {
        const f = fixture();
        const target = join(f.home, '.codex', 'AGENTS.md');
        try {
            expect(run(['codex', '--yes'], f.context)).toBe(0);
            writeFileSync(target, `foreign\n${readFileSync(target, 'utf8')}`);
            expect(run(['codex', '--remove', '--yes'], f.context)).toBe(2);
            expect(readFileSync(target, 'utf8')).toContain('foreign');
        } finally {
            f.cleanup();
        }
    });
});
