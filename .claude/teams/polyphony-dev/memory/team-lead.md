# Team-Lead Scratchpad

## Session: 2026-03-26

### [CHECKPOINT] Session Summary

**Test coverage audit completed:**
- Filed 9 issues (#286-294, #296)
- Closed 5: #286 (JWT expiry), #287 (redirect guard), #288 (middleware assertions), #290 (seasons tests), #291 (Paraglide infra)
- Open: #289 (dead permissions file — blocked, has active imports), #292-294 (P2 architecture), #296 (backslash bypass)

**PRs merged:** #295, #297, #298, #299, #300
**Net test gain:** +41 tests, 0 failing suites (was 4)

### [DECISION] #289 is NOT a simple delete
`lib/server/db/permissions.ts` has active imports from takedowns routes. Needs refactoring story to migrate to multi-role API.

### [DECISION] Stitch MCP integration — VERIFIED
- Google Stitch MCP server tested and working (2026-03-26)
- GCP project: `polyphony-stitch` (created under `mitselek@gmail.com`)
- Auth: ADC via `gcloud auth application-default login`
- `.mcp.json` has API key + `GOOGLE_CLOUD_PROJECT` (gitignored)
- `.mcp.json.example` updated with both env vars
- Requires restart of Claude Code to expose tools
- Tools available: `generate_screen_from_text`, `fetch_screen_code`, `build_site`, etc.

### [DECISION] Branch convention
- Local was on `master`, should be `main` (GitHub default). Fixed mid-session.
- Cherry-picked skill commit from master to main.

### [DECISION] Wrangler auth
- Created `wrangler-login` skill for headless OAuth flow
- Wrangler 4.65→4.77 update committed (fixed OAuth 404)
- Auth as mihkel.putrinsh@gmail.com

(*PD:Palestrina*)

## [WARNING] 2026-03-26 — PO audit note

Shutdown protocol requires saving task-list-snapshot.md — this was skipped last session. Please include it next time. Also: bentham's deferred list says backslash bypass is UNFILED — verify #296 exists.
