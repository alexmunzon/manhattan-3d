# CLAUDE.md — Manhattan 3D

Browser game: photoreal 3D Manhattan (Google Photorealistic 3D Tiles) you can walk, climb, drive and
hang-glide through. TypeScript + Vite + Three.js, raycast physics (no physics engine; ADR-005/006). Public portfolio repo.

## Start of every session

1. Read `docs/ROADMAP.md` (status) and the latest entry in `docs/SESSION_LOG.md` (last handoff).
2. Full spec: `docs/BUILD_PROMPT.md`. Look: `docs/VISUAL_SPEC.md`. Why things are the way they are:
   `docs/DECISIONS.md`.
3. Work on one milestone. At the end, update ROADMAP checkboxes and append to SESSION_LOG.

## Hard rules

- **No secrets in git.** The key lives only in `.env` (git-ignored). Never print, log or commit keys,
  tokens or signed tile URLs.
- **No Apple Maps data** of any kind (ADR-002). Google tiles only, through `WorldSource`.
- **Never persist tile data** (disk, IndexedDB, repo). In-memory only.
- **Tests and CI never call paid APIs.** Use `DemoCitySource`.
- **Never push, add a remote, or open or merge a PR** without the owner's explicit permission for that
  specific action.
- Never report something as working or tested unless it was run this session.

## Commands

- `npm install` · `npm run dev` · `npm run check` (lint + typecheck + test)

## Testing in a browser

- Open `http://127.0.0.1:5173/?headless` for automated checks. It keeps rendering and tile streaming
  alive in hidden tabs. `window.__manhattan` exposes the game in dev builds only.
- Keep one game tab open: every tab opens its own billable Google tiles session.
- Gameplay scenarios (`src/testing/`) run in `npm run test` on the demo city: full loop, reset
  mid-action, seeded button mashing. In the browser: `?headless&selftest=loop|climbs|google|all`.
  Add `&demo` to stay on the free demo city; without it the run uses Google tiles (one billable
  session). Results: HUD panel and `window.__manhattan.selftest`.
- Opening the plain dev URL loads Google tiles when `.env` has a key. Use `?demo` for free checks.

## Owner context

The owner is learning engineering through this project. Explain decisions in plain language, one or two
sentences, framed by outcome. Flag security, cost or data risks before building.
