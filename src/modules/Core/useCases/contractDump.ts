// `suspec check --contract` — project the checks contract (the version + the core-check table) as
// plain data for the JSON dump. A fresh, read-only projection: consumers (CI, the MCP server,
// editors) read the contract's rules without parsing canon; the drift-guard test keeps this
// table honest against checks.yaml. The table states the contract, not a computed-checks list —
// C014 is checklist-level (it needs the live diff; docs/reference/checks.md), so it rides the
// contract here while no engine rule computes it.

import { CONTRACT_VERSION, CORE_CHECKS } from '../services/checksContract.ts';

export type ContractDump = Readonly<{
    version: string;
    checks: readonly Readonly<{ id: string; name: string; severity: 'hard-error' | 'warning' }>[];
}>;

export function contract_dump(): ContractDump {
    return {
        version: CONTRACT_VERSION,
        checks: CORE_CHECKS.map((check) => ({ id: check.id, name: check.name, severity: check.severity })),
    };
}
