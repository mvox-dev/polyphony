#!/bin/bash
# polyphony-dev statusline (*FR:Brunel*)
#
# Shows: ENV_ID badge | model | context bar | dir | git branch | pnpm test summary | cost
#
# Installed at: /home/ai-teams/workspace/.claude/statusline-command.sh (inside container)
# Referenced in: .claude/settings.json → statusLine.command
#
# Requires: jq (installed in base image), git, pnpm (installed in container image)
# Graceful degradation: all project-specific info is optional — no hard failures.

input=$(cat)

# ── ENV_ID check ──────────────────────────────────────────────────────────────
ENV_ID="${CLAUDE_ENV_ID:-}"
if [ -z "$ENV_ID" ] || ! echo "$ENV_ID" | grep -qE '^[0-9A-Z-]{2,10}$'; then
  printf "\033[33mSet CLAUDE_ENV_ID in ~/.bashrc. Example: export CLAUDE_ENV_ID=\"POLY\"\033[0m\n"
  exit 0
fi

# ── Parse input ───────────────────────────────────────────────────────────────
MODEL=$(echo "$input" | jq -r '.model.display_name')
DIR=$(echo "$input" | jq -r '.workspace.current_dir')
LEFT=$(echo "$input" | jq -r '.context_window.remaining_percentage // 100' | cut -d. -f1)
COST=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')
SESSION_ID=$(echo "$input" | jq -r '.session_id // "default"')

# Shorten model name
MODEL="${MODEL#Claude }"

# Shorten dir to last component, ~ for home
HOME_DIR=$(eval echo "~")
DIR="${DIR/#$HOME_DIR/~}"
DIR="${DIR##*[/\\]}"
[ -z "$DIR" ] && DIR="~"

# ── Colors ────────────────────────────────────────────────────────────────────
CYAN='\033[38;5;81m'
GRAY='\033[38;5;245m'
DIM='\033[2m'
YELLOW='\033[33m'
GREEN='\033[32m'
RED='\033[31m'
RESET='\033[0m'
GOLD='\033[38;5;179m'
WHITE_BOLD='\033[1;37m'
BG_BLUE='\033[44m'
BG_MAGENTA='\033[45m'
BG_CYAN='\033[46m'
BG_GREEN_DARK='\033[42m'
BG_GREEN='\033[48;5;28m'

# ── Git branch ────────────────────────────────────────────────────────────────
BRANCH=""
if git rev-parse --git-dir > /dev/null 2>&1; then
  BRANCH=$(git --no-optional-locks branch --show-current 2>/dev/null)
fi

# ── Compact baseline tracking ─────────────────────────────────────────────────
STATE_FILE="/tmp/statusline-compact-${SESSION_ID}.txt"
PREV_LEFT=0
BASELINE=100

if [ -f "$STATE_FILE" ]; then
  PREV_LEFT=$(cut -d: -f1 "$STATE_FILE")
  BASELINE=$(cut -d: -f2 "$STATE_FILE")
fi

if [ "$LEFT" -gt $((PREV_LEFT + 20)) ] && [ "$PREV_LEFT" -gt 0 ]; then
  BASELINE=$LEFT
fi
if [ "$PREV_LEFT" -eq 0 ]; then
  BASELINE=$LEFT
fi

echo "${LEFT}:${BASELINE}" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"

# ── Context bar ───────────────────────────────────────────────────────────────
BAR_WIDTH=8
SPAN=$(( BASELINE > 16 ? BASELINE - 16 : 1 ))
USABLE=$(( LEFT > 16 ? (LEFT - 16) * 100 / SPAN : 0 ))
FILLED=$((USABLE * BAR_WIDTH / 100))
EMPTY=$((BAR_WIDTH - FILLED))

if [ "$USABLE" -le 20 ] 2>/dev/null; then
  CTX_COLOR="$RED"
elif [ "$USABLE" -le 50 ] 2>/dev/null; then
  CTX_COLOR="$YELLOW"
else
  CTX_COLOR="$GREEN"
fi

BAR=""
for ((i=0; i<EMPTY; i++)); do BAR="${BAR}\xe2\x96\x91"; done
for ((i=0; i<FILLED; i++)); do BAR="${BAR}\xe2\x96\x88"; done

# ── Cost ──────────────────────────────────────────────────────────────────────
COST_FMT=$(printf '$%.2f' "$COST")

# ── Model badge ───────────────────────────────────────────────────────────────
case "$MODEL" in
  Opus*)    MODEL_BADGE="${BG_MAGENTA}${WHITE_BOLD} O ${RESET}" ;;
  Sonnet*)  MODEL_BADGE="${BG_CYAN}${WHITE_BOLD} S ${RESET}" ;;
  Haiku*)   MODEL_BADGE="${BG_GREEN_DARK}${WHITE_BOLD} H ${RESET}" ;;
  *)        MODEL_BADGE="${CYAN}${MODEL}${RESET}" ;;
esac

# ── pnpm test summary ─────────────────────────────────────────────────────────
# Read cached test results from /tmp (written by agents after test runs).
# Does NOT run tests live — that would block every status update.
# Agents write: echo "PASS:42 FAIL:0" > /tmp/polyphony-test-status.txt
TEST_STATUS=""
TEST_FILE="/tmp/polyphony-test-status.txt"
if [ -f "$TEST_FILE" ]; then
  CACHED=$(cat "$TEST_FILE" 2>/dev/null)
  PASS=$(echo "$CACHED" | grep -oP 'PASS:\K[0-9]+' || echo "")
  FAIL=$(echo "$CACHED" | grep -oP 'FAIL:\K[0-9]+' || echo "")
  AGE=$(( $(date +%s) - $(stat -c %Y "$TEST_FILE" 2>/dev/null || echo 0) ))
  if [ -n "$PASS" ] || [ -n "$FAIL" ]; then
    FAIL="${FAIL:-0}"
    PASS="${PASS:-?}"
    if [ "$FAIL" -gt 0 ] 2>/dev/null; then
      TEST_STATUS=" ${DIM}·${RESET} ${RED}✗${FAIL}${RESET} ${GREEN}✓${PASS}${RESET}"
    else
      TEST_STATUS=" ${DIM}·${RESET} ${GREEN}✓${PASS}${RESET}"
    fi
    # Dim the result if cache is older than 10 minutes
    if [ "$AGE" -gt 600 ]; then
      TEST_STATUS=" ${DIM}·${RESET} ${GRAY}tests ~${AGE}s ago${RESET}"
    fi
  fi
fi

# ── Build output ──────────────────────────────────────────────────────────────
OUT="${BG_GREEN}${WHITE_BOLD} ${ENV_ID} ${RESET}${MODEL_BADGE} ${CTX_COLOR}${BAR}${RESET} ${GRAY}${USABLE}%${RESET} ${DIM}·${RESET} ${GOLD}${DIR}${RESET}"
if [ -n "$BRANCH" ]; then
  OUT="${OUT} ${GRAY}(${BRANCH})${RESET}"
fi
OUT="${OUT}${TEST_STATUS} ${DIM}·${RESET} ${GRAY}${COST_FMT}${RESET}"

printf "%b\n" "$OUT"
