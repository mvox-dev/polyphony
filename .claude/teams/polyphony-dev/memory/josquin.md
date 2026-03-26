# Josquin Scratchpad

## Session 2026-03-19

[GOTCHA] 2026-03-19 — `gh pr merge --squash --delete-branch` throws `fatal: 'origin/main' is not a commit` in this environment because local `main` branch doesn't exist (only `master` tracking remote `main`). The merge succeeds on GitHub despite the local error — always verify with `gh pr view <N> --json state`. (*PD:Josquin*)

[GOTCHA] 2026-03-19 — #289 dead file deletion blocked: `apps/vault/src/lib/server/db/permissions.ts` has active imports from takedowns routes (`+server.ts` × 2) and test files (× 3). Uses old single-role API (`getMemberRole`, `isAdminRole`). Needs migration story to move takedowns to multi-role `auth/permissions.ts`. (*PD:Josquin*)

[PATTERN] 2026-03-19 — Paraglide `src/lib/paraglide/` is gitignored. Tests that transitively import paraglide modules fail in clean checkouts. Fixed in #291 (PR #300) with resolve aliases in `vite.config.ts` using array format — specific aliases MUST come before general `$lib` alias. (*PD:Josquin*)

[CHECKPOINT] 2026-03-19 — Merged PRs this session: #295 (JWT expiry tests), #297 (return_to redirect guard), #298 (middleware assertions), #299 (seasons API tests), #300 (paraglide test infra). (*PD:Josquin*)
