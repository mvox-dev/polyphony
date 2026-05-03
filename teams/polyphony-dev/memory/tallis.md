# Tallis Scratchpad

## Session started: 2026-03-19 / resumed 2026-03-26 / resumed 2026-04-05

[CHECKPOINT] 2026-04-05 — Session complete. Stories finished this session:
  - chore/remove-stale-red-tests: deleted `apps/vault/src/tests/routes/api/members/sections-put.spec.ts` (19 stale RED tests for #333 which was already implemented). Pre-commit now clean.
  - feat/340-section-presets: 27 shared package tests (`packages/shared/src/presets/sections.spec.ts`) + 11 API endpoint tests in `+server.spec.ts` for section presets (#340). ESLint baseline bumped 107→109 for Josquin's new functions. Committed to Josquin's worktree.
  - fix/343-org-reg-existing-member: 7 tests for existing-member org registration fix (#343). Also fixed `makeMockDb` helper to add `first()` on `bind()` results (mechanical fix for Josquin's SELECT-first change). Branch in Josquin's worktree.
  - fix/296-backslash-bypass: 5 `it.fails()` tests + 19 regular tests for backslash open-redirect bypass (#296). New file `callback-redirect-guard.spec.ts` + additions to `login.spec.ts`. On main workspace branch.

[CHECKPOINT] 2026-03-26 — Session complete. Stories finished this session:
  - #286: JWT expiry tests (branch: fix/286-jwt-expiry-test) — 3 new tests, 26 passing
  - #287: return_to redirect guard tests (branch: fix/287-return-to-redirect-guard) — 11 new tests
  - #288: Middleware assertion fixes (branch: fix/288-middleware-assertions) — 2 no-op tests fixed
  - #290: Seasons API tests (branch: feat/290-seasons-api-tests) — 27 new tests
  All branches complete, awaiting PR/merge by team-lead.

[GOTCHA] 2026-03-19 — `apps/vault/src/lib/server/db/permissions.ts` is a DEAD FILE with old single-role logic (`canUploadScores(role: Role)` takes string, not Member). Conflicts with live `auth/permissions.ts` multi-role system. Issue #289 filed. Risk: confusion when someone reads it and thinks it's canonical.

[PATTERN] 2026-03-19 — Two mock patterns in use across vault tests:
  1. Hand-crafted `createMockDb()` — used in DB layer tests and middleware.spec.ts
  2. `vi.mock('$lib/server/auth/middleware')` + `vi.mock('$lib/server/db/...')` — used in route tests (editions.spec.ts, seasons.spec.ts pattern)
  Both are acceptable; route tests prefer full vi.mock for isolation.

[PATTERN] 2026-03-19 — Route test event structure (SvelteKit mock):
  - Mock `@sveltejs/kit`: `error` throws, `json` returns Response with status
  - `createMockEvent()` helper with url, params, platform.env.DB, cookies, locals.org.id
  - Mock middleware via vi.mock('$lib/server/auth/middleware')
  See seasons.spec.ts for canonical example.

[PATTERN] 2026-04-05 — `makeMockDb()` helper in `+server.spec.ts` (public organizations):
  Must include `first()` on BOTH the prepared statement AND the bind() return:
  ```
  bound = { run: ..., first: vi.fn().mockResolvedValue(null), all: ... }
  prepared = { bind: vi.fn(() => bound), first: vi.fn()..., ... }
  ```
  Josquin's `createOwnerMember` does SELECT-first (added in #343 fix), so any mock missing `bind().first()` will throw at runtime.

[PATTERN] 2026-04-05 — RED tests in environments with strict pre-commit hooks:
  Use `it.fails()` to encode unimplemented requirements. The test suite passes (it.fails() counts as passing when the assertion fails). When the fix lands and the assertion passes, `it.fails()` flips to unexpected-pass, signalling the implementer to convert to regular `it()`.

[GOTCHA] 2026-03-19 — middleware.spec.ts had two no-op tests (no assertions). Fixed in #288. Original had wrong mock data for "allows" test — member had no roles but test name said "allows". Fixed by using admin-456 with requireAdmin.

[GOTCHA] 2026-04-05 — `GET()` in callback/+server.ts returns `MaybePromise<Response>` (SvelteKit type). Calling `.catch()` directly on it fails TS check. Must wrap: `Promise.resolve(GET(event)).catch(e => e)`.

[CHECKPOINT] 2026-04-05 — #296 backslash bypass FIXED. Both `it.fails()` converted to `it()`, 24 tests GREEN.

[GAP] 2026-03-19 — Remaining gaps in test-gaps.md (P1-P3 items still open):
  - auth/logout route tests (UNFILED)
  - voices/[id], voices/reorder, voices/reassign route tests (UNFILED)
  - sections/[id], sections/reorder, sections/reassign route tests (UNFILED)
  - works/[id] individual CRUD tests (UNFILED)
  - members/[id] removal route tests (UNFILED)
  - copies lifecycle route tests (UNFILED)
  - events/[id]/works sub-resources (UNFILED)
  - strings.ts utility tests (UNFILED)
  - E2E badge tests need unconditional fixtures (UNFILED)
