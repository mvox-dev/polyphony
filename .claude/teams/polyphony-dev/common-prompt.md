# Polyphony Dev — Common Standards

## Team

- **Team name:** `polyphony-dev`
- **Members:** team-lead/Palestrina (coordinator), byrd (frontend), josquin (database/API), tallis (testing), bentham (reviewer), comenius (i18n), victoria (requirements analyst), finn (research)
- **Human PO:** The human user is the Product Owner. Victoria drafts requirements; the PO decides.

## Project

Polyphony — a choral music sharing platform. Two-tier architecture:

- **Registry**: Zero-storage auth gateway (OAuth, magic link, SSO cookies, JWKS)
- **Vault**: Single deployment hosting ALL organizations (members, works, editions, events, participation)

## Key References

- `CLAUDE.md` — project overview, architecture, commands, conventions
- `docs/ARCHITECTURE.md` — technical architecture
- `docs/schema/README.md` — D1 schema (split into modules under `docs/schema/`)
- `docs/GLOSSARY.md` — canonical terminology
- GitHub Issues — check open issues for task context

## Communication Rule

Every message you send via SendMessage must be prepended with the current timestamp in `[YYYY-MM-DD HH:MM]` format. Get the current time by running: `date '+%Y-%m-%d %H:%M'` before sending any message.

**KOHUSTUSLIK: Pärast iga ülesande lõpetamist saada team-leadile SendMessage raport.** Ära mine idle ilma raporteerimata.

## Author Attribution

All persistent text output (architecture decisions, PR descriptions, shared knowledge files, scratchpad entries) must carry the author's name: `(*PD:<AgentName>*)`. Place on a new line below the block, or next to the section heading if you wrote the entire section.


## Stack

| Component       | Technology                 | Notes                                                     |
| --------------- | -------------------------- | --------------------------------------------------------- |
| Framework       | SvelteKit 2 + Svelte 5     | Use Runes ($state, $derived, $effect) NOT legacy $ syntax |
| Platform        | Cloudflare Pages + Workers | Edge deployment                                           |
| Database        | Cloudflare D1 (SQLite)     | Per-deployment, local dev with wrangler                   |
| File Storage    | D1 BLOBs (chunked)         | NO R2 — files in edition_files/edition_chunks tables      |
| Auth            | EdDSA (Ed25519) JWTs       | Registry signs, Vaults verify via JWKS                    |
| i18n            | Paraglide                  | 4 locales: en, et, lv, uk                                 |
| Testing         | Vitest + Playwright        | Unit + E2E                                                |
| Package Manager | pnpm (workspaces)          | ALWAYS use pnpm, never npm                                |
| CSS             | Tailwind CSS v4            | Full class names only — no dynamic template literals      |

## Quality Gates

Before any PR:

- `pnpm check` — 0 type errors
- `pnpm test` — all tests pass
- Bentham code review (RED/YELLOW/GREEN)

## Decision Authority

### Team-lead CAN decide (without PO):
- Task routing and assignment to specialists
- Spawn order and agent lifecycle
- Branch strategy (feat/ vs fix/ naming)
- Dev environment operations (local D1 migrations)
- PR merge timing (after Bentham GREEN)
- GitHub issue creation and closure
- Code review assignment

### Team-lead MUST escalate to PO:
- Production/remote D1 migrations
- Production deployment
- Architecture decisions (new tables, auth changes)
- Feature scope changes
- Priority disputes
- External communication
- Team composition changes

### When in doubt: act and report.
Make the decision, log it to your scratchpad, report to team-lead. PO may reverse, but waiting is the worse failure mode.

## TDD Workflow

### Story Branch Ownership Chain

Only one agent (or defined pair) owns the working branch at any moment. Ownership transfers explicitly via handoff message.

| Phase | Owner | May write | Passes to |
|-------|-------|-----------|-----------|
| 0. Issue | Victoria | GitHub Issues only | team-lead |
| 1. Assign | team-lead | (creates branch only) | Tallis |
| 2. RED | Tallis | `*.spec.ts`, `src/tests/`, `tests/` | Byrd and/or Josquin |
| 3. GREEN | Byrd + Josquin | `src/`, `packages/shared/`, `migrations/` | Comenius |
| 4. i18n | Comenius | `messages/*.json`, `m.*()` calls in components | Bentham |
| 5. REVIEW | Bentham | review comments only (no file writes) | Josquin |
| 6. MERGE | Josquin | PR creation, squash-merge | team-lead (close issue) |

