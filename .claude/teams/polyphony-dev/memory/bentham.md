# Bentham — Scratchpad

## [CHECKPOINT] 2026-04-03 — Session review summary

Reviewed 8 items this session:

1. **#307 cross-org invite resolve (round 1)** — RED. Two blockers: orphaned roster slot creates phantom member, roster slot roles lost (regression). Josquin fixed both.
2. **#307 cross-org invite resolve (round 2)** — YELLOW. Blockers resolved. Flagged: voice/section INSERT should use `INSERT OR IGNORE` due to PK `(member_id, voice_id)` — mock dedup masks real D1 constraint violation.
3. **#307 FK constraint fix** — GREEN. Moved invite DELETE before roster member hard-delete to avoid FK violation on `invites.roster_member_id`.
4. **#310 invite redirect** — GREEN. Authenticated fast-path in `/invite/accept` load function. No auth boundary weakening.
5. **#313 invite roles readonly** — GREEN. Dead code removal — `invite.roles` was always `[]`. Read-only badge display from roster member roles.
6. **#316 voice org filter + i18n** — YELLOW. `queryMemberVoices` now takes `orgId` — correct. But tests still call with 2 args (missing `orgId`). Dead key `invite_roles_legend` left in locales.
7. **#320 voice editing API** — YELLOW. Permission model solid (owner/admin/conductor/section_leader/self). Missing voiceId validation against `voices` table before INSERT — FK 500 instead of 400 on bad input.
8. **#322 inline delete confirm** — GREEN. Clean `confirm()` replacement with ✓/✗ inline buttons.
9. **#289 dead permissions.ts** — GREEN. Stale single-role `db/permissions.ts` deleted, takedowns migrated to `auth/middleware`.

## [GOTCHA] 2026-04-02 — Cross-org invite: roster slot must be merged, not abandoned

When `acceptInvite` resolves an existing member via `getMemberByEmailGlobal`, the roster slot in the target org is orphaned — its `member_roles`, `member_voices`, `member_sections`, and `member_organizations` entry persist as phantom data. The fix must: (1) transfer roles/voices/sections from roster slot to real member, (2) remove roster slot from org, (3) optionally delete roster slot from `members` if no other org refs. Reviewed RED on first pass of #307. This pattern will recur for any future "merge member" logic.

## [DEFERRED] 2026-04-03 — Open YELLOW items from this session

- `INSERT OR IGNORE` for voice/section transfer in cross-org invite (#307 round 2 YELLOW) — still not fixed
- `queryMemberVoices` tests missing `orgId` arg (#316 YELLOW)
- voiceId validation against `voices` table in PUT endpoint (#320 YELLOW)
- Dead i18n key `invite_roles_legend` in all 4 locales
- PO note: backfill architecture-decisions.md with known ADRs — did not get to this

## [DEFERRED] 2026-03-19 — Carried from previous session

- `/\evil.com` backslash redirect bypass — team-lead says filed as #296 — still unverified
- Event repertoire nested routes still untested
- Sections/voices reorder+reassign still untested

(*PD:Bentham*)
