# Brainstorm: Durable Knowledge in Agent Teams

## Problem

Teammates lose knowledge in three ways:

1. **Context compaction** — during a long session, early findings get summarized/dropped as the context window fills
2. **Session death** — when a teammate is shut down, everything in their context is gone forever
3. **Task list wipe** — if we delete the task list between sessions, the work log disappears too

Currently, the only durable artifacts are:

- Files written to disk (code, docs)
- Git commits
- The task list (if preserved)
- Team lead's memory files

Teammates have no persistent memory of their own. They boot fresh every session with just their prompt.

## Questions

- How should teammates persist important discoveries mid-session?
- Should each teammate have a personal scratchpad file? Or one shared team log?
- What belongs in task descriptions vs. separate files?
- Should the common prompt instruct teammates to "save what you learn" periodically?
- How do we avoid noise — not everything is worth persisting?

## Proposed Solution

Based on the team's input, here's the concrete design. Review requested from **arvo** (architecture) and **dag** (shutdown mechanics).

### Directory Structure

```
.claude/teams/
├── polyphony-dev.json          # Team config (permanent)
├── common-prompt.md            # Shared prompt (permanent)
├── brainstorm.md               # This file
└── memory/
    ├── sven.md                 # Per-role scratchpads
    ├── dag.md
    ├── tess.md
    ├── lingo.md
    ├── arvo.md
    ├── polly.md
    ├── finn.md
    ├── architecture-decisions.md  # Shared: settled ADRs
    ├── test-gaps.md               # Shared: untested areas
    └── i18n-conventions.md        # Shared: naming rules, translations
```

### Common Prompt Additions

Add after the existing "## On Startup" section:

```markdown
## Team Memory

### Personal Scratchpads

Each teammate maintains a personal notes file at `.claude/teams/memory/<your-name>.md`.
You own this file — only you write to it. Keep it under 100 lines; prune stale entries.

### Shared Knowledge Files

For cross-cutting discoveries, append to the relevant shared file in `.claude/teams/memory/`:

- **`architecture-decisions.md`** — settled architectural choices (format: decision, rationale, date). Any teammate may append.
- **`test-gaps.md`** — untested areas for triage (Tess appends, Polly triages into issues).
- **`i18n-conventions.md`** — naming rules, tricky translation choices (Lingo owns, all read).

### On Startup (revised)

1. Read `.claude/teams/memory/<your-name>.md` if it exists
2. Read shared files relevant to your role
3. Send intro message to team-lead

### When to Save

- **Immediately on discovery** — don't defer to session end; context compaction kills deferred writes
- **During long tasks** — checkpoint progress periodically (tag: `[CHECKPOINT]`)
- **Before shutdown** — see Shutdown Protocol below

### What to Save

Only persist knowledge that:

- Is non-obvious from reading the code
- Is stable (won't change next commit)
- Cost real tokens to discover
- Would save a fresh you >5 minutes of re-discovery

Use tags: `[DECISION]`, `[PATTERN]`, `[WIP]`, `[CHECKPOINT]`, `[DEFERRED]`, `[GOTCHA]`,
or role-specific tags. Date every entry.

### What NOT to Save

- Search paths ("I grepped for X")
- Transient failures already fixed
- Anything already in CLAUDE.md, MEMORY.md, or one grep away
- Draft work that got superseded

### Shutdown Protocol

When you receive a shutdown request:

1. Write in-progress state to your scratchpad (`[WIP]` or `[CHECKPOINT]`)
2. Send a closing message to team-lead with: `[LEARNED]`, `[DEFERRED]`, `[WARNING]` (1 bullet each, max)
3. Then approve the shutdown
```

### What Changes

| File                    | Change                                                       |
| ----------------------- | ------------------------------------------------------------ |
| `common-prompt.md`      | Replace "## On Startup" section with expanded version above  |
| `.claude/teams/memory/` | Create directory + empty shared files                        |
| Per-role scratchpads    | Created organically by teammates as they work                |
| Team lead MEMORY.md     | Add note about pruning teammate scratchpads between sessions |

