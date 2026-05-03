# Team-Lead Scratchpad

## Session: 2026-04-03/04/05 (autonomous night shift)

### [CHECKPOINT] Final Session Summary — 30 merges

**Everything from previous checkpoint plus:**

**i18n Epic (#349-355) — COMPLETE:**
- Paraglide installed on registry (#350)
- ~95 keys across 6 routes, 4 locales (en/et/lv/uk)
- All hardcoded strings converted to `m.*()` calls
- Landing page copy updated: "choirs" → "ensembles"
- "Vocal Ranges" → "Parts" / "Partiid" in vault settings

**Section hierarchy (#347-348):**
- Parent/child nesting in settings UI with subtree containers
- Block parent deletion (show child names instead of trash)
- Orchestral presets updated with parentName hierarchy
- Registration preset preview shows tree grouping

**Security (#296, #345):**
- Backslash open-redirect bypass fixed and merged
- Allowlist hardening filed (#345)

**Org registration (#340-343):**
- Section presets feature complete (6 presets)
- Existing member cross-org registration fix (#343)

**Infrastructure:**
- prepare-commit-msg hook for PO co-author (working)
- Local merge procedure (no gh pr merge)
- Worktree branch convention: switch off main after merge
- Wrangler logs gitignored, monitor cleaned up

### [DEFERRED for PO review]
- Bentham YELLOW: auth/error fallback string still hardcoded English
- Bentham YELLOW: preset labels/descriptions from shared package not i18n'd
- Bentham YELLOW: Ukrainian 3-form plurals (2-key workaround)
- Bentham YELLOW: Latvian translations need native speaker review
- Bentham YELLOW: nav links (GitHub, Directory, Dashboard) not i18n'd
- #339 worktrees — partially done
- #345 allowlist hardening for redirect guard
- #347 — parent section delete still returns 500 (UI blocks it but API doesn't handle gracefully)
- GitHub bot accounts: 3 remaining (comenius, victoria, finn)
- Cloudflare Pages Git integration not set up

### [DECISION] Autonomous night shift decisions
- Approved #350 YELLOW (sed hack matches vault pattern)
- Approved #351-355 YELLOW (follow-up items documented above)
- Combined #351-355 into one pass (efficiency over strict sub-issue separation)
- Allowed Comenius to start audit before #350 merged (parallel work)

(*PD:Palestrina*)

## Session: 2026-05-03 (relocation chore)

### [CHECKPOINT] chore/relocate-teams-out-of-claude pushed (commit 5de9bb3)
- Moved `.claude/teams/polyphony-dev/` → `teams/polyphony-dev/` (the directory rename was already staged when session started; this session finished the content edits)
- 17 files content-edited: 8 prompts, 5 inboxes, startup.md, common-prompt.md, .claude/CLAUDE.md, .gitignore
- Inbox bootstraps converted from container-absolute (`/home/ai-teams/workspace/.claude/teams/...`) to repo-relative (`teams/polyphony-dev/...`) so they work in both local and container envs
- PR not yet opened: <https://github.com/mvox-dev/polyphony/pull/new/chore/relocate-teams-out-of-claude>
- No teammates spawned this session

### [GOTCHA] Path discipline when relocating team config
- `$HOME/.claude/teams/<name>/` is runtime (config.json, inboxes) — managed by the harness via TeamCreate, NOT in repo. Stays at that location regardless of where repo team config lives.
- `$REPO/teams/<name>/` (post-relocation) is durable config + memory — checked in.
- When bulk-rewriting `.claude/teams/` refs, MUST exclude `$HOME/.claude/teams/` and `~/.claude/teams/` runtime references — otherwise you break TeamCreate path resolution. Per-file `Edit` is safer than blanket `sed`.

### [DEFERRED]
- `.claude/CLAUDE.md` Pane Map still references container-only resources (`/tmp/polyphony-panes.env`, `/home/ai-teams/spawn_member.sh`). Not addressed because no decision on whether to support a local-only spawn fallback. Local startup currently works only by following `teams/polyphony-dev/startup.md` Phase 5 (Agent tool with `run_in_background: true`), not the Pane Map.
- `.claude/settings.json:51` statusline still references `/home/ai-teams/workspace/.claude/statusline-command.sh` — broken when run locally. Out of scope for this branch.

(*PD:Palestrina*)

## Session: 2026-05-03 (frictionless-startup follow-up — same branch)

### [CHECKPOINT] Startup ran end-to-end locally; folded 5 friction fixes into the branch
- Executed Phases 0–6 from `teams/polyphony-dev/startup.md` locally for the first time. `TeamCreate("polyphony-dev")` + inbox restore + spawn-via-Agent-tool all worked. finn + bentham introed clean.
- Both flagged carry-over follow-ups (see [DEFERRED] below).

### [DECISION] Made `.claude/CLAUDE.md` env-aware (local + container)
- Added "Spawn Method" section with `if [ -f /tmp/polyphony-panes.env ] && [ -x /home/ai-teams/spawn_member.sh ]` env detection.
- Pane Map renamed "Container Pane Map" with explicit "Container only — skip in local mode" gate.
- Local branch: spawn via `Agent` tool with `run_in_background: true`, `name`, `team_name`, prompt = content of `teams/polyphony-dev/prompts/<name>.md`.
- All paths now via `REPO="$(git rev-parse --show-toplevel)"` instead of `~/workspace/`.

### [DECISION] startup.md Phase 5 — finn + bentham now spawn in parallel
- Were "sequential with confirmation gates" — added latency for no benefit (intros are independent).
- Phase 1 (always-on roles) now parallel; gate to phase 2 (implementers) preserved because that's a real dep.

### [DECISION] startup.md "Known Environment Issues" split into Common / Container / Local
- Container-specific stuff (`$HOME=/home/ai-teams`, Pane Map ref) no longer reads as universal truth.

### [DECISION] `.claude/settings.json:51` statusline path made portable
- `bash /home/ai-teams/workspace/.claude/statusline-command.sh` → `bash "${CLAUDE_PROJECT_DIR:-.}/.claude/statusline-command.sh"`.
- Claude Code sets `CLAUDE_PROJECT_DIR` for hooks/statusline; fallback `.` works if the launcher CWD is the repo root.

### [DEFERRED carried over from finn + bentham intros]
- ~25 untested `+page.server.ts` loads + several untested route handlers (voices, sections, works, copies, event-works) — most still UNFILED as issues. See `memory/test-gaps.md`.
- `permissions.ts` dead-file (#289) still open.
- `architecture-decisions.md` still nearly empty — PO asked Bentham 2026-03-26 to backfill stable ADRs (D1 BLOB choice, EdDSA JWT, no-R2, monorepo, Paraglide). Still not done.
- `i18n-conventions.md` empty — Comenius hasn't seeded.
- Bentham's open follow-ups: #296 redirect allowlist, #340 Registry-side preset ID validation, #307 INSERT OR IGNORE, #320 voiceId validation, dead i18n key `invite_roles_legend`, GROUP_CONCAT comma bug in #347 child_names.
- PO decision pending: section preset picker optional vs required (#340 AC).

### [CHECKPOINT] Session end
- Branch merged to main: squash commit `2121b73 chore: relocate team config and make startup env-aware`. Remote chore branch deleted.
- Team shutdown clean: finn + bentham terminated. No TeamDelete (persistent roster).
- Bentham reflagged at shutdown: ADR backfill in `architecture-decisions.md` still pending.

(*PD:Palestrina*)
