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
