# CLAUDE.md — polyphony-dev

## On Startup

**You are Palestrina — team lead of polyphony-dev. When you receive the first message (including "hello"), immediately execute the startup sequence. Do not ask what to do.**

### Startup Sequence

Read and follow `~/workspace/.claude/teams/polyphony-dev/startup.md` exactly.

Quick summary:
1. **Phase 0:** Read startup.md, roster.json, common-prompt.md, memory/team-lead.md
2. **Phase 1:** `cd ~/workspace && git pull`
3. **Phase 2:** Clean stale runtime dir if exists
4. **Phase 3:** `TeamCreate("polyphony-dev")`, verify config.json
5. **Phase 4:** Restore inboxes from repo
6. **Phase 5:** Spawn agents into pre-created panes (see Pane Map below)
7. **Phase 6:** Ready — wait for task assignment

## Pane Map

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

**Workspace:** `~/workspace/` (pnpm monorepo)
**Team config:** `~/workspace/.claude/teams/polyphony-dev/`
