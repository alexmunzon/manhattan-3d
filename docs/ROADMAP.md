# Roadmap

Status per item: `[ ]` not started · `[~]` in progress · `[x]` pass (verified) · `[!]` fail/blocked.
Update this file at the end of every session. Spec: `BUILD_PROMPT.md` §8.

## Current: **M3 — Climb & glide** (open carry-overs: M1 Google logo + policy check, M2 CC0 avatar)

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
- [~] Procedural animated mannequin (placeholder) + follow camera with wall pull-in; CC0 rigged character pending owner-approved download
- [x] Collision against tiles via BVH raycasts (0.04 ms/ray measured); fall-through recovery; R resets (unit-tested)

## M3 — Climb & glide

- [ ] Contextual ledge climb with reach-height + obstruction checks
- [ ] Glider: deploy mid-air, bank/steer, lift + speed bleed, safe landing
- [ ] State-machine transition tests (no duplicate controllers, no stuck camera)

## M4 — Drive

- [ ] Enter/exit nearest car; arcade steer/accelerate/brake/reverse
- [ ] Collision + flip recovery; speed HUD (mph); distinct camera rig

## M5 — HUD & polish

- [ ] Minimap (Manhattan outline, player, compass, heading, zoom, expand)
- [ ] Teleport bar (address or lat/lon, clamped to Manhattan) + copy-link spawn URL
- [ ] 3D keycap control legend; avatar color swatches
- [ ] ACES tone mapping, sky/fog, shadows; low-spec preset; FPS/draw-call/tile debug overlay

## M6 — Release

- [ ] Full loop in one run: walk → climb → drive → exit → glide → land → reset
- [ ] Bridges: missing spans stop the player safely with a visible notice
- [ ] README gameplay video/GIF + screenshots; THIRD_PARTY_NOTICES complete
- [ ] Security review (secrets, deps audit); all tests green