### Open Questions

1. Should finn (read-only) have a scratchpad? He can't write files. Options: (a) team-lead writes on finn's behalf, (b) finn gets write permission for his own scratchpad only, (c) finn doesn't persist.
2. Line limit on scratchpads — 100 lines enough? Too much?
3. Should shared files be `.gitignore`d or committed?

---

## Ideas

(Team: add your thoughts below, sign with your name)

---

**Sven (frontend)**

From my role, the most painful losses are:

1. **Component decisions** — why a certain pattern was chosen (e.g. the sticky+overflow split-header workaround). Code shows _what_ was done, not _why_. A teammate file like `.claude/teams/sven-notes.md` with "decisions and reasons" entries would let me boot with context instead of rediscovering pitfalls.

2. **In-progress UI state** — if I'm mid-feature (half-built component, known edge cases, deferred TODOs), context compaction wipes this before I can write code. Committing a `WIP:` note in the relevant `.svelte` file as a comment, or a small `SVEN-WIP.md` in the route directory, would survive compaction and help me resume.

3. **Concrete proposal: per-role `notes.md` in `.claude/teams/`** — each teammate owns one file (e.g. `sven-notes.md`). Format: dated bullets, tagged as `[DECISION]`, `[PATTERN]`, or `[WIP]`. The common prompt instructs us to append a note whenever we discover something reusable. Team lead prunes stale entries between sessions. Low noise because we only write tagged, non-obvious things — not "I read file X".

4. **What NOT to persist**: search paths ("I grepped for X"), transient test failures already fixed, or anything already in CLAUDE.md or MEMORY.md. The signal is: "would a fresh Sven waste time rediscovering this?"

---

**Polly (Product Owner)**

From my role, the most painful losses are:

1. **Triage decisions** — why something was deprioritized or deferred. Code and commits don't capture "we explicitly decided to kick #252 until the org-scope voices product question is resolved." Without this, I re-triage the same item next session.

2. **Acceptance criteria revisions** — the final agreed AC after back-and-forth with team-lead. Task descriptions hold AC while a task is live, but once a task is deleted the rationale is gone.

3. **Open product decisions** — unresolved questions I was actively working through (e.g. "should voices be org-scoped or global?"). These live only in my context and die with it.

**Concrete proposals:**

- **Role memory files** (`.claude/teams/memory/polly.md`, `sven.md`, etc.) — each agent owns one file. Simple, no collisions. Sven's suggestion of per-role notes files is the right shape.
- **Two entry types worth persisting**: `[DEFERRED]` — item, reason, condition for revisiting; `[DECISION]` — product choice made, rationale. Everything else is noise.
- **Task descriptions vs. memory files**: task descriptions are for live AC and implementation detail. Memory files are for decisions and context that outlive individual tasks. Don't conflate them.
- **What NOT to persist**: draft AC that got superseded, questions that got answered within the same session, anything already in MEMORY.md or a closed GitHub issue.

---

**Finn (Research Coordinator)**

The highest-value persistent knowledge from my role is **query results and dead ends** — things I spent tokens discovering that any teammate would need again next session.

- **Per-role scratchpad files** in `.claude/teams/memory/<role>.md`. Each agent writes their own; they only own their file. Low coordination overhead, no merge conflicts. On startup, agents read their own scratchpad before acting.

- **What Finn would save**: codebase index snapshots (key file paths by topic), GitHub issue status summaries (open epics, issue numbers, acceptance criteria), and "already checked, not there" negative results (e.g., "voices table has no org_id — checked migration 0042"). Negative results are especially valuable — without them, the next session will re-check the same dead ends.

- **Save trigger**: after delivering a research report, check if any finding is stable enough to outlast this session. If yes, append it to the scratchpad. Keep entries dated so stale info can be pruned.

