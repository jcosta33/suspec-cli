# Swarm starter kit — a complete workspace

This repository **is** a [Swarm](https://github.com/jcosta33/swarm) workspace. Copy it whole —
as a new repo, or as a folder inside an existing project — fill in `AGENTS.md`, and run the loop.

```sh
# a dedicated workspace repo — for one project, or governing several code repos
gh repo create my-workspace --private --template jcosta33/swarm-starter-kit --clone   # or clone and re-init:
git clone https://github.com/jcosta33/swarm-starter-kit my-workspace && rm -rf my-workspace/.git && git -C my-workspace init

# or co-located inside your project
git clone https://github.com/jcosta33/swarm-starter-kit /tmp/kit && cp -R /tmp/kit/. your-repo/workspace/ && rm -rf your-repo/workspace/.git
# (cp -R with the trailing dot keeps the kit's symlinks; -r would replace them with stale copies)
```

What you copied:

```
AGENTS.md            the bootloader (CLAUDE.md / GEMINI.md are symlinks to it)
.agents/skills/      the core guides — write-spec, implement-task, review-output — plus the
                     workspace authoring guides: write-audit, write-research, write-rfc,
                     write-prd, write-bug-report, write-change-plan, write-inventory,
                     spec-check, split-work, save-findings, adversarial-review
.claude/skills       symlink -> .agents/skills — Claude Code discovers the guides natively
templates/           the eight core artifact templates — spec, task, review, finding,
                     status, intake, inventory, change-plan
specs/ intake/ tasks/ reviews/ findings/ inventory/ change-plans/
                     the flow folders, each with a one-line README saying what lands there
decisions/           your ADR ledger, seeded with 0001-adopt-swarm
status.md            the hand-edited workboard
examples/            one worked chain (ticket → spec → task → review → finding) —
                     read it, then delete it
advanced/            optional templates and reference cards — use in place when needed
.gitignore.additions lines for your CODE repos (this workspace commits its artifacts)
```

After copying:

1. Fill the `{{placeholders}}` — in `AGENTS.md` (Commands table, project facts) and in
   `decisions/0001-adopt-swarm.md` (date, team).
2. If your agent is not Claude Code, point it at `.agents/skills/` — a symlink like the
   shipped `.claude/skills` one, or a copy into wherever your tool scans.
3. Write one spec for your next non-trivial change: `specs/<feature>/spec.md`. Run the loop.

`advanced/` is optional — copy pieces when the work needs them. The audit template is the
recommended first taste for brownfield codebases. Conditioning stances (the personas) and
per-change-shape implementation guides install from the
[swarm-skills catalog](https://github.com/jcosta33/swarm-skills):
`npx skills add jcosta33/swarm-skills` (add `--list` to preview the catalog without installing).

Full instructions: [`docs/ADOPTING.md`](https://github.com/jcosta33/swarm/blob/main/docs/ADOPTING.md)
in the Swarm repo. Worked examples: [`docs/examples/`](https://github.com/jcosta33/swarm/tree/main/docs/examples).
