# Spec: UX Overhaul

## Overview
This epic implements 10 major User Experience (UX) improvements to the Swarm CLI to make it feel alive, intuitive, and premium.

## Requirements

1. **Branded Startup Sequence & ASCII Logo**: Display a stylized ASCII logo on boot/dashboard.
2. **True Terminal UI (TUI) Dashboard**: Migrate the dashboard to use React and Ink. Split panes for agent list, logs, and status.
3. **Context-Aware Command Defaults**: Detect the current worktree (e.g., inside `.agents/agent-x`) and default commands like `chat` or `logs` to that agent.
4. **Rich Markdown & Syntax Highlighting**: Render agent markdown output natively with syntax highlighting.
5. **Live Action Spinners & Micro-Feedback**: Granular animated spinners indicating specific sub-task progress instead of static tags.
6. **Interactive "Did you mean?" & Smart Error Recovery**: Catch typos in agent names or commands, offer interactive prompts to fix them or configure missing keys.
7. **Desktop Notifications for Asynchronous Tasks**: Integrate `node-notifier` to ping users when an agent finishes, crashes, or needs human input.
8. **Interactive Onboarding Wizard (`swarm init`)**: Visual setup flow using `@clack/prompts` for API keys, preferred editor, etc.
9. **Pervasive Fuzzy Searching**: Expand `fzf_select` to all list interactions (specs, logs, agent killing).
10. **Swarm "Insights" & Summary View**: Wrap-up screen showing tasks completed, files modified, and total time on exit.

## Out of Scope
- Modifying the core Agent State SQLite database schema, unless strictly necessary for tracking insights/metrics over time.
- Changing the underlying AI generation logic or adapters (beyond adapting them to emit fine-grained progress events for spinners).

## Design Decisions
- **Insights Tracking**: We will derive session metrics dynamically from Git history and existing SQLite agent state events. No schema changes are required.
- **ASCII Art**: We will generate custom ASCII text "SWARM" accompanied by a visual motif resembling a swarm (e.g., particles, dots, bees).

## Acceptance Criteria
- [ ] `swarm dashboard` launches an interactive Ink-based UI without screen flickering (`setInterval` replaced).
- [ ] Context is automatically inferred when running `swarm chat` inside an agent worktree.
- [ ] Typos in `swarm <command>` prompt a "Did you mean?" interactive selection.
- [ ] `swarm init` successfully steps through configuration and saves to `.env` or config file.
- [ ] `node-notifier` triggers a desktop alert on agent task completion or failure.
- [ ] Agent personas are implemented and correctly assigned based on task type.
- [ ] The Researcher agent demonstrates the ability to perform and integrate internet research into `.agents/research/` files.
- [ ] `pnpm deps:validate` passes with 0 violations.
- [ ] `pnpm typecheck` passes with 0 errors.
` or config file.
- [ ] `node-notifier` triggers a desktop alert on agent task completion or failure.
- [ ] `pnpm deps:validate` passes with 0 violations.
- [ ] `pnpm typecheck` passes with 0 errors.