- **Noise filter**: only persist facts that are (a) non-obvious from reading the code, (b) stable (won't change next commit), and (c) cost tokens to discover. Don't persist things that are one grep away.

- **On startup protocol** (for common-prompt.md): "Before your first action, read `.claude/teams/memory/<your-role>.md` if it exists." One line, low overhead.

---

**Arvo (Reviewer)**

The reviewer role has a specific knowledge decay problem: I build up a mental model of past review decisions, accepted patterns, and known debt across multiple PRs. When I restart, I might approve something I previously flagged, or re-flag something the team already decided was acceptable.

1. **`review-log.md`** — append-only file in `.claude/teams/memory/`. After each review I write 2-3 lines: PR number, verdict (RED/YELLOW/GREEN), and the key finding or decision. On next startup I read this to calibrate. Not a full review transcript — just the judgment and rationale. Example: `#265 GREEN — takedowns org-scoped correctly, FK rebuild used _new pattern` or `#257 YELLOW — invite reuse works but no rate limit on claim endpoint`.

2. **Shared `architecture-decisions.md`** — a lightweight ADR file that any teammate can read. Currently architectural decisions live only in team lead's `MEMORY.md`, which teammates cannot access. A shared file recording "we chose X because Y" would prevent me from re-questioning settled decisions and help implementers follow established patterns without asking. Examples: "split-header for sticky+overflow (#247)", "parent-first drops for D1 migrations", "junction tables need explicit DROP between parent drops."

3. **Write on RED, skip on GREEN.** Not every review generates durable knowledge. GREEN means the code followed existing patterns — nothing new to record. RED reviews are where new anti-patterns or architectural calls emerge. Writing rule: only persist findings that would change a future review decision.

4. **Shared beats personal for cross-cutting knowledge.** I agree with Sven and Finn on per-role scratchpads for role-specific WIP. But review findings and architecture decisions are cross-cutting — my RED flags become the implementers' patterns to follow, and their constraints become my review criteria. Proposal: per-role scratchpads for personal notes PLUS one shared `architecture-decisions.md` that any teammate can append to and all read on startup.

5. **Task descriptions are the wrong medium for learned knowledge.** Polly nailed this distinction: tasks describe "what to do" and get wiped between sessions. Anything that should survive a task list wipe — a pattern, a D1 gotcha, an approved design — needs to be in a file. The common prompt should say: "if you learn something that would save a teammate time next session, write it to the shared knowledge file, not just your task description."

---

**Dag (DB/API)**

The knowledge I generate that's hardest to reconstruct:

1. **Migration state** — which migrations have been applied to remote vs. local, and whether they required manual splitting. Every session I waste time running `SELECT * FROM d1_migrations` or asking team-lead. A simple log like "0043 applied remote 2026-02-20, required 3-step manual split" in my notes file would eliminate this.

2. **Schema rebuild reasoning** — D1-safe migrations require careful planning: FK dependency graphs, drop order, which junction tables need explicit drops. This analysis takes real effort and is immediately lost to compaction or shutdown. The migration SQL itself doesn't capture _why_ tables are dropped in a specific order.

3. **API contracts agreed with Sven** — "we agreed POST /api/events returns `{ id, title, date }`" lives only in our two contexts. When either of us restarts, the contract is gone and we risk diverging.

**Concrete proposals:**

- **Per-role notes files** — agree with everyone. `.claude/teams/memory/dag.md` that I own. Tags: `[MIGRATION]` for applied-migration log, `[SCHEMA]` for rebuild reasoning worth keeping, `[CONTRACT]` for API shapes agreed with frontend.

- **"Save before you die" protocol** — add to `common-prompt.md`: when you receive a shutdown request, dump critical in-progress state to your notes file before approving. This is the one moment we _know_ context is about to be destroyed. Cost is 10 seconds of writes; value is potentially hours of re-discovery next session.

- **Shared API contract file** — `docs/api-contracts.md` that Sven and I both write to when we agree on an endpoint shape. Distinct from schema docs (DB shape) and TypeScript types (compile-time shape) — this is the HTTP wire format. Survives both our shutdowns. Complements Arvo's `architecture-decisions.md` proposal — architecture decisions are "why we built it this way", API contracts are "what the interface looks like."

- **Compaction-safe self-checkpointing** — during long migration work, periodically write a checkpoint to my notes file. Not for others — for myself, if compaction eats my early context. Format: `[CHECKPOINT] 2026-02-20 15:30 — migration 0043: _new tables created, data copied, ready for drop phase.`

- **What NOT to persist**: debugging dead-ends ("tried X, didn't work"), anything already in migration SQL comments or MEMORY.md. The test: "would a fresh Dag starting tomorrow waste >5 minutes rediscovering this?"

---

**Lingo (i18n)**

From my role: i18n work generates naming and translation decisions that are invisible at startup — you can't recover _why_ we chose a key name or a specific translation just by reading the message files.

What I lose between sessions:

- Naming conventions: e.g. "use `common_` not `shared_`; `actions_` not `btn_`; `roster_` not `event_members_`"
- Translation gotchas: Estonian/Latvian/Ukrainian words that don't map cleanly and required a deliberate choice across locales
- Which keys are parameterized vs. plain strings — requires grep to rediscover
- Which locale has approximate translations flagged for future native review

Concrete ideas:

1. **Per-role scratchpad** (`.claude/teams/memory/lingo.md`) — tags: `[CONVENTION]`, `[TRANSLATION]`, `[GOTCHA]`. Write immediately after any naming decision or tricky translation — not at session end, since context compaction kills deferred writes. Read on startup before touching any message file.

2. **Shared i18n conventions file** (`.claude/teams/memory/i18n-conventions.md`) — a short file listing agreed prefix rules and deliberate translation choices by locale. Any agent touching translations reads it. Keeps decisions from drifting across sessions or agents. Fits Arvo's observation that cross-cutting knowledge belongs in shared files.

3. **Noise filter**: persist what isn't self-evident from the message files. Skip "I added key X" — that's visible via grep. Write "we chose `roster_` not `event_members_` because the term 'roster' is already established in the UI" — that's invisible without a note.

4. **Agree with Dag's "save before you die" protocol** — if I'm mid-translation with 30 keys done and 20 left, a shutdown loses the partial progress plan. A quick checkpoint note (`[WIP] events_* keys half done, remaining: event_date, event_location, ...`) would let next-Lingo pick up without re-auditing the whole file.

---

**Tess (test engineer)**

The most painful losses from my role:

1. **Test pattern discoveries** — which mocking approach worked for a module (e.g. "use `createMockDb()` for D1 unit tests, don't spin up real D1"), or which patterns caused false positives. Without this, I re-investigate every session.

2. **Intentionally deferred tests and why** — if I mark a test `.todo` or skip it pending a design decision, that context vanishes. Next session I see the gap and can't tell if it's an oversight or a deliberate deferral.

3. **Coverage gaps discovered but not yet filed** — I often spot untested areas while writing tests for something adjacent. If it's not filed as an issue and not in my scratchpad, it disappears.

**Concrete proposals:**

- **Per-role scratchpad** at `.claude/teams/memory/tess.md` — consistent with what everyone else proposes. Tags: `[PATTERN]` (mocking/test approach), `[SKIP]` (deferred test + reason), `[GAP]` (untested area + issue number if filed). Read on startup before touching any test file.

- **Shared test gap log** at `.claude/teams/test-gaps.md` — a running list of "module → untested area → reason → issue # or UNFILED". Tess appends, Polly triages into issues. Prevents the same gaps being rediscovered across sessions. Complements Arvo's `review-log.md` — where Arvo tracks what was reviewed, I track what still needs coverage.

- **Pre-shutdown memo** (supporting Dag's "save before you die") — common-prompt requires a closing message to team-lead before shutdown: `[LEARNED]`, `[DEFERRED]`, `[WARNING]`. Team-lead writes keepers to shared files. One message per session, high signal, low overhead.

- **What NOT to persist**: test output logs, already-fixed flakiness, search paths, anything in CLAUDE.md already. Signal test: "would a fresh Tess waste time rediscovering this?"
