import { build_args as buildClaudeArgs, command as claudeCommand } from './claude.ts';
import { build_args as buildCodexArgs, command as codexCommand } from './codex.ts';
import { build_args as buildDroidArgs, command as droidCommand } from './droid.ts';
import { build_args as buildGeminiArgs, command as geminiCommand } from './gemini.ts';
import { build_args as buildKimiArgs, command as kimiCommand } from './kimi.ts';
import { build_args as buildOpencodeArgs, command as opencodeCommand } from './opencode.ts';

type AdapterBuildArgs = (slug: string, extraArgs?: string[], options?: Record<string, unknown>) => string[];

type Adapter = {
    command: string;
    build_args: AdapterBuildArgs;
};

const adapters: Record<string, Adapter> = {
    claude: { command: claudeCommand, build_args: buildClaudeArgs },
    codex: { command: codexCommand, build_args: buildCodexArgs },
    droid: { command: droidCommand, build_args: buildDroidArgs },
    gemini: { command: geminiCommand, build_args: buildGeminiArgs },
    kimi: { command: kimiCommand, build_args: buildKimiArgs },
    opencode: { command: opencodeCommand, build_args: buildOpencodeArgs },
};

export const adapter_capabilities = [
    { name: 'claude', version: '1.0.0', type: 'adapter' as const, description: 'Adapter for the Claude CLI', entry_point: './useCases/claude.ts' },
    { name: 'codex', version: '1.0.0', type: 'adapter' as const, description: 'Adapter for the OpenAI Codex CLI', entry_point: './useCases/codex.ts' },
    { name: 'droid', version: '1.0.0', type: 'adapter' as const, description: 'Adapter for the Factory Droid CLI', entry_point: './useCases/droid.ts' },
    { name: 'gemini', version: '1.0.0', type: 'adapter' as const, description: 'Adapter for the Google Gemini CLI', entry_point: './useCases/gemini.ts' },
    { name: 'kimi', version: '1.0.0', type: 'adapter' as const, description: 'Adapter for the Kimi CLI', entry_point: './useCases/kimi.ts' },
    { name: 'opencode', version: '1.0.0', type: 'adapter' as const, description: 'Adapter for the OpenCode CLI', entry_point: './useCases/opencode.ts' },
];

/**
 * Resolve an agent adapter by name.
 */
export function get_adapter(name: string): Adapter | undefined {
    return adapters[name];
}