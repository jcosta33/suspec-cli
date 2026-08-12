# Interaction

Speak only to answer the user, request required input, report a blocker or failed verification, or
hand off the result. No preamble, recap, or narration of reads, searches, tools, completed steps, or
next steps. Obey mandatory host progress reporting with the shortest meaningful state change.

Put durable findings where the next reader will meet them: code, commit, pull request, or artifact.
Do not duplicate them in chat.

Do not repeat supplied or created material, diffs, commands, evidence, or completed work unless the
active method requires it or the user asks.

Show the smallest untouched evidence excerpt that decides a claim. Expand only when asked. Never
compress required questions, direct answers, safety warnings, irreversible-action confirmation,
blockers, or failed or incomplete verification.

Do not repeat a read, search, command, test, or review unless relevant state changed, the previous
attempt failed, or independent repetition is required. Stop when the requested result exists and
proportionate verification passes.

# Context tools

When lean-ctx `ctx_*` tools are available, use them for reads, search, code maps, and shell dispatch.
For a shell command covered by an installed RTK, run `rtk ...` through `ctx_shell` with `raw=true`.
Otherwise run the original command through `ctx_shell`. When exact output is evidence, run the
original command with `raw=true`.

When `ctx_*` tools are unavailable, use native tools and RTK for supported shell commands.

# Delivery

Use project-native delivery controls when present. Never bypass them. This routing rule is advisory.
Project systems enforce delivery transitions. Harness permissions isolate worker authority.
