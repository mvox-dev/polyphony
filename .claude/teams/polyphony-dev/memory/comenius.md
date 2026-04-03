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
