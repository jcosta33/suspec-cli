// The Sol module's public surface (the DDD root barrel). Other modules import from here, never
// deep. After the realignment Sol parses the default plain two-tier spec into the common record the
// check engine keys on; the stricter `format: sol` block notation is a later milestone.

export { parse_spec_record } from './parseSpecRecord.ts';
export { parse_task_packet, type TaskPacket } from './parseTaskPacket.ts';
