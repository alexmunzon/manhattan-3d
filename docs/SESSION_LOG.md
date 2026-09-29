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

## 2026-09-29 · M1 World streaming

- **Changes:** Added `GoogleTilesSource` (3d-tiles-renderer 0.5.3 with the Google auth, glTF/Draco, fade,
  unload and reorientation plugins, and a 250–350 MB LRU cache). The game uses it automatically when
  `.env` has a key. Added a Draco decoder copy script (`predev`/`prebuild`), key-safe error messages
  (`tileErrors.ts`), a live attribution line, an error notice panel, and a dev-only `window.__manhattan`
  debug handle.
- **Verified (Chrome, real key):** Lower Manhattan renders photoreal with no console errors. Orientation
  is correct: the tallest structure found sits within ~40 m of One World Trade Center's expected position.
  Spawn street level is about -30 m ellipsoid height. Memory held at 51–184 geometries over 3 camera
  laps, JS heap ~191 MB. 19 unit tests pass.
- **Not verified:** that only one billable root request is made per session (the network buffer overflowed).
  The rejected-key and quota paths weren't run live.
- **Security incident:** the key was echoed once into the assistant's tool output while fixing `.env`
  formatting. The owner was advised to regenerate the key.
- **Next:** add the official Google logo asset and check Google's collision policy (ADR-004), then M2.
