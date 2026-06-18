import { describe, it, expect } from 'vitest';

import { parse_agent_config, resolve_adapter } from '../services/agentConfig.ts';
import { isErr } from '../../../infra/errors/result.ts';

// The documented `.swarm/config.yaml` shape (future-cli.md "Agent adapters").
const CONFIG = `knowledge:
  type: git
  path: ../swarm-workspace
project:
  id: my-app
agents:
  default: claude
  available: [claude, codex, opencode]
  claude:
    command: claude
    working_directory: task_worktree
    startup_instruction: "Read AGENTS.md, then read the task file you were given."
  codex:
    command: codex
    working_directory: task_worktree
    startup_instruction: 'stay inside its scope'
`;

describe('parse_agent_config', () => {
    it('reads default + each adapter`s three fields from the documented shape', () => {
        const config = parse_agent_config(CONFIG);
        expect(config.default).toBe('claude');
        expect([...config.adapters.keys()].sort()).toEqual(['claude', 'codex']); // `available` is not an adapter
        expect(config.adapters.get('claude')).toEqual({
            name: 'claude',
            command: 'claude',
            working_directory: 'task_worktree',
            startup_instruction: 'Read AGENTS.md, then read the task file you were given.',
        });
    });

    it('strips single and double quotes from a scalar', () => {
        const config = parse_agent_config(CONFIG);
        expect(config.adapters.get('codex')?.startup_instruction).toBe('stay inside its scope');
    });

    it('returns an empty config when there is no `agents:` block', () => {
        const config = parse_agent_config('project:\n  id: x\n');
        expect(config.default).toBeNull();
        expect(config.adapters.size).toBe(0);
    });

    it('handles an `agents:` block with no children', () => {
        const config = parse_agent_config('agents:\n');
        expect(config.default).toBeNull();
        expect(config.adapters.size).toBe(0);
    });

    it('ignores a block-list `available:` (its items are not adapters)', () => {
        const config = parse_agent_config(
            'agents:\n  available:\n    - claude\n    - codex\n  claude:\n    command: claude\n'
        );
        expect([...config.adapters.keys()]).toEqual(['claude']);
    });

    it('tolerates a malformed block: an empty `default:` is null and an unknown adapter sub-field is ignored', () => {
        const config = parse_agent_config('agents:\n  default:\n  x:\n    command: x\n    bogus_field: y\n');
        expect(config.default).toBeNull(); // `default:` with no value
        expect([...config.adapters.keys()]).toEqual(['x']);
        expect(config.adapters.get('x')).toEqual({ name: 'x', command: 'x' }); // bogus_field not captured
    });

    it('stops at the next top-level key after the `agents:` block', () => {
        const config = parse_agent_config('agents:\n  default: x\n  x:\n    command: x\nproject:\n  id: app\n');
        expect(config.default).toBe('x');
        expect([...config.adapters.keys()]).toEqual(['x']); // `project`/`id` are not swept in as adapters
    });
});

describe('resolve_adapter', () => {
    const config = parse_agent_config(CONFIG);

    it('resolves an explicit --agent name', () => {
        const result = resolve_adapter(config, 'codex');
        expect(isErr(result)).toBe(false);
        if (!isErr(result)) {
            expect(result.value.name).toBe('codex');
            expect(result.value.command).toBe('codex');
        }
    });

    it('falls back to agents.default when no name is given', () => {
        const result = resolve_adapter(config);
        expect(isErr(result)).toBe(false);
        if (!isErr(result)) {
            expect(result.value.name).toBe('claude');
        }
    });

    it('errors on an unknown agent, naming the configured adapters', () => {
        const result = resolve_adapter(config, 'aider');
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
            expect(result.error.message).toMatch(/unknown agent "aider".*claude, codex/);
        }
    });

    it('errors when no name is given and there is no default', () => {
        const result = resolve_adapter(parse_agent_config('agents:\n  claude:\n    command: claude\n'));
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
            expect(result.error.message).toMatch(/no agent given and no `agents.default`/);
        }
    });

    it('errors when the named adapter has no `command`', () => {
        const result = resolve_adapter(
            parse_agent_config('agents:\n  default: claude\n  claude:\n    startup_instruction: "x"\n'),
            'claude'
        );
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
            expect(result.error.message).toMatch(/has no `command`/);
        }
    });

    it('errors on an unknown agent with no adapters configured at all', () => {
        const result = resolve_adapter(parse_agent_config(''), 'claude');
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
            expect(result.error.message).toMatch(/no adapters configured/);
        }
    });

    it('defaults working_directory to task_worktree and startup_instruction to empty when omitted', () => {
        const result = resolve_adapter(parse_agent_config('agents:\n  bare:\n    command: bare\n'), 'bare');
        expect(isErr(result)).toBe(false);
        if (!isErr(result)) {
            expect(result.value.working_directory).toBe('task_worktree');
            expect(result.value.startup_instruction).toBe('');
        }
    });
});
