# Team-Lead Scratchpad

## Session: 2026-04-01

### [CHECKPOINT] Current Session Progress

**Stitch MCP design work:**
- Stitch project "Polyphony" — ID `2222734255533963660`
- Design system: **Catppuccin Latte** — asset ID `assets/80b9283d4ddd4ebdae29a14f8db91dc0`
  - Primary: Peach `#fe640b`, Secondary: Teal `#179299`, Tertiary: Lavender `#7287fd`
  - Neutral: `#4c4f69`, Background: `#eff1f5`
- Screens generated:
  - Landing page (original): `6dc5acbfc9e64f638f029309cb3b06dd`
  - Landing page (Catppuccin): `24dd876836b64309b4f00811110a1e30`
  - Roster/RSVP desktop: `8d7eba26b0b542fdaf59971f75af9538`
  - Roster/RSVP mobile: `ed1fd172bca64f08b096994210e10b71`

**Bug investigation #301 — Cross-org auth:**
- Filed #301: invite acceptance + logout both broken for multi-org users
- Root cause identified by finn + josquin:
  - Bug 1: `ssoHandle` hook intercepts `/invite/accept` before invite token is stored
  - Bug 2: Vault logout only clears `member_id`, not SSO cookie → auto-re-auth
- Issue updated with full analysis, fix plan, and TDD workflow
- Branch: `fix/301-cross-org-auth`
- PO confirmed: logout = clear SSO everywhere (per ARCHITECTURE.md design)
- **Status: Ready to kick off TDD, pending PO go-ahead**
- PO arranging phone call with Valdur for more details

### [DEFERRED] Radix Colors for a11y theme
- PO decision: Catppuccin Latte is default, Radix Colors (Amber/Pink/Mint) reserved for accessible theme later
- Radix has APCA contrast guarantees and dark mode support
- Track under #47 (accessibility improvements) when ready

### [DECISION] Stitch MCP integration — VERIFIED
- GCP project: `polyphony-stitch` (created under `mitselek@gmail.com`)
- `.mcp.json` has API key + `GOOGLE_CLOUD_PROJECT` (gitignored)
- Stitch API enabled in GCP console (2026-03-26)

### [DECISION] Wrangler auth
- Created `wrangler-login` skill for headless OAuth flow
- Auth as mihkel.putrinsh@gmail.com

(*PD:Palestrina*)

## Prior Session: 2026-03-26

### Summary
- Test coverage audit: filed 9 issues (#286-294, #296), closed 5, PRs #295-300 merged, +41 tests
- Open issues: #289 (dead permissions file — blocked, has active imports), #292-294 (P2 architecture), #296 (backslash bypass)
- Branch convention fixed (master → main)
- Wrangler 4.65→4.77 update committed
