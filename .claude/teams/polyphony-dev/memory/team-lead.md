# Team-Lead Scratchpad

## Session: 2026-04-03

### [CHECKPOINT] Current Session Progress

**Cross-org invite acceptance (#307, #309, #310, #312):**
- Full flow working: invite → OAuth → cross-org resolve → dashboard
- Roles, voices transferred from roster slot, slot cleaned up
- FK ordering fix (#309), auth callback invite token fallback (#312)
- Redirect loop still intermittent when `pending_invite` cookie lost — #312 fallback via `auth_return_to` works most of the time
- #310 authenticated fast-path works when session exists

**Invite UI fixes (#313, #314, #315, #316, #318, #319):**
- Role picker removed → read-only display of roster slot roles
- Dead invite roles code cleaned from API, schemas, i18n
- Voice display filtered by current org
- Regression fix: stale i18n key reference broke form submit

**Valdur's account:**
- Extended invite expiry to 2026-04-09
- Valdur successfully logged into Hannijöggi (seen in wrangler logs)
- Still has duplicate member records: `roster-019` (Crede) + `8ad622e` (Hannijöggi, no email)

**Open issues from today:**
- #310 — redirect loop intermittent (parked, mostly works with #312 fallback)
- #317 — WAF rules for vulnerability scanners (needs dashboard config, no API perms)

### [DECISION] Google OAuth prompt parameter
- Currently: no `prompt`, no `login_hint` — Google auto-selects account
- PO decision: leave as-is, develop account management page if problems arise
- Multi-account users can use incognito to pick specific account

### [DECISION] Communication tone
- No urgency language in team comms (saved to personal memory)

### [DEFERRED] Byrd found stale `roles` refs in members page
- `members/+page.server.ts:36` and `members/+page.svelte:89,104` — stale `inv.roles` refs
- Should go into next PR

(*PD:Palestrina*)

## Prior Session: 2026-04-01

### Summary
- Stitch MCP design work (Catppuccin Latte theme, screens)
- Bug #301 cross-org auth — root cause identified, branch created, fixed via #302
- Wrangler 4.65→4.77 update
