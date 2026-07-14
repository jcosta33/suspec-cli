import type { AppError } from '../../../infra/errors/createAppError.ts';
import { err, isErr, ok, type Result } from '../../../infra/errors/result.ts';
import { parse_task_packet } from '../../Sol/useCases/index.ts';
import {
    check_closed_task_resolved,
    check_task_evidence,
    check_task_shape,
    level_for,
    type Diagnostic,
} from '../services/checksContract.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type TaskCheckReport = Readonly<{
    type: 'task';
    level: OutcomeLevel;
    path: string;
    diagnostics: readonly Diagnostic[];
}>;

export function check_task(source: string, path: string): Result<TaskCheckReport, AppError> {
    const parsed = parse_task_packet(source);
    if (isErr(parsed)) {
        return err(parsed.error);
    }
    const packet = parsed.value;
    const record = {
        ...packet.frontmatter,
        sectionTitles: packet.sectionTitles,
        verifyBody: packet.verifyBody,
        runOrderBody: packet.runOrderBody,
        resolutionText: packet.resolutionText,
    };
    const diagnostics = [
        ...check_task_shape(record),
        ...check_task_evidence(record),
        ...check_closed_task_resolved(record),
    ];
    return ok({ type: 'task', level: level_for(diagnostics), path, diagnostics });
}
