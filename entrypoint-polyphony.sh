#!/usr/bin/env bash
# entrypoint-polyphony.sh (*FR:Brunel*)
#
# Runs as root. Prepares the polyphony-dev container before handing off to ai-teams.
#
# Steps:
#  0.   Fix hostname resolution (network_mode: host only — skip for bridge/default)
#  0b.  WARP TLS CA → system CA store (no-op if /opt/warp-ca.pem not mounted)
#  1.   Fix volume ownership (Docker creates named volumes as root)
#  2.   Validate required env vars
#  3.   Clone/pull polyphony repo
#  4.   pnpm install (first run or after lockfile change)
#  5.   Runtime validation gates
#  6.   Persist env vars to .bashrc (covers SSH / interactive shells)
#  6b.  tmux config + auto-tmux on SSH login
#  6c.  Git attribution
#  7.   Claude settings.json (first run only)
#  7b.  SSH key install + start sshd on port 2223
#  8.   Drop privileges and exec
#
# Required env vars:
#   GITHUB_TOKEN      — PAT with read access to mitselek/polyphony
#   ANTHROPIC_API_KEY — Claude Code CLI (or OAuth credentials in ~/.claude volume)
#
# Optional env vars:
#   REPO_URL          — repo URL (default: github.com/mitselek/polyphony.git)
#   TEAM_NAME         — team name (default: polyphony-dev)
#   NODE_EXTRA_CA_CERTS — path to WARP CA cert (set in compose on WARP hosts)
#   SSH_PUBLIC_KEY    — public key for ai-teams SSH access (port 2223)
#   SSH_PUBLIC_KEY_2  — additional key (supports SSH_PUBLIC_KEY_N pattern)
set -e

CONTAINER_USER="ai-teams"
CONTAINER_UID="1000"
CONTAINER_GID="1000"
HOME_DIR="/home/ai-teams"
CLAUDE_DIR="${HOME_DIR}/.claude"
WORKSPACE="${HOME_DIR}/workspace"

REPO_URL="${REPO_URL:-https://github.com/mitselek/polyphony.git}"

# ── Helpers ───────────────────────────────────────────────────────────────────

clone_or_pull() {
    local repo_url="$1"
    local target_dir="$2"
    local auth_url

    auth_url=$(echo "$repo_url" | sed "s|https://|https://${GITHUB_TOKEN}@|")

    if [ -d "${target_dir}/.git" ]; then
        echo "[entrypoint] ${target_dir} exists — running git pull..."
        gosu "${CONTAINER_USER}" git -C "${target_dir}" remote set-url origin "${auth_url}"
        gosu "${CONTAINER_USER}" git -C "${target_dir}" pull --ff-only || {
            echo "[entrypoint] WARNING: git pull failed (non-fast-forward or network). Using existing state."
        }
    else
        echo "[entrypoint] First run — cloning ${repo_url} to ${target_dir}..."
        mkdir -p "${target_dir}"
        chown "${CONTAINER_UID}:${CONTAINER_GID}" "${target_dir}"
        gosu "${CONTAINER_USER}" git clone "${auth_url}" "${target_dir}"
    fi
}

# ── Step 0: Fix hostname resolution ───────────────────────────────────────────
# Only relevant when network_mode: host. On default bridge networking this is
# a no-op (Docker manages /etc/hosts). Safe to run in either case.
if ! grep -q 'polyphony-dev' /etc/hosts 2>/dev/null; then
    echo "127.0.0.1 polyphony-dev" >> /etc/hosts
fi

# ── Step 0b: WARP TLS CA ──────────────────────────────────────────────────────
# If WARP CA cert is bind-mounted, add it to the system CA store so curl, pip,
# and git trust HTTPS through the WARP proxy.
# Node.js uses NODE_EXTRA_CA_CERTS (set in docker-compose) instead of system store.
# Not mounted on local dev — this step is a no-op in that case.
WARP_CA="/opt/warp-ca.pem"
if [ -f "$WARP_CA" ]; then
    cp "$WARP_CA" /usr/local/share/ca-certificates/warp-ca.crt
    update-ca-certificates --fresh > /dev/null 2>&1
    echo "[entrypoint] WARP CA added to system CA store."
fi

# ── Step 1: Fix volume ownership ──────────────────────────────────────────────
# Docker creates named volumes owned by root. Fix on every start (idempotent).
for DIR in "$CLAUDE_DIR" "$WORKSPACE"; do
    if [ -d "$DIR" ]; then
        OWNER=$(stat -c '%u' "$DIR")
        if [ "$OWNER" = "0" ]; then
            chown "${CONTAINER_UID}:${CONTAINER_GID}" "$DIR"
        fi
    else
        mkdir -p "$DIR"
        chown "${CONTAINER_UID}:${CONTAINER_GID}" "$DIR"
    fi
