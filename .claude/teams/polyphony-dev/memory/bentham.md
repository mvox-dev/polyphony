# Bentham — Scratchpad

## [CHECKPOINT] 2026-04-04 — Session review summary (combined 04-02 + 04-03 + 04-04)

Reviewed 12 items across 3 days:

1. **#307 cross-org invite resolve (round 1)** — RED. Orphaned roster slot + lost roles regression. Josquin fixed.
2. **#307 cross-org invite resolve (round 2)** — YELLOW. Blockers resolved. Voice/section INSERT should use `INSERT OR IGNORE` (PK collision risk).
3. **#307 FK constraint fix** — GREEN. Invite DELETE before roster member hard-delete.
4. **#310 invite redirect** — GREEN. Authenticated fast-path in `/invite/accept` load function.
5. **#313 invite roles readonly** — GREEN. Dead code removal, read-only badge display.
6. **#316 voice org filter + i18n** — YELLOW. `queryMemberVoices` tests missing `orgId` arg.
7. **#320 voice editing API** — YELLOW. Permission model solid. Missing voiceId validation against `voices` table.
8. **#322 inline delete confirm** — GREEN. Clean `confirm()` replacement.
9. **#289 dead permissions.ts** — GREEN. Stale single-role file deleted, takedowns migrated to auth middleware.
10. **#292 D1 integration test harness** — GREEN. Excellent. Closes audit gap from 2026-03-19.
11. **Pre-commit hooks** — GREEN. Prettier + ESLint baseline ratchet + type check + tests.
12. **#334 badge UX** — GREEN. Whole-badge button + mobile × visibility.

Score: 8 GREEN, 3 YELLOW, 1 RED (fixed in round 2).

## [GOTCHA] 2026-04-02 — Cross-org invite: roster slot must be merged, not abandoned

When `acceptInvite` resolves an existing member via `getMemberByEmailGlobal`, the roster slot in the target org must be fully merged: (1) transfer roles/voices/sections, (2) remove from org, (3) hard-delete if orphaned. This pattern will recur for any future "merge member" logic.

## [DEFERRED] 2026-04-04 — Open YELLOW items

- `INSERT OR IGNORE` for voice/section transfer in cross-org invite (#307 round 2 YELLOW)
- `queryMemberVoices` tests missing `orgId` arg (#316 YELLOW)
- voiceId validation against `voices` table in PUT endpoint (#320 YELLOW)
- Dead i18n key `invite_roles_legend` in all 4 locales
- PO note: backfill architecture-decisions.md with known ADRs — not started

## [DEFERRED] 2026-03-19 — Carried from previous sessions

- `/\evil.com` backslash redirect bypass — filed as #296 — still unverified
- Event repertoire nested routes still untested
- Sections/voices reorder+reassign still untested

(*PD:Bentham*)
