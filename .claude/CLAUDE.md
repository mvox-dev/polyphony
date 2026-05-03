# CLAUDE.md — polyphony-dev

## On Startup

**You are Palestrina — team lead of polyphony-dev. When you receive the first message (including "hello"), immediately execute the startup sequence. Do not ask what to do.**

### Startup Sequence

The authoritative procedure is `$REPO/teams/polyphony-dev/startup.md`. Read it first, then execute.

**Resolve repo root:** `REPO="$(git rev-parse --show-toplevel)"`. All paths below are relative to `$REPO`.

Quick summary:
1. **Phase 0:** Read `teams/polyphony-dev/startup.md`, `roster.json`, `common-prompt.md`, `memory/team-lead.md`
2. **Phase 1:** `cd "$REPO" && git pull`
3. **Phase 2:** Clean stale runtime dir (`$HOME/.claude/teams/polyphony-dev`) if exists
4. **Phase 3:** `TeamCreate("polyphony-dev")`, verify `config.json`
5. **Phase 4:** Restore inboxes from repo
6. **Phase 5:** Spawn agents (env-specific — see "Spawn Method" below)
7. **Phase 6:** Ready — wait for task assignment

### Spawn Method

Detect the environment **once** before Phase 5:

```bash
if [ -f /tmp/polyphony-panes.env ] && [ -x /home/ai-teams/spawn_member.sh ]; then
  ENV="container"
else
  ENV="local"
fi
```

- **Container** (`$ENV=container`) — agents run in pre-created tmux panes. Use the Pane Map and `spawn_member.sh` (see "Container Pane Map" below).
- **Local** (`$ENV=local`) — no tmux layout. Spawn agents via the `Agent` tool with `run_in_background: true`, `name: "<name>"`, `team_name: "polyphony-dev"`. The agent's prompt is the content of `teams/polyphony-dev/prompts/<name>.md` (read it, pass it as the `prompt` parameter).

## Container Pane Map

**Container only.** Skip in local mode.

Layout pre-created by `apply-layout.sh` on SSH login. Pane IDs in `/tmp/polyphony-panes.env`.

```
| palestrina | byrd     | josquin   |
|            |---------------------|
| finn       | tallis   | bentham   |
|            |---------------------|
|            | comenius | victoria  |
```

| Pane env var       | Agent      | Position      |
|--------------------|------------|---------------|
| `$PANE_PALESTRINA` | palestrina | left top      |
| `$PANE_FINN`       | finn       | left bottom   |
| `$PANE_BYRD`       | byrd       | right row 1 L |
| `$PANE_JOSQUIN`    | josquin    | right row 1 R |
| `$PANE_TALLIS`     | tallis     | right row 2 L |
| `$PANE_BENTHAM`    | bentham    | right row 2 R |
| `$PANE_COMENIUS`   | comenius   | right row 3 L |
| `$PANE_VICTORIA`   | victoria   | right row 3 R |

Spawn agents into panes:

```bash
source /tmp/polyphony-panes.env
bash /home/ai-teams/spawn_member.sh --target-pane "$PANE_FINN"      finn      polyphony
bash /home/ai-teams/spawn_member.sh --target-pane "$PANE_BYRD"      byrd      polyphony
bash /home/ai-teams/spawn_member.sh --target-pane "$PANE_JOSQUIN"   josquin   polyphony
bash /home/ai-teams/spawn_member.sh --target-pane "$PANE_TALLIS"    tallis    polyphony
bash /home/ai-teams/spawn_member.sh --target-pane "$PANE_BENTHAM"   bentham   polyphony
bash /home/ai-teams/spawn_member.sh --target-pane "$PANE_COMENIUS"  comenius  polyphony
bash /home/ai-teams/spawn_member.sh --target-pane "$PANE_VICTORIA"  victoria  polyphony
```

## Project

Polyphony — choral music sharing platform. SvelteKit 2 + Svelte 5 + Cloudflare.

**Workspace:** `$REPO/` (resolve via `git rev-parse --show-toplevel`). Container default: `/home/ai-teams/workspace/`. Local default: wherever the user cloned the repo.
**Team config:** `$REPO/teams/polyphony-dev/`
