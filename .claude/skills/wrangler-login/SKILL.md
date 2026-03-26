---
name: wrangler-login
description: >
  Authenticate Cloudflare Wrangler in headless/remote environments where no browser is available.
  Use this skill whenever the user needs to run wrangler commands and wrangler is not authenticated,
  or when the user says "wrangler login", "authenticate wrangler", "cloudflare auth", or encounters
  "You are not authenticated" errors from wrangler. Also use when setting up a new development
  environment that needs Cloudflare access (D1, Pages, Workers deployments).
---

# Wrangler Headless Login

Wrangler's `login` command starts a local OAuth server on `localhost:8976` and tries to open a browser.
In headless environments (remote servers, containers, CI) there's no browser — but the OAuth flow
can still complete if the user opens the URL on their own machine and relays the callback URL back.

## Step 1: Check Current Auth

```bash
pnpm exec wrangler whoami 2>&1
```

If already authenticated, report the account and stop — no action needed.

## Step 2: Kill Stale Listeners

Previous failed login attempts may leave a process bound to port 8976. Clear it before starting:

```bash
fuser -k 8976/tcp 2>/dev/null; sleep 1
```

If `fuser` isn't available, try `lsof -ti :8976 | xargs kill -9 2>/dev/null`.
If neither tool exists, proceed anyway — wrangler will error with `EADDRINUSE` and you can retry.

## Step 3: Start Wrangler Login in Background

```bash
pnpm exec wrangler login 2>&1
```

Run this as a **background task** with a generous timeout (5 minutes / 300000ms).
Wrangler will print an OAuth URL and start listening on `localhost:8976` for the callback.

## Step 4: Extract the OAuth URL

Wait 2-3 seconds, then read the background task output. Look for the line starting with
`Opening a link in your default browser:` — the URL follows.

Each login attempt generates **unique** `state` and `code_challenge` parameters.
Old URLs from previous attempts will not work. Always use the freshest URL.

Check for errors:
- `EADDRINUSE` on port 8976 → go back to Step 2, kill the stale process, retry
- `Timed out waiting for authorization code` → the background task expired, restart from Step 3

## Step 5: Present URL to User

Tell the user:

> Open this URL in your browser:
>
> `<the OAuth URL>`
>
> After you authorize on Cloudflare, your browser will try to redirect to `localhost:8976`
> which will fail to load. That's expected. Copy the **full URL** from your browser's address
> bar (it will look like `http://localhost:8976/oauth/callback?code=...&state=...`) and paste
> it here.

If Cloudflare returns a 404 on the OAuth URL, wrangler may be too old. Check version with
`pnpm exec wrangler --version` and suggest updating if it's significantly behind.

## Step 6: Replay the Callback

When the user pastes the callback URL, replay it against the local wrangler listener:

```bash
curl -s "<the full callback URL the user pasted>" 2>&1
```

This delivers the authorization code to wrangler's local server, completing the OAuth exchange.

## Step 7: Verify

Check the background task output — it should now show `Successfully logged in.`

Confirm with:

```bash
pnpm exec wrangler whoami 2>&1
```

This should show the account name, account ID, and token permissions.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `EADDRINUSE` on port 8976 | Stale process from previous attempt | `fuser -k 8976/tcp` then retry |
| OAuth URL returns Cloudflare 404 | Wrangler version too old | Update wrangler: `pnpm update wrangler --recursive` |
| `Timed out waiting for authorization code` | User took too long | Restart from Step 3 — new URL needed |
| curl to callback returns nothing | Normal — wrangler consumes the response | Check background task output for "Successfully logged in" |
| State mismatch error | Used URL from a previous attempt | Each attempt has unique state/challenge — use the latest URL |

## Alternative: API Token

If the OAuth flow repeatedly fails, the user can create an API token instead:

1. Go to `https://dash.cloudflare.com/profile/api-tokens`
2. Create Token → "Edit Cloudflare Workers" template (or custom with D1/Pages/Workers permissions)
3. Set the environment variable: `export CLOUDFLARE_API_TOKEN="<token>"`
4. Verify with `pnpm exec wrangler whoami`
