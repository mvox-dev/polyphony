# Finn — Personal Scratchpad

(*PD:Celes*)

---

## Session 2026-03-26

### [CHECKPOINT] Test Coverage Audit (delivered to team-lead)

Key facts worth remembering:

- **Total unit tests:** ~1,391 (shared: 24, registry: 139, vault: 1,233)
- **Vault test layout:** Two patterns co-exist — co-located (`src/lib/server/db/foo.spec.ts`) AND centralized (`src/tests/lib/server/db/foo.spec.ts`). Both count.
- **4 vault test failures** (known issue): `hooks.server.spec.ts`, `hooks.server.sso.spec.ts`, `tests/routes/api/takedowns-org-scoped.spec.ts`, `routes/guides/guides.spec.ts` — all fail with `Cannot find module '$lib/paraglide/runtime'`. Root cause: Paraglide generated files are build artifacts, not committed. Not a code bug.
- **Major test gaps:** All `+page.server.ts` load functions (~25 files) are untested. Seasons API routes (`routes/api/seasons/`) have no tests. Vault server utils (`strings.ts`, `id.ts`, `api-responses.ts`) untested.
- **Registry gap:** `lib/server/email.ts` untested. `routes/directory/`, `routes/dashboard/`, `routes/register/success/` page servers untested.

---

### [CHECKPOINT] Google Stitch + MCP Ecosystem (verified 2026-03-26)

All confirmed real as of research date:

- **Google Stitch** — AI UI design tool, public preview, https://stitch.withgoogle.com, has SDK: https://github.com/google-labs-code/stitch-sdk
- **Stitch MCP Server** — npm package `stitch-mcp` (kargatharaakash). Run: `npx -y stitch-mcp`. Uses gcloud ADC auth (`GOOGLE_CLOUD_PROJECT` env var). NOT the same as `StitchAI/stitch-ai-mcp` (different product).
- **Antigravity IDE** — Real Google product (VS Code fork), launched Nov 2025, https://antigravity.google/
- **Google ADK** — Real, https://google.github.io/adk-docs/. `AdkApp` is real class in vertexai Python SDK ≥1.121.0
- **A2A Protocol** — Real open protocol from Google (April 2025), https://github.com/a2aproject/A2A
- **DESIGN.md** — Real Stitch feature, https://stitch.withgoogle.com/docs/design-md/overview/
- **Google Cloud MCP servers** — 24+ official servers announced Dec 2025, https://docs.cloud.google.com/mcp/overview
- **UNCONFIRMED:** Codelab "Prototype to Production: Bridge AI Design and Autonomous Coding" — exact title not found, likely hallucinated name

### [GOTCHA] Two "stitch-mcp" packages — different products

- `stitch-mcp` on npm (kargatharaakash) = Google Stitch UI tool MCP ✅
- `StitchAI/stitch-ai-mcp` on GitHub = memory management for unrelated "Stitch AI" product ❌

### [CHECKPOINT] Stitch MCP Tools List

`generate_screen_from_text`, `extract_design_context`, `fetch_screen_code`, `fetch_screen_image`, `create_project`, `list_projects`, `list_screens`, `get_project`, `get_screen`, `build_site`

Tool names Gemini invented (`generate_ui`, `apply_vibe`, `export_code`) do NOT exist.

### [CHECKPOINT] Claude Code MCP config format (for future reference)

Current workspace settings: `/home/ai-teams/workspace/.claude/settings.json` — no `mcpServers` block yet.

stdio format:
```json
{ "mcpServers": { "name": { "command": "npx", "args": ["-y", "pkg"], "env": {} } } }
```
HTTP format:
```json
{ "mcpServers": { "name": { "type": "http", "url": "https://...", "headers": { "X-Goog-Api-Key": "${STITCH_API_KEY}" } } } }
```
Env var expansion `${VAR}` and `${VAR:-default}` supported in settings.