done

# ── Step 2: Validate required env vars ────────────────────────────────────────
if [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "ERROR: GITHUB_TOKEN is not set." >&2
    exit 1
fi

# ── Step 3: Clone/pull polyphony repo ─────────────────────────────────────────
clone_or_pull "$REPO_URL" "$WORKSPACE"

# ── Step 4: pnpm install ──────────────────────────────────────────────────────
# Run pnpm install after every clone/pull to ensure node_modules match lockfile.
# pnpm uses a content-addressable store inside the volume — subsequent installs
# are fast (hardlinks, not downloads) even after container restart.
#
# --frozen-lockfile: fail if pnpm-lock.yaml is out of date (enforces discipline).
# Remove --frozen-lockfile if the team needs to update deps inside the container.
#
# node_modules live inside the polyphony-repo volume, not on the host filesystem.
# This is intentional — avoids host/container platform mismatch (native .node files).
echo "[entrypoint] Running pnpm install..."
gosu "${CONTAINER_USER}" pnpm --dir "${WORKSPACE}" install --frozen-lockfile 2>&1 | tail -5
echo "[entrypoint] pnpm install complete."

# ── Step 5: Runtime validation gates ──────────────────────────────────────────
echo "[entrypoint] Runtime validation:"

# Node.js version check (hard gate: 20+)
NODE_VERSION=$(node --version 2>&1 | grep -oP '\d+' | head -1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "  FAIL: Node.js v${NODE_VERSION} < 20 — aborting." >&2
    exit 1
fi
echo "  OK: Node.js v${NODE_VERSION}"

# pnpm check
if ! command -v pnpm >/dev/null 2>&1; then
    echo "  FAIL: pnpm not found — aborting." >&2
    exit 1
fi
PNPM_VERSION=$(pnpm --version 2>&1)
echo "  OK: pnpm ${PNPM_VERSION}"

# wrangler check (dev dependency — available via pnpm exec)
if gosu "${CONTAINER_USER}" pnpm --dir "${WORKSPACE}" exec wrangler --version >/dev/null 2>&1; then
    WRANGLER_VERSION=$(gosu "${CONTAINER_USER}" pnpm --dir "${WORKSPACE}" exec wrangler --version 2>&1)
    echo "  OK: wrangler ${WRANGLER_VERSION}"
else
    echo "  WARN: wrangler not available via pnpm exec — check devDependencies."
fi

# Claude check
if ! command -v claude >/dev/null 2>&1; then
    # Also check ~/.local/bin (native install path)
    if [ -f "${HOME_DIR}/.local/bin/claude" ]; then
        echo "  OK: claude (native install at ~/.local/bin/claude)"
    else
        echo "  WARN: claude not found in PATH. OAuth credentials may still be in volume."
    fi
else
    echo "  OK: claude available"
fi

# Repo check
if [ -d "${WORKSPACE}/.git" ]; then
    echo "  OK: polyphony repo"
else
    echo "  FAIL: workspace has no .git — aborting." >&2
    exit 1
fi

# node_modules check
if [ -d "${WORKSPACE}/node_modules" ]; then
    echo "  OK: node_modules present"
else
    echo "  WARN: node_modules missing — pnpm install may have failed."
fi

echo "[entrypoint] All gates passed. Starting..."

# ── Step 6: Persist env vars to .bashrc ───────────────────────────────────────
# Compose env vars don't propagate to interactive bash sessions.
# Write current values to .bashrc so ai-teams has them in every shell.
# Uses sed -i delete+append to avoid duplicates on container restart.
BASHRC="${HOME_DIR}/.bashrc"

declare -A SHELL_VARS=(
    [HOME]="/home/ai-teams"
    [TZ]="Europe/Tallinn"
    [CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS]="${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-1}"
    [GITHUB_TOKEN]="${GITHUB_TOKEN}"
    [TEAM_NAME]="${TEAM_NAME:-polyphony-dev}"
    [PLAYWRIGHT_BROWSERS_PATH]="/opt/playwright/cache"
    [LANG]="en_US.UTF-8"
    [LC_ALL]="en_US.UTF-8"
)

# Add NODE_EXTRA_CA_CERTS only if set (not needed on local dev without WARP)
if [ -n "${NODE_EXTRA_CA_CERTS:-}" ]; then
    SHELL_VARS[NODE_EXTRA_CA_CERTS]="${NODE_EXTRA_CA_CERTS}"
fi

# PATH for native Claude install (~/.local/bin)
if ! grep -q '\.local/bin' "$BASHRC" 2>/dev/null; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$BASHRC"
fi

for var in "${!SHELL_VARS[@]}"; do
    val="${SHELL_VARS[$var]}"
    if [ -n "$val" ]; then
        sed -i "/^export ${var}=/d" "$BASHRC"
        echo "export ${var}=${val}" >> "$BASHRC"
    fi
done

# ── Step 6b: tmux config + auto-tmux on SSH login ────────────────────────────
# Write .tmux.conf for Unicode rendering and usability.
# Recreate on every start (container filesystem, not in volume).
cat > "${HOME_DIR}/.tmux.conf" << 'TMUX_EOF'
set -g default-terminal "tmux-256color"
set -gq utf8 on
set -gq status-utf8 on
set -g mouse on
set -g history-limit 50000
set -g status-interval 5
TMUX_EOF
chown "${CONTAINER_UID}:${CONTAINER_GID}" "${HOME_DIR}/.tmux.conf"

# Auto-tmux + auto-cd on SSH login: attach to existing session or create new one.
# Only triggers for interactive SSH sessions (not for docker exec or entrypoint itself).
# Guard: skip if already inside tmux ($TMUX is set) or not an interactive shell.
if ! grep -q 'auto-tmux' "$BASHRC" 2>/dev/null; then
    cat >> "$BASHRC" << 'AUTOTMUX_EOF'

# auto-tmux: attach or create session on SSH login
if [ -z "$TMUX" ] && [ -n "$SSH_CONNECTION" ]; then
    cd /home/ai-teams/workspace
    exec tmux -u new-session -A -s polyphony
fi
AUTOTMUX_EOF
fi

# ── Step 6c: Git attribution ──────────────────────────────────────────────────
gosu "${CONTAINER_USER}" git config --global user.name "polyphony-dev"
gosu "${CONTAINER_USER}" git config --global user.email "${GIT_USER_EMAIL:-mihkel.putrinsh@evr.ee}"

# ── Step 7: Claude settings.json (first run only) ─────────────────────────────
# Pre-configure permissions. Don't overwrite if file exists — PO may have customized.
SETTINGS_FILE="${CLAUDE_DIR}/settings.json"
if [ ! -f "$SETTINGS_FILE" ]; then
    cat > "$SETTINGS_FILE" << 'SETTINGS_EOF'
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "permissions": {
    "defaultMode": "default"
  },
  "includeCoAuthoredBy": false
}
SETTINGS_EOF
    chown "${CONTAINER_UID}:${CONTAINER_GID}" "$SETTINGS_FILE"
    echo "[entrypoint] Claude settings.json created."
fi

# ── Step 7b: SSH setup ────────────────────────────────────────────────────────
# Collect all SSH_PUBLIC_KEY* env vars into authorized_keys for ai-teams.
# Supports SSH_PUBLIC_KEY, SSH_PUBLIC_KEY_2, SSH_PUBLIC_KEY_3, etc.
KEY_COUNT=0
KEYS=""
for var in $(env | grep '^SSH_PUBLIC_KEY' | sort | cut -d= -f1); do
    val="${!var}"
    if [ -n "$val" ]; then
        KEYS="${KEYS}${val}\n"
        KEY_COUNT=$((KEY_COUNT + 1))
    fi
done

if [ "$KEY_COUNT" -gt 0 ]; then
    mkdir -p "${HOME_DIR}/.ssh"
    printf "%b" "$KEYS" > "${HOME_DIR}/.ssh/authorized_keys"
    chmod 700 "${HOME_DIR}/.ssh"
    chmod 600 "${HOME_DIR}/.ssh/authorized_keys"
    chown -R "${CONTAINER_UID}:${CONTAINER_GID}" "${HOME_DIR}/.ssh"
    echo "[entrypoint] ${KEY_COUNT} SSH public key(s) installed for ${CONTAINER_USER}."

    # Start sshd in background on port 2223 (2222 taken by apex-research).
    # /run/sshd must exist (created in Dockerfile).
    /usr/sbin/sshd -p 2223
    echo "[entrypoint] sshd started on port 2223."
else
    echo "[entrypoint] WARNING: No SSH_PUBLIC_KEY* vars set — SSH access disabled."
fi

# ── Step 8: Drop privileges and exec ──────────────────────────────────────────
exec gosu "${CONTAINER_USER}" "$@"