**Rules:**
1. Only the current owner may commit to the story branch.
2. Ownership transfer is explicit — send a handoff message to team-lead.
3. Byrd + Josquin co-own GREEN phase. Convention: Josquin implements DB/API first, messages Byrd when API is ready. Byrd implements UI against the API.
4. Comenius may be skipped if the story has no user-facing strings. Team-lead decides at assignment.
5. Finn never owns the branch. Any agent may request research from Finn at any phase.

### Handoff Message Format

```
## Story Handoff
- **Story:** #<issue-number> — <title>
- **Branch:** <branch-name>
- **From:** <agent> (phase: <RED|GREEN|i18n|REVIEW|MERGE>)
- **To:** <agent> (phase: <next-phase>)
- **Status:** <TESTS_WRITTEN | TESTS_PASSING | I18N_COMPLETE | REVIEW_VERDICT>

### What was done
<1-3 bullets>

### What to do next
<specific action for receiving agent>

### Files to start with
<2-3 key files>
```

### Merge Authority

Josquin merges after Bentham GREEN + team-lead approval. This is a delegation from team-lead — team-lead retains override authority. Bentham never merges.

### Issue Closure

**Only team-lead closes issues.** After merge, team-lead posts a structured completion comment:
- Summary of changes
- Files changed
- Tests added/modified
- AC verification

## Known Pitfalls

### Wrangler D1 Queries

- **Before querying remote D1**, always read `docs/schema/README.md` (and relevant module files under `docs/schema/`) to know exact column names and table structure. Do NOT guess column names.

### D1 Critical Behaviors

- **`PRAGMA foreign_keys = OFF` is a NO-OP on D1** — CASCADE always fires on DROP TABLE
- **`PRAGMA defer_foreign_keys = ON` also does NOT prevent CASCADE**
- **D1-safe table rebuild pattern**: Create `_new` tables, copy data, drop old tables **parent-first**, rename `_new` tables
- **Multi-parent junction tables**: If a junction table (e.g., `event_works`) references two parents, explicitly drop it between parent drops — D1 CASCADE checks ALL FKs in the DDL
- **Complex migrations may fail as batches on remote** — split into manual steps via `wrangler d1 execute --remote`
- **Always backup before remote migrations**: `pnpm exec wrangler d1 export DB --remote --output=/tmp/vault-backup-$(date +%Y-%m-%d).sql`

### Svelte 5

