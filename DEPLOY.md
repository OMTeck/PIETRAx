# Deploying PIETRAx

PIETRAx is a full-stack application: an Express + Prisma API (`server/`) that also serves the built Vite SPA (`dist/`), backed by PostgreSQL. This repository ships a **Render Blueprint** (`render.yaml`) so the whole thing deploys from GitHub with one click.

> GitHub Pages cannot run this project - it needs a Node server, a database and persistent disk for uploads.

## Architecture (production)

| Part | What runs it |
| --- | --- |
| SPA + API + `/uploads` | one Node process: `node server/dist/index.js` |
| Sessions/CSRF/flash | stored in Postgres tables (no external store needed) |
| Uploaded images | persistent Render Disk mounted at `server/uploads` |
| Schema + initial data | executed on every deploy by `preDeployCommand` (`prisma db push` + conditional seed) |

## Prerequisites

1. This repository on GitHub (done).
2. A free PostgreSQL database. Recommended: <https://neon.tech> (or Supabase). Create a database and copy its **connection string** (`postgresql://user:password@host/dbname?...`). Keep it private.

## Deploy on Render (from GitHub)

1. Go to <https://dashboard.render.com> and click **New → Blueprint**.
2. Pick this repository (grant Render access to your GitHub account if prompted).
3. Render pre-fills `render.yaml`. In the form, fill the fields marked **manual**:
   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | your Neon/Supabase connection string |
   | `SEED_ADMIN_EMAIL` | the owner admin login (e.g. `admin@yoursite.com`) |
   | `SEED_ADMIN_PASSWORD` | a strong password (≥ 8 chars) for that admin |
4. `SESSION_SECRET` and `CSRF_SECRET` are generated automatically and persisted for you.
5. Click **Apply**. First deploy runs, in order:
   - `npm ci` (root + server), `prisma generate`, client build (`dist/`), server build (`server/dist/`)
   - `preDeploy`: `prisma db push` (creates tables) → conditional seed (only when no admin exists yet)
   - service starts and passes the `/health` check
6. When the deploy shows **Live**, open `https://<your-service>.onrender.com`.

## After first deploy

- Public site is live; admin dashboard is at `https://<your-service>.onrender.com/admin`.
- Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, then change the password and **enable TOTP MFA** for the owner account.
- The seed also loads taxonomy, 16 materials, 6 collections, 6 projects, visualizer rooms and site settings, and is skipped automatically on later deploys once an admin exists.
- Seed data images come from Pexels (remote HTTPS URLs) - allowed by the server CSP.

## Pushing updates

`autoDeploy: true` means every push to `main` triggers a fresh build + deploy (schema is re-synced safely via `prisma db push`; the seed does **not** re-run).

## Free-tier behaviour

- The service **sleeps after ~15 minutes of inactivity** and wakes on the next request (may take ~30–60 s the first time).
- Uploads persist on the disk, but ephemeral uploads/session state are wiped on redeploy unless stored in the DB. Sessions live in Postgres, so sign-ins survive redeploys; images A/B-tested but not yet used survive only on a paid/always-on plan.
- Upgrade to a paid plan (or `plan: starter`) when you expect constant traffic.

## Moving to production Postgres later

You can attach any Postgres by changing `DATABASE_URL` (Render Postgres, Supabase, Neon, etc.). `prisma db push` keeps the schema in sync.

## Troubleshooting

- **First deploy fails with `[ensure-seed] ... requires SEED_ADMIN_EMAIL ...`**: set the two seed variables in the service's **Environment** tab and click **Deploy latest commit**.
- **`DATABASE_URL is required`**: the variable wasn't set - add it in **Environment**.
- **Images missing**: check the browser console for CSP messages; confirming you're loading the latest deploy helps.
- **Health check fails**: open `/health` - it returns `{ok:true, db:'up'}` when the API and database are reachable.