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

---

## Session: 2026-04-05

### [CHECKPOINT] Startup complete

Online and ready. No active story branch. Awaiting phase 4 handoff from Byrd/Josquin.

### [CHECKPOINT] #351/#352-355 registry i18n extraction COMPLETE (2026-04-05)

Extracted all hardcoded strings from 6 registry routes. 0 errors, 0 warnings on `pnpm check`.

Key decisions:
- **ICU plurals unsupported** by `@inlang/plugin-message-format@4`. Used two-key pattern instead: `directory_organizations_count_one` / `directory_organizations_count_other`. Component uses Svelte ternary.
- **Ukrainian plural gap**: Ukrainian has 3 forms (1/2-4/5+), but plugin can't handle it. `_other` uses "хорів" (5+ form). Minor UX issue — can revisit if Paraglide plugin is upgraded.
- **Embedded link in directory empty state**: split into `_prefix`, `_link`, `_suffix` keys. Works linguistically since split is consistent across et/lv/uk.
- **Dashboard JS arrays**: replaced inline array literals with `$derived` `eventItems` and `authItems` so labels are reactive.
- **deploy/ features with emojis**: emojis included in message values (📚, 👥, 📅, 🔒).
- **Footer attribution** ("Operated by Mihkel Putrinš") left hardcoded — not a translatable UI string.

### [CHECKPOINT] #351 registry string audit (2026-04-05)

Full catalogue of hardcoded strings across all registry routes. Awaiting #350 merge (Paraglide setup) before extracting.

**+page.svelte (landing)**
- `<title>`: "Polyphony — Federated Choral Music Sharing"
- `<meta>`: "A federated platform for choirs to manage and share their music libraries securely within trusted circles."
- subtitle: "Federated choral music sharing for trusted circles"
- card h3: "Find a Choir" → being updated to "Find an ensemble" by Byrd
- card p: "Browse the directory of registered choirs and ensembles using Polyphony."
- card h3: "Register Your Collective" → being updated by Byrd
- card p: "Start your choir's own Vault — manage your library, members, and events in one place."
- section h2: "Built for Choirs" → being updated to "Built for ensembles" by Byrd
- features: "Score Library", "Works, editions, physical copies", "Member Management", "Roles, voices, sections", "Events & Attendance", "Rehearsals, concerts, RSVP", "Umbrella Support", "Manage affiliated choirs"
- footer: "Open source · Privacy-first · Built for choirs" (Byrd may update)

**dashboard/+page.svelte**
- `<title>`: "Dashboard — Polyphony"
- h1: "Platform Dashboard", subtitle: "Live statistics for the Polyphony network"
- empty state: "No dashboard data available yet. Stats will appear once the platform has been running."
- section h2: "Platform Overview"
- stat labels: "Organizations", "Members", "Works", "Library Size"
- section h2: "Today's Events"
- event labels in JS array: "Rehearsals", "Concerts", "Retreats", "Festivals" → need `$derived`
- section h2: "Today's Auth Activity"
- auth labels in JS array: "OAuth Started", "SSO Fast Path", "OAuth Completed", "Email Sent", "Email Verified" → need `$derived`
- sparkline label: "Auth events (30 days)"

**auth/error/+page.svelte**
- `<title>`: "Sign In Failed | Polyphony"
- h1: "Sign In Failed"
- button: "Try Again"
- p: "Please return to the vault login page and try again."
- p: "If this problem persists, contact your vault administrator."

**directory/+page.svelte**
- `<title>`: "Choir Directory | Polyphony"
- h1: "Choir Directory", p: "Choirs and ensembles using Polyphony."
- empty h2: "No choirs yet", p: "Be the first to create a Vault for your choir."
- link: "Visit"
- ⚠️ PLURALIZATION: `{n === 1 ? 'choir' : 'choirs'} registered` — needs parameterized key

**register/+page.svelte**
- `<title>`: "Register Your Organization | Polyphony"
- h1: "Register Your Organization", p: "Create a new choir or ensemble on Polyphony"
- labels: "Organization Name", "Contact Email", "Your URL", "Section Layout"
- p: "Primary contact for your organization"
- subdomain status: "Checking availability...", "Available!"
- p: "At least 3 characters required", "3-30 characters, letters, numbers, and hyphens"
- option: "None — set up sections later"
- optgroup labels: "Choral", "Orchestral"
- p: "Pre-populate your vault with a standard set of sections."
- p uppercase: "Sections included"
- buttons: "Creating Organization...", "Create Organization"
- p: "By registering, you agree to our terms of service"

**register/success/+page.svelte**
- `<title>`: "Registration Successful | Polyphony"
- h1: "Organization Created!"
- p: "Your organization has been successfully registered on Polyphony."
- p: "Your organization URL:"
- p: "It may take a few minutes for the URL to become active while the SSL certificate is provisioned."
- h2: "Next Steps"
- steps: "Visit your organization's site at the URL above", "Log in with the email you registered with", "Start inviting members and uploading scores"
- link: "← Back to Home"

**deploy/+page.svelte**
- `<title>`: "Create a Vault | Polyphony"
- h1: "Create a Vault", p: "Deploy your choir's own Polyphony Vault in minutes."
- h2: "Coming Soon"
- p: "One-click Vault deployment is under development..."
- link: "View on GitHub"
- h2: "What's Included"
- features (with emoji in text): "📚 Score Library", "👥 Member Management", "📅 Event Scheduling", "🔒 Privacy-First" + descriptions

(*PD:Comenius*)

---

### [WIP] Landing page ensemble copy — draft translations (2026-04-05)

Waiting on Byrd for key names. **NOTE: registry has no Paraglide** — flagged to team-lead.
If keys go in vault messages, prefix should be `landing_*` (not yet established) or whatever Byrd uses.

| en string | et | lv | uk |
|-----------|----|----|-----|
| "Manage your ensemble's scores, members, and rehearsals — all in one place." | "Halda oma ansambli noote, liikmeid ja proove — kõik ühes kohas." | "Pārvaldiet sava ansambļa notis, dalībniekus un mēģinājumus — viss vienuviet." | "Керуйте нотами, учасниками та репетиціями вашого ансамблю — все в одному місці." |
| "Built for ensembles" | "Loodud ansamblitele" | "Veidots ansambliem" | "Створено для ансамблів" |
| "Find an ensemble" | "Leia ansambel" | "Atrast ansambli" | "Знайти ансамбль" |
| "Register your ensemble" | "Registreeri oma ansambel" | "Reģistrēt savu ansambli" | "Зареєструвати ансамбль" |
| "Start your ensemble's own space — manage your library, members, and events. Free." | "Loo oma ansamblile oma ruum — halda noodikogu, liikmeid ja üritusi. Tasuta." | "Izveidojiet sava ansambļa telpu — pārvaldiet bibliotēku, dalībniekus un pasākumus. Bez maksas." | "Створіть власний простір для ансамблю — керуйте бібліотекою, учасниками та заходами. Безкоштовно." |

(*PD:Comenius*)

(*PD:Comenius*)
