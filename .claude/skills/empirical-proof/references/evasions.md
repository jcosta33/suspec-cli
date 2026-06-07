# Common evasions and the response

The full catalogue of evasions the empirical-proof gate needs to defeat. The body of `SKILL.md` keeps
the most-frequent ones inline; the full catalogue (including those, for completeness) lives here so
the agent can pull it up when one surfaces in conversation.

Every row cites the rule that backs the response — the citation is non-authoritative delivery of a
meaning owned by the language and verify/review references (the `verify` step,
the `review` step), not a redefinition of it. The response is always the same
shape: **run the proof and paste the verbatim output.**

| 🚩 Evasion                                                                   | Response                                                                                              |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| "The output is too long to paste."                                           | Paste the resolved command, the exit condition, and the runner's summary line(s) — not the whole log. The summary is what backs the verdict; the noise above it does not. |
| "I already ran it earlier in the session."                                  | Re-run after every change. A proof pasted before a later edit is stale and no longer backs the claim (the `verify` step). |
| "It's obvious from the diff that the test passes."                          | A diff does not run tests. "Obvious from the diff" is a prediction, not a recorded run. Run the tests; paste the output. |
| "The CI will catch it."                                                     | The discipline is the agent's gate, not the CI's. The CI is a future deterministic home for the gate, not a substitute for running the proof now (the `review` step). |
| "It would slow down the session."                                           | The session's value is correctness, not speed. A `PASS` with no pasted proof is `UNVERIFIED` (the `verify` step), so the "fast" path produced nothing the gate accepts. |
| "I'm reviewing in good faith — pasting is performative."                    | Treat trust as a vulnerability to remove, not a virtue. In `review`, run the bound proofs yourself; the worker's paste is a past moment, not the present verdict (the `review` step). |
| "The test command failed for environmental reasons unrelated to my changes." | That is `BLOCKED`, not `PASS` — truth is *unknown*, not true. Surface the env issue as a blocker and fix the environment, then re-run; never silently mark complete (the `review` step). |
| "Schema validated, so the output is correct."                               | Shape is not truth (the `verify` step). A well-formed JSON / schema-valid structured output says nothing about whether the *value* is correct; such a binding is `UNVERIFIED`. |
| "The judge model said it passes."                                           | A `manual`/LLM-judge verdict counts only with recorded judge identity, an independent reviewer (implementer ≠ reviewer), and dual judgment for `RISK high`/`critical` (the `review` step). A bare `manual PASS` is `UNVERIFIED`. |
| "I bundled all the checks into one 'all green' line."                       | One `VERDICT` per required binding (the `verify` step). A bundled paste hides which binding ran and which is missing — a missing one is `SOL-V008` / `UNVERIFIED`. |
| "There's no command in `AGENTS.md` for this, so I used a reasonable one."   | Do not guess a command. A binding whose adapter has no `cmd*` row is `SOL-V002` / `BLOCKED`; name the missing slot and ask the user (the `verify` step). |
| "One concrete test passes, so the high-risk obligation is proven."          | For `RISK high`/`critical`, a single concrete `test` is an inadequate oracle (the `verify` step). Record `oracle_adequacy` — what it exercised, with mutation/metamorphic/property/coverage evidence — or it is `SOL-V011`. |
| "It worked when I checked it in production."                                | A production observation binds as `monitor` (a lagging, weakest-rank signal, the `verify` step), not as a passing `test`, and it must still be pasted as real recorded evidence — not asserted. |

## How to use this table

When the agent (or the user) catches itself reasoning toward one of these evasions, look up the row,
paste the response, and run the verification. The point is not to win the argument — it is to make the
cost of *skipping* the verification (a public exchange of evasion + response) higher than the cost of
just running the command and pasting its output.
