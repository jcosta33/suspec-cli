// The parser module's external surface (the DDD root barrel). Consumers import from here, never deep.

export { parseSpec, type ParseSpecInput } from './useCases/parseSpec.ts';

export {
    BLOCK_KINDS,
    EDGE_TYPES,
    LINT_LAYERS,
    type SwarmIr,
    type IrNode,
    type IrEdge,
    type IrMeta,
    type IrProvenance,
    type Diagnostic,
    type SourceSpan,
    type BlockKind,
    type EdgeType,
    type LintLayer,
} from './models/ir.ts';

export { PARSE_FAILURE_CODES, type ParseFailure, type ParseFailureCode } from './models/parse-failure.ts';

export { isOk, isErr, type Result } from '../shared/result.ts';
