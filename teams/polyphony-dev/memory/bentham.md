# Bentham — Scratchpad

## [CHECKPOINT] 2026-04-05 — Session review summary

Reviewed 7 items this session:

1. **#336 registry landing simplify** — GREEN. Pure 55-line deletion, AC met.
2. **#340 section presets (round 1)** — YELLOW. Deterministic section IDs (`${orgId}-${name}`) broke `generateId()` pattern. Josquin fixed.
3. **#340 section presets (round 2)** — GREEN after ID fix. Remaining YELLOWs deferred: optional vs required preset picker (PO decision), Registry-side validation missing, ESLint baseline +2.
4. **#343 existing member org reg** — GREEN. SELECT-before-INSERT for cross-org member reuse. Same pattern as #307.
5. **#296 backslash open-redirect** — YELLOW (approve). Fix correct (`!startsWith("/\\")`), but guard is denylist — recommended follow-up for allowlist hardening.
6. **fix/settings-delete-confirm** — GREEN. `!target.isConnected` guard for click-outside + vault `.prettierrc` added.
7. **#347 section hierarchy settings** — GREEN. DB subqueries for `child_count`/`child_names`, UI indent + parent deletion block.
8. **#348 orchestral preset hierarchy** — YELLOW (approve). Data correct, minor TDD commit order note, Percussion singleton child.

Score: 5 GREEN, 3 YELLOW (all approved), 0 RED.

## [DEFERRED] 2026-04-05 — Open items from this session

- Follow-up issue needed: allowlist hardening for return_to redirect guard (#296 YELLOW)
- Registry server action should validate sections preset ID before forwarding (#340 YELLOW §3)
- PO decision needed: preset picker optional vs required per AC (#340 YELLOW §2)
- `GROUP_CONCAT` comma separator in `child_names` breaks if section name contains comma (#347 note)
- Percussion preset has only Timpani as child in Full Orchestra (#348 note)

## [DEFERRED] 2026-04-04 — Carried from previous sessions

- `/\evil.com` backslash redirect bypass — #296 — FIXED this session, follow-up for allowlist pending
- `INSERT OR IGNORE` for voice/section transfer in cross-org invite (#307 round 2 YELLOW)
- `queryMemberVoices` tests missing `orgId` arg (#316 YELLOW)
- voiceId validation against `voices` table in PUT endpoint (#320 YELLOW)
- Dead i18n key `invite_roles_legend` in all 4 locales
- PO note: backfill architecture-decisions.md with known ADRs — not started
- Event repertoire nested routes still untested
- Sections/voices reorder+reassign still untested

## [GOTCHA] 2026-04-02 — Cross-org invite: roster slot must be merged, not abandoned

When `acceptInvite` resolves an existing member via `getMemberByEmailGlobal`, the roster slot in the target org must be fully merged: (1) transfer roles/voices/sections, (2) remove from org, (3) hard-delete if orphaned. This pattern will recur for any future "merge member" logic.

(*PD:Bentham*)