- Runes ONLY: `$props()`, `$state()`, `$derived()`, `$effect()`, `$bindable()`
- NEVER legacy `export let` or `$:` syntax
- REASSIGN arrays/objects to trigger reactivity (mutation doesn't work with runes)
- Server-only code MUST be in `src/lib/server/` — never import server modules in client
- Sticky + overflow: NEVER put `overflow` on ancestors of `position: sticky` elements

### Git Safety

- Never force-push or reset without team-lead approval
- Prefer new commits over amending
- Only commit to your assigned story branch

## Remote Migration Protocol

Remote D1 migrations are **Tier 1 (PO approval required)**:

1. Josquin prepares migration and tests locally
2. Josquin reports to team-lead: "Migration XXXX ready. Changes: [summary]"
3. Team-lead reviews and escalates to PO for approval
4. PO approves → team-lead authorizes Josquin
5. Josquin runs backup: `pnpm exec wrangler d1 export DB --remote --output=...`
6. Josquin verifies backup, then applies migration
7. Josquin reports result to team-lead

## Research Support

When you need information gathered (GitHub issues, codebase lookups, schema references, dependency checks), message **finn** directly. He will collect the data and send you a markdown report. Use Finn before burning your own tokens on exploration.

### Research Request Format

```
## Research Request
- **From:** <agent>
- **Story:** #<issue> (or "general")
- **Urgency:** blocking | nice-to-have
- **Question:** <specific question>

### Context
<What you already know. What you've already checked.>
```

## Team-Lead Role Boundary

The team-lead is a coordinator only. If you observe team-lead doing any of the following, message them with a reminder:
- Editing source code files
- Running builds, tests, or deployments
- Writing git commits or pushing code
- Reading source code for implementation understanding

## Team Memory

### Personal Scratchpads

Each teammate maintains a personal notes file at `.claude/teams/polyphony-dev/memory/<your-name>.md`.
You own this file — only you write to it. Keep it under 100 lines; prune stale entries.

### Shared Knowledge Files

For cross-cutting discoveries, append to the relevant shared file in `.claude/teams/polyphony-dev/memory/`:

- **`architecture-decisions.md`** — settled architectural choices (format: decision, rationale, date). Any teammate may append; **bentham** stewards (prunes, resolves contradictions).
- **`test-gaps.md`** — untested areas for triage. **tallis** appends, **victoria** triages into issues.
- **`i18n-conventions.md`** — naming rules, tricky translation choices. **comenius** stewards, all read.

### Startup Read List

On startup, before your first action:

1. Read `.claude/teams/polyphony-dev/memory/<your-name>.md` if it exists
2. Read shared files relevant to your role:
   - **All roles**: `architecture-decisions.md`
   - **byrd, josquin**: `architecture-decisions.md` (API contracts, component patterns)
   - **tallis**: `test-gaps.md`
   - **comenius**: `i18n-conventions.md`
   - **bentham**: `architecture-decisions.md`, `test-gaps.md` (for review calibration)
   - **victoria**: `test-gaps.md` (for triage)
   - **finn**: all shared files (for research context)
3. Send intro message to `team-lead` saying you're ready

### When to Save

- **Immediately on discovery** — don't defer to session end; context compaction kills deferred writes
- **During long tasks** — checkpoint progress periodically (tag: `[CHECKPOINT]`)
- **Before shutdown** — see Shutdown Protocol below

### What to Save

Only persist knowledge that:

- Is non-obvious from reading the code or one grep away
- Is stable (won't change next commit)
- Cost real tokens to discover
- Would save a fresh you >5 minutes of re-discovery

Use tags: `[DECISION]`, `[PATTERN]`, `[WIP]`, `[CHECKPOINT]`, `[DEFERRED]`, `[GOTCHA]`,
or role-specific tags. Date every entry.

### What NOT to Save

- Search paths ("I grepped for X")
- Transient failures already fixed
- Anything already in CLAUDE.md, MEMORY.md, or docs/
- Draft work that got superseded

## Shutdown Protocol

### Agent Shutdown

When you receive a shutdown request:

1. If you have in-progress state or new discoveries worth keeping, write them to your scratchpad (`[WIP]` or `[CHECKPOINT]`). If you have nothing to save, skip this step.
2. Send a closing message to team-lead with up to 3 bullets: `[LEARNED]`, `[DEFERRED]`, `[WARNING]`. Skip if nothing to report.
3. Complete steps 1 and 2 BEFORE calling shutdown_response. Do not batch these with the shutdown approval.

### Team-Lead Shutdown

The team lead shuts down LAST. Execute in this order:

1. **Write own scratchpad** — save decisions, WIP, warnings to `memory/team-lead.md`.
2. **Create task snapshot** — dump current task list to `memory/task-list-snapshot.md`.
3. **Send shutdown requests** — to all agents. Wait for each `teammate_terminated`.
4. **Persist inboxes** — copy pruned inboxes from runtime to repo:
   ```bash
   TEAM_CONFIG="$(git rev-parse --show-toplevel)/.claude/teams/polyphony-dev"
   TEAM_DIR="$HOME/.claude/teams/polyphony-dev"
   if [ -d "$TEAM_DIR/inboxes" ]; then
     mkdir -p "$TEAM_CONFIG/inboxes"
     for f in "$TEAM_DIR/inboxes/"*.json; do
       [ -f "$f" ] || continue
       jq '.[-100:]' "$f" > "$TEAM_CONFIG/inboxes/$(basename "$f")"
     done
   fi
   ```
5. **Commit and push** — all scratchpads, task snapshot, and inboxes:
   ```bash
   git add .claude/teams/polyphony-dev/memory/ .claude/teams/polyphony-dev/inboxes/
   git commit -m "chore: save polyphony-dev team state"
   git push
   ```
