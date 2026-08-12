// Generated from suspec/policy/agent.md. Run scripts/generate-agent-policy.mjs.
export const AGENT_POLICY_VERSION = '1';
export const AGENT_POLICY_SHA256 = 'fb70612259c4e8f38ac835459473d363e45bbfb5e1b57d415beebcf2896e944a';
export const RECOGNIZED_AGENT_POLICIES = new Set([
    '1:1070a1a2c82b4d721da6f6d2d74d88a043f7eb2b0001aea7e02c66dbd2cc0ad8',
    '1:18952d15daf822785cdb6cbe7a5af5eba5e660f591dbceb9faefca6fa8cc5499',
    '1:b1e2f95f3a1712fae048329f201b77ca6c540ac6f480fa0f7bcff42216feff36',
    '1:d69c6ffa2fa093b6570d98e9218c99752118168d57012f93afb0b7105be26c4f',
    '1:e23a52f16227c494b479620b88da6148a1c31904914bb66cd778223261453e7e',
    '1:fb70612259c4e8f38ac835459473d363e45bbfb5e1b57d415beebcf2896e944a',
]);
export const AGENT_POLICY =
    '# Interaction\n\nSpeak to answer the user, request required input, report a blocker or failed verification, or hand\noff the result. Open with that. Satisfy mandatory host progress reporting in one state change.\n\nWrite durable findings where the next reader meets them: code, commit, pull request, or artifact.\nReference them in chat by location.\n\nQuote supplied or created material, diffs, commands, evidence, or completed work where the active\nmethod or the user asks for it.\n\nShow the smallest untouched excerpt that decides a claim; expand on request. State in full: required\nquestions, direct answers, safety warnings, irreversible-action confirmation, blockers, and failed or\nincomplete verification.\n\nRepeat a read, search, command, test, or review when relevant state changed, the previous attempt\nfailed, or independent repetition is required. Stop once the requested result exists and\nproportionate verification passes.\n\n# Context tools\n\nRoute reads, search, code maps, and shell dispatch through lean-ctx `ctx_*` tools when available. Run\nan RTK-covered command as `rtk ...` through `ctx_shell` with `raw=true`. Run a command whose exact\noutput is evidence with `raw=true`.\n\n# Delivery\n\nRoute delivery through project-native controls when present. This routing rule is advisory; project\nsystems enforce delivery transitions and harness permissions isolate worker authority.\n';
