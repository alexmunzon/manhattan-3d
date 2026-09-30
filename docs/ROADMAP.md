# Roadmap

Status per item: `[ ]` not started · `[~]` in progress · `[x]` pass (verified) · `[!]` fail/blocked.
Update this file at the end of every session. Spec: `BUILD_PROMPT.md` §8.

## Current: **M6 — Release** (carry-overs: M1 Google logo + policy check; human playtest of M2–M5 feel)

## M0 — Scaffold

- [x] Vite + TypeScript (strict) app boots with `npm run dev`
- [x] ESLint + Prettier + Vitest wired; `npm run check` passes
- [~] gitleaks pre-commit hook (verified: blocks a fake token); GitHub Actions workflow written, not run until a remote exists
- [x] `WorldSource` interface + `DemoCitySource` (procedural blocks) renders with no key
- [x] "No API key" setup screen with instructions
- [x] `geo.ts` lat/lon ↔ ENU with round-trip unit test (≤ 1 cm)

## M1 — World streaming (Google tiles)

- [x] `GoogleTilesSource` streams tiles around the configured Lower Manhattan spawn
- [~] Dynamic attributions visible (verified); official Google logo asset still needed from Google brand resources
- [x] Tile radius / LOD cap; distant tiles disposed; memory stable over repeated traversal (measured: 51–184 geometries over 3 laps, no growth)
- [~] Clear errors: missing key verified in browser; rejected/quota/network messages unit-tested only
- [ ] Policy check: runtime collision against loaded tiles allowed? (record ADR)

## M2 — On foot

- [~] WASD, sprint, jump, pointer lock, blur handling built; movement verified in unit tests + scripted browser run; mouse-look needs a human playtest
- [x] Rigged Quaternius character (idle/jog/sprint/jump/fall clips, speed-matched) + follow camera with wall pull-in; procedural mannequin kept as load-failure fallback
- [x] Collision against tiles via BVH raycasts (0.04 ms/ray measured); fall-through recovery; R resets (unit-tested)

## M3 — Climb & glide

- [x] Contextual ledge climb (Space at a wall): reach, height 0.6–2.4 m (3.0 m mid-air), headroom checks (unit-tested on demo city; not yet exercised on Google tiles)
- [x] Glider (H in air): deploy needs 4 m clearance, bank/turn, dive/flare, stall, touchdown + wall crash (unit-tested; flown and landed on Google tiles)
- [x] Pure `nextMode` state machine with transition tests; one controller active per frame; camera rigs blend by mode

## M4 — Drive

- [x] V enters the car within 5 m or calls it to you (parks at your ground level); arcade throttle/brake/reverse/handbrake, speed-sensitive steering; exits on the clear side
- [x] Bumper-probe wall bounce, 4-wheel ground following (pitch/roll), cannot flip, fall + streaming-hole recovery; "Driving · mph" HUD; 7 m / 65° camera rig with heading recenter

## M5 — HUD & polish

- [x] Minimap: top-down photoreal render of the same tiles, north-up, player arrow, heading readout, zoom, expand (Manhattan outline not drawn; used for teleport bounds instead)
- [x] Teleport bar (18 named places or lat/lon, clamped to Manhattan; no paid geocoder) + `?lat=&lon=` spawn links with Copy link (clipboard write not verified in automation)
- [x] 3D keycap control legend; avatar colour swatches (tints the character)
- [x] ACES + physically based sky + horizon fog; blob contact shadows (tiles are unlit); Graphics High/Low toggle; backquote debug overlay (measured 55–57 FPS, 253 draw calls, 580k tris over Times Square)

## M6 — Release

- [x] Full loop in one run: walk → climb → drive → exit → glide → land → reset. Demo city: passes
  (Vitest + browser selftest). Google tiles: all 15 steps pass in one `?selftest=loop` run
  (2026-09-30), no per-frame violations
- [x] Scripted gameplay selftest (`src/testing/`): full loop, reset mid-action, button mashing,
  façade climb check; per-frame checks (fall-through, walk-through, stuck climb, car, camera)
- [~] Climbing on real façades: knee-high ledges, reach 1.1 m, platform check (no bollards) unit-tested;
  on Google 0–2 of 10 nearby walls climbable, no bad climbs; platform check not yet re-measured on Google
- [ ] Bridges: missing spans stop the player safely with a visible notice
- [ ] README gameplay video/GIF + screenshots; THIRD_PARTY_NOTICES complete
- [ ] Security review (secrets, deps audit); all tests green (106 tests green; gitleaks full-history and
  npm audit not run yet)
