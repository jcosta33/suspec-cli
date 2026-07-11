// Terminal module barrel — the CLI plumbing the check command consumes: the boolean-aware
// argument parser. Terminal owns no rendering; colours live at the render edge in Commands
// (picocolors).
export { parse_flags } from './cli.ts';
