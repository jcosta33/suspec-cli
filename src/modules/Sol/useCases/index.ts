// The Sol module's public surface (the DDD root barrel). Other modules import from here, never
// deep. Sol parses plain Markdown and the supported `format: sol` structures into the common
// records the check engine uses.

export { parse_spec_record } from './parseSpecRecord.ts';
export { parse_task_packet } from './parseTaskPacket.ts';
export { parse_change_plan } from './parseChangePlan.ts';
