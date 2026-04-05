# Team-Lead Scratchpad

## Session: 2026-04-03/04/05

### [CHECKPOINT] Session Summary — 26 merges

**Cross-org invite flow (#307–#312):**
- Full flow working end-to-end
- FK ordering fix, auth callback invite token fallback
- Redirect loop intermittent (#310) — parked

**Invite UI (#313–#319):**
- Role picker → read-only, dead code cleaned, label fix, regression fix

**Voice/section work (#316–#335):**
- Voice display filtered by org, voice editing API with permissions
- Inline delete confirmation (replaced confirm()), badge UX (whole badge clickable, mobile ×)
- Section hierarchy: parent/child display, subtree grouping, block parent deletion

**Section presets (#340–#348):**
- SectionPreset type + 6 presets (SATB, SSAATTBB, SAB, Strings, Chamber, Full Orchestra)
- flattenPreset() with parentName references → two-pass batch insert
- Orchestral presets updated with parentName hierarchy
- Vault API accepts preset ID on org creation
- Registry preset picker UI
- Existing member org registration fix (#343)

**Security (#296, #345):**
- Backslash open-redirect bypass fixed
- Allowlist hardening filed (#345) as follow-up
- WAF rules active (scanners + exploit extensions)

**Infrastructure (#292, #329–#339):**
- Integration test harness (real SQLite with FK enforcement, 11 tests)
- Pre-commit hooks (Prettier + ESLint baseline 109 + type check + tests)
- prepare-commit-msg hook for PO co-author trailer
- Git worktrees for Josquin + Byrd with separate identities
- GitHub bot accounts: 5 created (palestrina, byrd, josquin, tallis, bentham), 3 as collaborators
- spawn_member.sh updated for worktrees + GH_TOKEN
- Local merge procedure (no gh pr merge — ensures hooks run)
- CI + deploy workflows bumped to Node 22
- Auto-deploy working via local push → GitHub Actions → Cloudflare Pages
- Prettier formatting pass, ESLint paraglide exclusion
- Favicon.ico added, landing page simplified (#336)

**Settings delete confirm bug:**
- handleClickOutside race condition with Svelte re-render
- Fixed with `!target.isConnected` early return (second attempt — first had inverted logic)

### [DECISION] Git worktree workflow
- Coding agents (Josquin, Byrd, Tallis, Comenius) get worktrees at ~/worktrees/<name>
- Read-only agents (Palestrina, Bentham, Victoria, Finn) stay on ~/workspace
- Branch convention: agent creates own branch, Josquin merges all into feature branch
- Merge procedure: always local `git merge --squash` + `git commit` + `git push`, never `gh pr merge`

### [DECISION] Section hierarchy
- DB already has `parent_section_id` — no need for `/` separator convention
- Presets use `parentName` references, two-pass insert resolves to IDs
- UI groups subtrees visually in bordered containers

### [DECISION] Co-author attribution
- `prepare-commit-msg` hook appends `Co-authored-by: Mihkel Putrinš <mihkel.putrinsh@gmail.com>`
- Works on local commits, not on `gh pr merge` (hence local merge procedure)
- `attribution` setting in settings.json doesn't affect Bash git commits — deferred

### [DEFERRED]
- #310 redirect loop — intermittent, needs deeper investigation
- #339 worktrees — partially done (Josquin + Byrd), Tallis + Comenius remaining
- #345 allowlist hardening for redirect guard
- GitHub bot accounts: 3 remaining (comenius, victoria, finn) — GitHub signup rate limited
- Cloudflare Pages Git integration — not set up, using Actions + manual triggers
- Log monitor running until 2026-04-06 (PID 798472)

(*PD:Palestrina*)
