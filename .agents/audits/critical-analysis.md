---
goal: Critically assess Swarm CLI for robustness, UX, architecture, and graceful failure handling.
---

# Audit: Critical Analysis (Skeptical Review)

## Goal
To ensure the Swarm CLI codebase handles concurrency safely, fails gracefully without crashing the process, provides a robust developer experience (UX/QoL), and strict architectural invariant enforcement. 

## Current state
The system employs `fs.watch` for background daemon loops, `better-sqlite3` and JSON files for state/telemetry, and relies on `.agents/locks.json` for file locking. While the happy path functions, adversarial inspection reveals deep structural reliance on `throw` for control flow, unsafe platform-specific dependencies (`osascript`, recursive `fs.watch`), and inadequate recovery from failed I/O or child processes.

## Findings
- **Hidden `throw`s over `Result`:** Despite a `Result` type existing, core infrastructure (Git, Terminal, TaskManagement) extensively uses `throw new Error()`. This violates functional error-handling patterns and leads to ungraceful crashes.
- **Fragile macOS Dependencies:** The terminal launcher relies on `osascript` synchronously, assuming Apple Events permissions are granted. 
- **Platform-Specific Daemoning:** The daemon uses `fs.watch` with `{ recursive: true }`, which is notoriously unreliable or unsupported on certain Linux kernels (inotify limits).
- **Concurrency Risks:** Multiple agent processes may contend for SQLite or `locks.json` simultaneously. While `lockSync` is used, crashes while holding the lock rely on a 5-second stale timeout, halting parallel workflows.

## Issues

### 1. `Result` Type Bypassed by `throw`
**Location:** `modules/Workspace/useCases/git.ts`, `modules/Terminal/useCases/terminal.ts`, `modules/TaskManagement/useCases/slug.ts`, `modules/Commands/useCases/decompose.ts`
**Description:** Essential operations (e.g., git commands, JSON parsing of graphs, terminal launching) throw raw `Error`s instead of returning `Result<V, AppError>`. This crashes the orchestrating process entirely.
**Needed:** Refactor these modules to return explicit `Result` or `ResultAsync` types. Remove `throw` statements from all `useCases/` unless unrecoverable (e.g., Out of Memory).

### 2. Hardcoded Source Paths in Daemon
**Location:** `modules/Commands/useCases/daemon.ts`
**Description:** The daemon hardcodes `join(repoRoot, 'src')`. Workspaces using `lib`, `app`, or multiple package roots will not trigger test reruns.
**Needed:** Parameterize the watch path via configuration or CLI arguments, defaulting to `src` only if unspecified.

### 3. Recursive `fs.watch` Incompatibility
**Location:** `modules/Commands/useCases/daemon.ts`
**Description:** `fs.watch(..., { recursive: true })` fails silently or throws `ENOSPC` (inotify limits) on many Linux environments.
**Needed:** Replace raw `fs.watch` with a robust file watcher like `chokidar` or manually traverse directories if external dependencies are forbidden.

### 4. AppleScript Permissions Crash CLI
**Location:** `modules/Terminal/useCases/terminal.ts`
**Description:** If `osascript` fails due to macOS permission dialogs or missing iTerm2, the process throws `throw new Error('Failed to open Terminal.app...')`, killing the caller instead of gracefully falling back to `'current'` terminal or logging a non-fatal error.
**Needed:** Return an error `Result` and implement a fallback to `current` backend or gracefully print instructions on how to grant permissions.

### 5. Blind `git rerere` Execution
**Location:** `modules/Commands/useCases/init.ts`
**Description:** `spawnSync('git', ['config', 'rerere.enabled', 'true'])` is executed blindly. If the user's `.git/config` is locked or read-only, this fails silently or crashes, and the CLI assumes success.
**Needed:** Check the exit status of the `spawnSync` command and warn the user via UI logger instead of blindly continuing.

### 6. Missing CLI Quality of Life Features
**Location:** `modules/Commands/useCases/help.ts`, `index.ts`
**Description:** There is no generic `--quiet` or `--verbose` logging toggle. Tailing logs via `swarm logs` and running commands can clash visually. Autocompletion for complex subcommands (like `daemon`, `doctor`, `init`) is absent.
**Needed:** Implement standard verbosity flags (`-q`, `-v`), add a setup command for shell completions, and namespace output clearly.

## Priorities
1. **Issue 1:** Fix `throw` usages in Git and Terminal boundaries. Crashing the CLI breaks multi-agent orchestration.
2. **Issue 4:** Handle `osascript` failures gracefully.
3. **Issue 2 & 3:** Fix daemon watcher reliability and hardcoded paths.
4. **Issue 5:** Validate Git configuration commands.
5. **Issue 6:** Add QoL features (verbosity, autocompletion).

## Risks
- **Catastrophic Failure:** If an agent triggers an uncaught exception via a `git` error, the entire session dies without writing state, violating observability guarantees.
- **Developer Friction:** Linux users will likely encounter broken daemon loop behavior, while macOS users might face abrupt crashes due to security prompts, leading to a perception of fragility.