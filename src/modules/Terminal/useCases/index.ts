export {
    red,
    green,
    yellow,
    cyan,
    dim,
    bold,
    success,
    warn,
    error,
    box,
} from './colors.ts';

export {
    parse_args,
    parse_flags,
    type FlagSpec,
    find_markdown_files,
    fzf_select,
    prompt_input,
    command_exists,
    split_command,
} from './cli.ts';

export { resolve_backend, check_backend, launch } from './terminal.ts';
export { notify } from './notify.ts';
export { summarize_insight } from './llm.ts';
export { load_config } from './config.ts';
export { format_markdown } from './markdown.ts';

// FINDING: services/logger.ts is a per-process AsyncLocalStorage logger — that is
// cross-cutting infra, not a "pure stateless helper" per AGENTS.md, and arguably
// belongs in src/infra/logger/. Re-exporting from services/ here is the same
// known violation tracked in AgentState's barrel. Move requires explicit
// instruction (safety rules forbid unprompted file moves).
export { logger, run_with_context } from '../services/logger.ts';
