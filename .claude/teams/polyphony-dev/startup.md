# polyphony-dev — Startup Checklist

Paths and step-by-step startup procedure for the polyphony-dev team.

## Paths

All paths derived from two anchors:

| Anchor | How to resolve |
|---|---|
| `REPO` | `git rev-parse --show-toplevel` or the working directory |
| `TEAM_DIR` | `$HOME/.claude/teams/polyphony-dev` (runtime, ephemeral) |

| Item | Path |
|---|---|
| Repo root | `$REPO/` |
| Team config dir | `$REPO/.claude/teams/polyphony-dev/` |
| Runtime dir | `$TEAM_DIR/` |
| Roster | `$REPO/.claude/teams/polyphony-dev/roster.json` |
| Common prompt | `$REPO/.claude/teams/polyphony-dev/common-prompt.md` |
| Memory dir | `$REPO/.claude/teams/polyphony-dev/memory/` |

## Startup Sequence

Execute in order. State each phase name before executing.

### Phase 0: Orient

Read these files in order:

1. This file (`startup.md`)
2. `roster.json` (roster — team members, models, roles)
3. `common-prompt.md` (mission, standards, shutdown protocol)
4. `memory/team-lead.md` (your scratchpad — prior session state)
5. `memory/task-list-snapshot.md` (prior session's task state, if exists)

**Expected outcome:** You know the team, the mission, and where you left off.

### Phase 1: Sync

```bash
REPO="$(git rev-parse --show-toplevel)"
cd "$REPO" && git pull
```

**Expected outcome:** Prompts, roster, and memory files are at HEAD.

### Phase 2: Clean

```bash
TEAM_DIR="$HOME/.claude/teams/polyphony-dev"
if [ -d "$TEAM_DIR" ]; then
  echo "STALE DIR — will clean"
  rm -rf "$TEAM_DIR"
else
  echo "CLEAN — normal state"
fi
```

**Expected outcome:** Runtime dir does not exist. Ready for Phase 3.

### Phase 3: Create

1. `TeamCreate(team_name="polyphony-dev")`
2. Verify: `ls "$HOME/.claude/teams/polyphony-dev/config.json"`
   - YES → Phase 3 complete. Proceed to Phase 4.
   - NO → Recovery: `TeamDelete(team_name="polyphony-dev")` then `TeamCreate` again (max 1 retry).

**Expected outcome:** Fresh `config.json` with current `leadSessionId`.

**CRITICAL:** Do NOT spawn any agents until Phase 3 verification passes.

### Phase 4: Restore

```bash
TEAM_CONFIG="$(git rev-parse --show-toplevel)/.claude/teams/polyphony-dev"
TEAM_DIR="$HOME/.claude/teams/polyphony-dev"

# Restore inboxes from repo (durable copy from prior session's shutdown)
if [ -d "$TEAM_CONFIG/inboxes" ]; then
  mkdir -p "$TEAM_DIR/inboxes"
  cp -r "$TEAM_CONFIG/inboxes/"* "$TEAM_DIR/inboxes/" 2>/dev/null || true
  echo "Inboxes restored from repo."
else
  echo "No inboxes to restore (first session or never persisted). This is OK."
fi

# Verify team is operational
if [ -f "$TEAM_DIR/config.json" ] && [ -d "$TEAM_DIR/inboxes" ]; then
  echo "Team polyphony-dev operational: config.json OK, inboxes dir exists."
else
  echo "WARNING: Team infrastructure incomplete. Re-run Phase 3."
fi
```

**Expected outcome:** Inboxes restored from repo (or no-op if first session). Team operational.

### Phase 5: Spawn

Spawn order (sequential with confirmation gates):

1. **finn** (research coordinator) — wait for intro report
2. **bentham** (reviewer) — wait for intro report
3. **tallis** + **byrd** + **josquin** (parallel if working on independent issues)
4. **comenius** (only if i18n work is needed this session)
5. **victoria** (only if requirements analysis is needed this session)

**Before each spawn:** Check `config.json` for existing members with the same name.
- If agent already registered → `SendMessage` with the new task. Do NOT re-spawn.
- If agent not registered → Spawn via Agent tool with `run_in_background: true`.

**Spawn checklist per agent:**

```
1. jq '.members[].name' "$HOME/.claude/teams/polyphony-dev/config.json"  # check duplicates
2. Read prompt from roster.json entry
3. Agent(name="<name>", model="<model>", prompt="<prompt>", run_in_background: true)
4. Wait for intro message from agent
```

### Phase 6: Ready

Send ready message to user. Wait for task assignment.

---

## Known Environment Issues

- **Container environment:** This team runs inside a Docker container (Ubuntu 24.04). `$HOME=/home/ai-teams`, workspace at `/home/ai-teams/workspace`.
- **`$HOME` edge case:** If `$HOME` is empty in any shell context, re-resolve: `HOME="/home/ai-teams"`.
- **TeamCreate silent failure** — can return success but not write `config.json`. Always verify with `ls` after TeamCreate. Max 1 retry with TeamDelete before retry.
- **pnpm, not npm** — this is a pnpm workspace. All commands use `pnpm`.

(*FR:Volta*)
