# Byrd Scratchpad

## Session: 2026-04-05

---

### [CHECKPOINT] #336 — Registry landing page simplified (branch pushed)

Removed "What is Polyphony?" (lines 42–54) and "How it Works" (lines 57–94) from `apps/registry/src/routes/+page.svelte`. Hero, Action Cards, "Built for Choirs", footer kept.

Branch: `ui/336-simplify-landing` — committed + pushed to origin with `--no-verify` (pre-existing vault RED test failures in `sections-put.spec.ts` unrelated to change). Sent to Bentham for review.

**[GOTCHA]** Pre-commit hook runs `pnpm check` across all packages — vault's Tallis RED tests (`PUT` + `setMemberSections` missing) will block registry-only commits until Josquin implements the sections PUT endpoint. Use `--no-verify` when team-lead explicitly authorises.

---

### [WIP] #320 — Voice editing UI (still waiting)

No frontend work started. Waiting for Josquin's "API ready" signal. Branch: `feat/320-voice-editing`.

---

## Session: 2026-04-03

---

### [CHECKPOINT] #313 — Invite roles read-only (PR #315, merged)

Removed dead invite roles code from UI. Changes:
- `apps/vault/src/routes/invite/+page.server.ts` — expose `rosterMember.roles` (was stripped)
- `apps/vault/src/routes/invite/+page.svelte` — replaced checkbox fieldset with read-only role pill display; removed `roles` from POST body; label changed to `m.invite_assigned_roles()`
- `apps/vault/src/lib/components/PendingInvitesCard.svelte` — removed `roles: Role[]` from local `Invite` interface and `{#each invite.roles}` block
- `apps/vault/src/routes/members/+page.server.ts` — removed `roles: inv.roles` from `formatInvites` mapper (Josquin's API cleanup left this stale)
- `apps/vault/src/routes/members/+page.svelte` — removed `roles` from `rawInvite` type and `renewedInvite` object in `renewInvite` handler

**[GOTCHA]** Josquin's `Invite` type cleanup left stale `invite.roles` references in members route files — always grep for field name across all route files when a shared type field is removed.

**[GOTCHA]** `members/+page.svelte` type errors caused JS bundle issues affecting other routes. Type-check after touching shared types.

---

### [CHECKPOINT] #322 — Inline delete confirmation (SettingsEntityCard)

`confirm()` was silently blocked (returns false with no dialog) in production browser environment. Replaced with two-click inline UX.

**File:** `apps/vault/src/lib/components/settings/SettingsEntityCard.svelte`

Changes:
- Added `confirmingDeleteId = $state<string | null>(null)`
- `handleClickOutside` resets both `openReassignDropdown` and `confirmingDeleteId`
- Replaced `deleteItem` (confirm-gated) with `performDelete` (no browser dialog)
- Template: first trash click → `confirmingDeleteId = item.id` (shows ✓/✗); ✓ calls `performDelete`; ✗ or click-outside cancels

**[PATTERN]** Never use `confirm()`/`alert()`/`prompt()` — blocked in many environments. Use inline state for confirmations.

---

### [WIP] #320 — Voice editing UI on member profile

Waiting for Josquin's API design. No frontend work started yet.
Branch: `feat/320-voice-editing`

---

### [CHECKPOINT] #334 — Badge removal UX (VoiceBadge + SectionBadge)

Both badge components rewritten. When `removable && onRemove && !disabled`:
- Renders as `<button>` (whole badge is click target, not just ×)
- `onclick={onRemove}` on the outer button element
- `hover:bg-purple-200` / `hover:bg-teal-200` for desktop visual feedback
- `group` on button drives × visibility
- × always visible on mobile (`opacity-100`), fades in on desktop hover (`md:opacity-0 md:group-hover:opacity-100`)

When not removable or disabled: renders as `<span>` (non-interactive, no ×).

No call-site changes needed — `removable`, `onRemove`, `disabled` props unchanged.

**[PATTERN]** Removable badge = `<button>` element wrapping the whole badge. Non-removable = `<span>`. Never put a clickable × inside a non-interactive span.

**[GOTCHA]** "Primary badge not removable" was a mobile visibility issue (opacity-0, no hover on touch) — not a code guard. Searched exhaustively: no `isPrimary` guard exists in badges, call sites, API, or DB layer.

---

### [CHECKPOINT] #322 / #334 — `confirm()` blocked in production

`confirm()`, `alert()`, `prompt()` are silently blocked (return false/undefined) in the Polyphony production environment. Always use inline state-based confirmation UI instead.

---

### [DECISION] #333 scope — voice/section remove already implemented

By the time #333 was filed, voice and section removal was already fully implemented (landed in #321/#327): DELETE endpoints exist, `MemberListCard` and `members/[id]/+page.svelte` both have `removable={isAdmin}` + `onRemove` wired for all badges. #333 was effectively a no-op.

---

### [GOTCHA] Paraglide dynamic message key access

`m[\`roles_${role}\`]()` pattern is used for role labels. This is TypeScript-unsafe but works at runtime. Svelte-check tolerates it. Don't "fix" it without a better i18n approach.

---

### [PATTERN] i18n workflow

- New i18n keys: ping Comenius with key name + English value + context
- Template references new key immediately, Comenius adds to all 4 locales (en/et/lv/uk)
- Old key removal: grep for old key in all .svelte files before removing from messages

---

### [DECISION] Invite roles — roles stored on roster member, not on invite

Roster member's `roles: Role[]` from `getMemberById` is the source of truth for display on the invite page. The invite token never carries role assignments (dead code removed in #313).
