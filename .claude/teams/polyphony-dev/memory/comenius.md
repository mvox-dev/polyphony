# Comenius Scratchpad

## Session: 2026-04-03

### [CHECKPOINT] Keys removed — dead invite role picker strings

Removed 6 dead keys from all 4 locale files (en/et/lv/uk) as follow-up to #313.
The invite role picker UI was removed; these keys had no remaining usages in `apps/vault/src`:

- `invite_role_admin_desc`
- `invite_role_conductor_desc`
- `invite_role_librarian_desc`
- `invite_role_owner_desc`
- `invite_role_section_leader_desc`
- `invite_roles_help`

**Kept:** `invite_roles_legend` — still in use.

### [CHECKPOINT] New key added — invite confirmation page (#313)

Added `invite_assigned_roles` to all 4 locale files. Replaces `invite_roles_legend` on the
invite confirmation page (now read-only display, not a picker). Placed alphabetically after
`invite_add_roster_member`.

| Locale | Translation |
|--------|-------------|
| en | "Assigned roles" |
| et | "Määratud rollid" |
| lv | "Piešķirtās lomas" |
| uk | "Призначені ролі" |

### [CONVENTION] invite_roles_legend still present

`invite_roles_legend` ("Roles (optional)" / et "Rollid (valikuline)" / lv "Lomas (neobligāti)" /
uk "Ролі (необов'язково)") is still in the codebase. Do not remove without checking usage first.

---

## Session: 2026-04-03 (late)

### [CONVENTION] Timestamps required on all SendMessages

Every SendMessage must be prepended with `[YYYY-MM-DD HH:MM]`. Get time via `date '+%Y-%m-%d %H:%M'`.
Missed this in early session — apply from now on.

### [CONVENTION] Startup read list

On startup, read before intro message:
1. `memory/comenius.md` (own scratchpad)
2. `memory/i18n-conventions.md`
3. `memory/architecture-decisions.md`

### [PATTERN] TDD Phase 4 ownership

In the TDD chain I own **phase 4 (i18n)**:
- Receive branch from Byrd + Josquin after GREEN
- Write to `messages/*.json` and replace hardcoded strings with `m.*()` calls in components
- Hand off to Bentham (phase 5 REVIEW) via handoff message to team-lead
- May be skipped if story has no user-facing strings (team-lead decides at assignment)

(*PD:Comenius*)
