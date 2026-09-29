# Session Log

Append-only. One entry per session: date · milestone · changes · verified · next.

## 2026-09-29 · Planning

- **Changes:** Rewrote the original LLM-generated prompt into `docs/BUILD_PROMPT.md` (the original is in
  `docs/archive/`). Added CLAUDE.md, README, ROADMAP, DECISIONS (ADR-001–004), VISUAL_SPEC, .gitignore
  and .env.example.
- **Research:** Apple 3D data is off the table (ADR-002). The visual target was captured from sf.thijs.gg.
- **Verified:** `.env` is git-ignored and no secrets are in tracked files.
- **Next:** M0 Scaffold.

## 2026-09-29 · M0 Scaffold

- **Changes:** Vite 8 + TypeScript 6 (strict) + Three.js r186 app. ESLint (strictTypeChecked), Prettier,
  Vitest. Added `WorldSource` interface, `DemoCitySource` (seeded procedural grid city), `geo.ts` (WGS84 ↔
  ECEF ↔ local ENU; +x east, +y up, -z north), no-key setup screen, attribution line, and a temporary
  OrbitControls viewer (replaced in M2). Added a gitleaks pre-commit hook (`.githooks/`, enabled by
  `npm install` via the `prepare` script) and CI at `.github/workflows/ci.yml`.
- **Verified:** `npm run check` passes (13 tests) and `npm run build` succeeds. In the browser: the demo
  city renders, the setup screen shows and dismisses, and there are no console errors. The pre-commit hook
  blocked a staged fake token.
- **Not run:** GitHub Actions (there's no remote yet).
- **Notes:** `heightAt` takes game-space (x, z), not lat/lon; convert with `world.frame`. The build warns
  about a chunk over 500 kB (three.js); code-split later if load time matters.
- **Next:** M1. Add `3d-tiles-renderer` and `GoogleTilesSource`. This needs the owner's restricted API key
  in `.env`.
