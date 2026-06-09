# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

Clubero is a TanStack Start (React 19 + Vite 7) sports-club management SaaS app. The backend is **hosted Supabase** (Auth + Postgres + RLS). There is no local Docker stack — copy `.env.example` to `.env` and fill in Supabase keys (a `.env` with Supabase credentials is usually pre-provisioned in Cloud Agent VMs).

### Package manager

Use **Bun** (`bun.lock`, `bunfig.toml`). Do not use npm/pnpm unless explicitly asked.

```bash
export PATH="$HOME/.bun/bin:$PATH"   # if bun is not on PATH yet
bun install
```

### Running the dev server

```bash
bun run dev
```

- The Lovable Vite config binds to **port 8080** (not Vite's default 5173). Use `http://localhost:8080/`.
- Use a **tmux** session for long-running dev servers (see cloud agent shell instructions).
- Marketing site is at `/`; on the app host, unauthenticated users are redirected to `/login`.

### Lint / test / build

| Command | Notes |
|---------|-------|
| `bun run lint` | ESLint — may report many pre-existing issues in the repo |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run test` | Unit tests (Vitest, no external deps) — 305 tests |
| `bun run test:rls` | Requires remote Supabase + `SUPABASE_SERVICE_ROLE_KEY` |
| `bun run test:e2e` | Requires `E2E_BASE_URL`, pre-seeded E2E users in Supabase, Playwright Chromium |
| `bun run build` | Production build (~30s); needs `NODE_OPTIONS=--max-old-space-size=8192` (set in script) |

Install Playwright browsers before E2E: `bunx playwright install --with-deps chromium`.

### E2E prerequisites

E2E credentials (`E2E_ADMIN_EMAIL`, etc.) and a seeded "E2E Test Club" are **not** in `.env.example`. See `tests/e2e/_fixtures/README.md` and `docs/dev/e2e.md`.

### Optional server secrets

Features like marketing AI chat (`/api/public/marketing-chat`) need `LOVABLE_API_KEY`. Stripe, email, and cron hooks need their respective secrets from `.env.example`. Core UI and Supabase-backed pages work with only the Supabase vars.

### Deploy target

Production deploys to **Cloudflare Workers** via `wrangler.jsonc`. Local dev uses Vite SSR; no Wrangler dev server is required for normal development.
