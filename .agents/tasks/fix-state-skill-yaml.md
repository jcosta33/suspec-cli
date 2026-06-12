# Fix State Skill YAML

## Metadata

- Slug: fix-state-skill-yaml
- Agent: Codex
- Branch: main
- Base: main
- Worktree: /Users/josecosta/dev/swarm-cli
- Created: 2026-05-04
- Status: complete
- Task file: .agents/tasks/fix-state-skill-yaml.md
- Spec: none
- Type: maintenance

## Objective

Fix the invalid YAML front matter in `.agents/skills/state-and-write-paths/SKILL.md` so the skill loader can parse and load the skill.

## Background

The loader reported `mapping values are not allowed in this context at line 2 column 74`, which points to the unquoted colon in the `description:` value.

## Constraints

- Stay inside this worktree only.
- Do not switch branches.
- Do not merge.
- Do not push unless explicitly asked.
- Follow the architecture and coding conventions in `AGENTS.md`.

## Plan

1. Inspect the reported `SKILL.md` front matter.
2. Quote the `description` scalar so embedded punctuation is valid YAML.
3. Verify YAML parsing and check the git diff.

## Implementation

### Step 1

Confirmed the `description:` value contains an unquoted colon after `state`.

### Step 2

Quoted the `description` scalar in `.agents/skills/state-and-write-paths/SKILL.md`.

### Step 3

Verified the front matter parses with Ruby's YAML parser and reviewed the worktree status.

## Self-review

### Verification outputs

Paste command output for each check before declaring done.

- [x] `git status` — only intended files changed.

```text
 M .agents/skills/state-and-write-paths/SKILL.md
?? .agents/tasks/fix-state-skill-yaml.md
```

- [x] YAML parse check — skill front matter parses.

```text
{"name"=>"state-and-write-paths", "description"=>"Apply when creating, editing, or reviewing any form of state: application truth, shared runtime state, projections, stores, command execution, events, or async fetching. This is the authoritative skill for state ownership and write-path discipline."}
```

### Did I stay within scope?

Yes. The only source change was quoting the invalid YAML scalar in the reported skill file. The task file was added for session tracking.

### Are there any follow-up tasks?

No.
