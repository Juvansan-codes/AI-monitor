# Pushing This Project to GitHub

> Why this file exists: the Freebuff/Vly environment manages version control and
> blocks `git`/`gh` terminal commands, so the code can't be pushed from here.
> These are the exact steps to push it from your own machine.

## 1. Get the code

- In the Freebuff project UI, use **Export / Download** to download this project
  as a zip, and extract it on your machine.
  (If you already have a local copy, skip this step.)

## 2. Create the GitHub repository

- This project's repo already exists: https://github.com/jenisia-tech/AI-monitor
  (verified empty, default branch `main`). If you ever need to recreate it,
  go to https://github.com/new, name it `AI-monitor`, and **create it EMPTY**
  (no README, no .gitignore, no license). If you created it with a README,
  run `git pull origin main --allow-unrelated-histories` after step 4 instead.

## 3. Turn the folder into a git repo

```bash
cd <extracted-project-folder>

git init
git add .
```

Everything sensitive is already excluded by `.gitignore` (see below), so a
plain `git add .` is safe.

## 4. Commit and push

```bash
git commit -m "feat: AI Maintenance Safety & Quality Monitor

- Worker flow: PPE check, GPS journey, worksite check, maintenance monitor
- Supervisor command center, worker details, SOP management, reports
- Honest AI service layer (PPE/detection/action/SOP/route) for the FastAPI backend
- FastAPI backend: YOLO-ready detectors, SOP engine, alerts + WebSockets,
  scoring, JWT auth, idempotent demo seeding, pytest suite
"

git branch -M main
git remote add origin https://github.com/jenisia-tech/AI-monitor.git
git push -u origin main
```

## What `.gitignore` already protects

- `node_modules`, `dist`, `.env.local`
- `src/convex/_generated` (regenerated on `bun convex dev`)
- `ai-maintenance-backend/.venv/`, `ai-maintenance-backend/.env`, `*.db`,
  `ai-maintenance-backend/uploads/`, `__pycache__/`, `.pytest_cache/`

`ai-maintenance-backend/env.example` is a **template only** (no real secrets).

## 5. Reconfigure secrets in the new home (never commit these)

Set these outside the repo (GitHub repo **Settings → Secrets and variables**,
or your hosting env):

| Variable | Where to set |
| --- | --- |
| `VITE_AI_API_URL` | frontend build env (AI backend origin) |
| `DATABASE_URL` | FastAPI backend env (PostgreSQL) |
| `JWT_SECRET` | FastAPI backend env |
| `S3_*` | FastAPI backend env (object storage) |
| `VLY_INTEGRATION_KEY` | platform-managed; already injected by Freebuff |

Backend: `cp ai-maintenance-backend/env.example ai-maintenance-backend/.env`,
fill in real values, and never commit `.env`.

## Demo accounts (seeded by the FastAPI backend)

| Email | Password | Role |
| --- | --- | --- |
| `worker@demo.com` | `worker123` | worker (W101) |
| `worker2@demo.com` | `worker123` | worker (W102) |
| `worker3@demo.com` | `worker123` | worker (W103) |
| `supervisor@demo.com` | `super123` | supervisor (S01) |
