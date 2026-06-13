// Terminal module barrel — the CLI plumbing the M1 commands consume. After the realignment this is
// just the boolean-aware argument parser; colours come from picocolors at the render edge and
// prompts from @clack via the Tui Prompter.
export { parse_flags, type FlagSpec } from './cli.ts';
