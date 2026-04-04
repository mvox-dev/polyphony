# Team-Lead Scratchpad

## Session: 2026-04-03/04

### [CHECKPOINT] Session Summary

**17 PRs merged (#308–#335):**

**Cross-org invite flow (#307–#312):**
- Full flow working: invite → OAuth → cross-org resolve → dashboard
- Roles, voices transferred from roster slot, slot cleaned up
- FK ordering fix (#309), auth callback invite token fallback (#312)
- Redirect loop still intermittent (#310) — works when `auth_return_to` has invite token, fails when token laundered through URL formats

**Invite UI (#313–#315, #319):**
- Role picker removed → read-only display of roster slot roles
- Dead invite roles code cleaned from API, schemas, i18n
- Regression fix: stale i18n key broke form submit

**Voice/section work (#316, #318, #320–#323, #334–#335):**
- Voice display filtered by current org
- Voice editing API with permissions (owner/admin/conductor/section_leader/self)
- Inline delete confirmation (replaced browser confirm())
- Badge UX: whole badge clickable, × visible on mobile

**Infrastructure (#324–#331):**
- Dead permissions.ts deleted (#289), takedowns migrated to auth middleware
- Integration test harness: real SQLite with FK enforcement (#292), 11 tests
- Prettier formatting pass (both apps)
- Pre-commit hooks: Prettier + ESLint baseline (107) + type check + tests
- ESLint: excluded generated Paraglide files
- Fixed 20 type errors in test files

**Ops:**
- WAF rules created via Cloudflare API (block scanners + exploit extensions)
- Favicon.ico added (stops 404s)
- Stale branches cleaned (20 deleted)
- Log monitor running until 2026-04-06 (PID 798472)

### [DECISION] Google OAuth prompt parameter
- No `prompt`, no `login_hint` — Google auto-selects account
- PO decision: leave as-is, develop account management page if problems arise

### [DECISION] Communication tone
- No urgency language in team comms

### [DECISION] Formatting enforcement
- Pre-commit hooks gate all commits: Prettier + ESLint baseline + type check + tests
- ESLint baseline: 107 (complexity rules only, Paraglide excluded)

### [GOTCHA] Josquin messaging
- Josquin can only send idle notification summaries, not full text messages
- May be a team config registration issue — investigate next session

### [DEFERRED]
- #310 redirect loop — intermittent, needs deeper investigation of cookie chain
- Valdur's duplicate member records (roster-019 + 8ad622e) — needs cleanup after successful invite test
- #296 backslash bypass test, #294 migration smoke tests, #293 contract tests — P2

(*PD:Palestrina*)

## Prior Session: 2026-04-01

### Summary
- Stitch MCP design work (Catppuccin Latte theme, screens)
- Bug #301 cross-org auth — root cause identified, branch created, fixed via #302
- Wrangler 4.65→4.77 update
