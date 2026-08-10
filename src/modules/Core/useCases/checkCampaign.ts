import type { AppError } from '../../../infra/errors/createAppError.ts';
import { err, isErr, ok, type Result } from '../../../infra/errors/result.ts';
import { parse_campaign } from '../../Sol/useCases/index.ts';
import {
    check_campaign_authority,
    check_campaign_ready,
    check_campaign_shape,
    level_for,
    type Diagnostic,
} from '../services/checksContract.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type CampaignCheckReport = Readonly<{
    type: 'campaign';
    level: OutcomeLevel;
    path: string;
    diagnostics: readonly Diagnostic[];
}>;

export function check_campaign(
    source: string,
    path: string,
    exists: (ref: string) => boolean
): Result<CampaignCheckReport, AppError> {
    const parsed = parse_campaign(source);
    if (isErr(parsed)) return err(parsed.error);

    const diagnostics = [
        ...check_campaign_shape(parsed.value),
        ...check_campaign_authority(parsed.value, exists),
        ...check_campaign_ready(parsed.value),
    ];
    return ok({ type: 'campaign', level: level_for(diagnostics), path, diagnostics });
}
