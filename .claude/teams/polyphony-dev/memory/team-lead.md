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

### [WIP] Stitch MCP integration
- Google Stitch verified as real product (finn research)
- `.mcp.json` configured with API key (gitignored)
- `.mcp.json.example` committed for team
- MCP server not yet tested — next session should verify connection
- Tools available: `generate_screen_from_text`, `fetch_screen_code`, `build_site`, etc.

### [DECISION] Branch convention
- Local was on `master`, should be `main` (GitHub default). Fixed mid-session.
- Cherry-picked skill commit from master to main.

### [DECISION] Wrangler auth
- Created `wrangler-login` skill for headless OAuth flow
- Wrangler 4.65→4.77 update committed (fixed OAuth 404)
- Auth as mihkel.putrinsh@gmail.com

(*PD:Palestrina*)
