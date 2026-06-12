# Swarm starter kit — a complete workspace

This folder **is** a Swarm workspace. Copy it whole — as a new repo, or as a folder inside an
existing project — fill in `AGENTS.md`, and run the loop.

```sh
cp -R starter-kit my-workspace        # a dedicated workspace repo (git init it)
cp -R starter-kit your-repo/workspace # or co-located inside your project
# (-R, not -r: on macOS, -r would replace the kit's symlinks with stale copies)
```

What you copied:

```
AGENTS.md            the bootloader (CLAUDE.md / GEMINI.md are symlinks to it)
.agents/skills/      the three core guides: write-spec, implement-task, review-output
.claude/skills       symlink -> .agents/skills — Claude Code discovers the guides natively
templates/           the eight core artifact templates — spec, task, review, finding,
                     status, intake, inventory, change-plan
specs/ intake/ tasks/ reviews/ findings/ inventory/ change-plans/
                     the flow folders, each with a one-line README saying what lands there
decisions/           your ADR ledger, seeded with 0001-adopt-swarm
status.md            the hand-edited workboard
examples/            one worked chain (ticket → spec → task → review → finding) —
                     read it, then delete it
advanced/            optional templates, guides, and reference cards — copy pieces into
                     .agents/skills/ (guides) or use in place (templates) when needed
.gitignore.additions lines for your CODE repos (this workspace commits its artifacts)
```

After copying:

1. Fill the `{{placeholders}}` — in `AGENTS.md` (Commands table, project facts) and in
   `decisions/0001-adopt-swarm.md` (date, team).
2. If your agent is not Claude Code, point it at `.agents/skills/` — a symlink like the
   shipped `.claude/skills` one, or a copy into wherever your tool scans.
3. Write one spec for your next non-trivial change: `specs/<feature>/spec.md`. Run the loop.

`advanced/` is optional — copy pieces when the work needs them. The audit template is the
recommended first taste for brownfield codebases.

Full instructions: `docs/ADOPTING.md` in the Swarm repo. Worked examples: `docs/examples/`.
