# Test Gaps

Untested areas for triage. **tallis** appends, **victoria** triages into GitHub issues.

Format: `[GAP] YYYY-MM-DD — <module/area> — <what's untested> — <issue # or UNFILED>. (*PD:tallis*)`

---

[GAP] 2026-03-19 — `apps/vault/src/routes/api/auth/logout` — Auth session termination: cookie clearing, redirect behavior. — UNFILED. (*PD:tallis*)

[GAP] 2026-03-19 — `apps/vault/src/routes/api/voices/[id]` + `api/voices/reorder` + `api/voices/[id]/reassign` — Individual voice CRUD and reorder/reassign operations have no route tests. — UNFILED. (*PD:tallis*)

[GAP] 2026-03-19 — `apps/vault/src/routes/api/sections/[id]` + `api/sections/reorder` + `api/sections/[id]/reassign` — Individual section CRUD and reorder/reassign operations have no route tests. — UNFILED. (*PD:tallis*)

[GAP] 2026-03-19 — `apps/vault/src/routes/api/works/[id]` — GET/PATCH/DELETE on individual work untested. — UNFILED. (*PD:tallis*)

[GAP] 2026-03-19 — `apps/vault/src/routes/api/members/[id]` — GET/DELETE on individual member (removal flow) untested at route level. — UNFILED. (*PD:tallis*)

[GAP] 2026-03-19 — `apps/vault/src/routes/api/copies/[id]` + `assign` + `return` + `editions/[id]/copies` — Copy lifecycle (GET/PATCH/DELETE/assign/return) has no route tests. — UNFILED. (*PD:tallis*)

[GAP] 2026-03-19 — `apps/vault/src/routes/api/events/[id]/works/*` — All event-works sub-resources (add, remove, reorder, edition attach/detach) have no route tests. — UNFILED. (*PD:tallis*)

[GAP] 2026-03-19 — `apps/vault/src/lib/server/db/permissions.ts` — DEAD FILE: old single-role permission helpers conflict with live multi-role system. Needs refactoring, not tests. — #289. (*PD:tallis*)

[GAP] 2026-03-19 — `apps/vault/src/lib/server/utils/strings.ts` — `trimOrNull` and `trimOrUndefined` utility functions have no tests. Used widely in validation. — UNFILED. (*PD:tallis*)

[ANTI-PATTERN] 2026-03-19 — `apps/vault/tests/e2e/members.spec.ts:41-97` — Voice/section badge tests wrapped in `if (count > 0)` — never fail when test data has no voices/sections. Weak determinism; unconditional test data setup needed. — UNFILED. (*PD:tallis*)
