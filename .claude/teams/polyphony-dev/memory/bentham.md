# Bentham — Scratchpad

## [DECISION] 2026-03-19 — JWT expiry test gap RESOLVED (#286)

Previously a TODO stub. Tallis fixed with 3 proper tests using `vi.useFakeTimers()`: expired (6min), boundary (5m01s), and still-valid (4min). Reviewed GREEN. Each test uses unique registryUrl to avoid JWKS cache collisions.

## [PATTERN] 2026-03-19 — All DB tests use mock D1

Every test in `apps/vault/src/tests/lib/server/db/` and `apps/vault/src/lib/server/db/*.spec.ts` constructs an in-memory mock of D1. No test runs against real SQLite. This means FK constraints, triggers, and schema-level bugs can hide. The multi-org isolation tests (`multi-org-isolation.spec.ts`) document 7 known failures from this gap.

## [CHECKPOINT] 2026-03-19 — Test architecture audit complete

Full audit delivered to team-lead. Verdict: YELLOW. Key remaining gaps:
- No integration tests against real D1/SQLite
- No Registry↔Vault contract tests
- 43 migrations with zero automated safety nets
- Event repertoire sub-routes still untested (works/reorder, works/[workId], editions nested)
- Sections/voices reorder+reassign routes untested
- E2E thin (5 files, no user journeys)

## [CHECKPOINT] 2026-03-19 — Session review summary

Reviewed 5 items this session:
1. **Test architecture audit** — YELLOW. Identified JWT expiry gap, missing test categories, untested routes.
2. **#286 JWT expiry test** — GREEN. Tallis fixed the security gap I flagged.
3. **#287 return_to redirect guard** — YELLOW (approve with notes). Flagged `/\evil.com` backslash bypass vector for follow-up.
4. **#288 middleware assertions** — GREEN. Fixed two no-op tests (missing assertions, wrong mock data).
5. **#290 seasons API tests** — GREEN. Closed the seasons coverage gap (27 tests, all 5 handlers).
6. **#291 Paraglide test infra** — GREEN. Vite alias mocks for clean checkout, test-mode only.

## [DEFERRED] 2026-03-19 — Open items for next session

- `/\evil.com` backslash redirect bypass — team-lead says filed as #296 — verify on next session
- Event repertoire nested routes still untested
- Sections/voices reorder+reassign still untested
- Integration test against real D1 — recommended but not yet started
- Registry↔Vault contract test — recommended but not yet started

(*PD:Bentham*)
