# Project Memory
<!-- maintained by cc-orchestrator; git history is the audit trail -->

## Decisions (append-only; supersede, never delete)

### D-001: Full multiscreen redesign, per `.cc/plan-sikhiuni-redesign.md` (2026-09-04)
Fable-authored plan translating `.cc/redesign-prototype-source.html` (a design-tool
export, gitignored) into the real Astro site, keeping locked DESIGN.md principles.
23 tasks: foundations 1-4 sequential (done), page clusters 5-20 parallel (in
progress), retirement sweep 21, verification 22, PR 23.
Supersedes: —

### D-002: MFA optional for every role; remember-device 30 days (2026-11-11)
Owner decision (`.cc/plan-audit-mfa-lms.md` Part B). Teacher profile publish no longer
requires MFA. Enrolled users are still challenged per new session unless the browser holds
a valid `sikhiuni_mfa_dev` token (30 days, hash-only storage, revoked on MFA disable/reset
and password reset). Do not re-add enrollment as a precondition without a new decision.
Supersedes: the 2026-09-10 "grace period" for teachers in docs/SECURITY.md.

## Landmines (things that bit us)
- **Concurrent subagents in ONE shared (non-worktree) working directory can
  destructively `git reset`/`git stash` each other's uncommitted work.**
  Confirmed live 2026-09-04: `git reflog` shows two `reset: moving to HEAD`
  entries during the first 4-way-concurrent page-task wave (tasks 5-8), each
  landing right after another task's commit. Task 5 detected its own edits
  vanish mid-task and had to redo them from scratch; task 6 hit a near-miss
  with its own `git stash`/`pop` verification gymnastics colliding with
  concurrent edits. Both self-recovered this time — NOT guaranteed next time.
  **Root cause**: a subagent using `git stash`/`git checkout -- .`/
  `git reset --hard` against the SHARED working tree to get a "clean" state
  for isolated verification, while other concurrent tasks still have
  uncommitted edits sitting in that same tree. **Fix going forward**: every
  future concurrent-task dispatch prompt must explicitly forbid
  `git reset --hard`, `git checkout -- .`/`git stash` (even stash+pop) against
  the shared tree for verification purposes — use read-only `git diff`/
  `git status`/`git show HEAD:<path>` comparisons instead, or (safer, more
  overhead) give each concurrent task its own `git worktree`. Given the
  scale of this job (16 page tasks), prefer smaller concurrent batches (2,
  not 4) over full isolation, to keep collision probability low without the
  worktree-coordination cost.
- `.claude/agents/` did not exist in this repo before 2026-09-04 (freshly
  installed same session as the plan — no restart needed this time, agent
  types resolved immediately via `subagent_type`, unlike the Baaz session's
  same-session install).

## Current focus
Feature: sikhiuni full multiscreen redesign, page-cluster wave 1 (tasks 5-8) in
flight, self-recovered from a mid-wave concurrent-git-reset incident (see
landmine above). See `.cc/plan-sikhiuni-redesign.md` for the full plan.
