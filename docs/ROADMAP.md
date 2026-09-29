# Roadmap

Status per item: `[ ]` not started · `[~]` in progress · `[x]` pass (verified) · `[!]` fail/blocked.
Update this file at the end of every session. Spec: `BUILD_PROMPT.md` §8.

## Current: **M0 — Scaffold** (next up)

## M0 — Scaffold
- [ ] Vite + TypeScript (strict) app boots with `npm run dev`
- [ ] ESLint + Prettier + Vitest wired; `npm run check` passes
- [ ] gitleaks pre-commit hook; GitHub Actions workflow (lint/typecheck/test + secret scan, no paid calls)
- [ ] `WorldSource` interface + `DemoCitySource` (procedural blocks) renders with no key
- [ ] "No API key" setup screen with instructions
- [ ] `geo.ts` lat/lon ↔ ENU with round-trip unit test (≤ 1 cm)

## M1 — World streaming (Google tiles)
- [ ] `GoogleTilesSource` streams tiles around the configured Lower Manhattan spawn
- [ ] Google logo + dynamic attributions visible, never covered by HUD
- [ ] Tile radius / LOD cap; distant tiles disposed; memory stable over repeated traversal (measured)
- [ ] Clear errors: missing key, rejected key, quota exceeded, network failure
- [ ] Policy check: runtime collision against loaded tiles allowed? (record ADR)

## M2 — On foot
- [ ] WASD + mouse orbit, sprint, jump; pointer-lock/focus handling
- [ ] Animated rigged avatar (CC0), follow camera without clipping
- [ ] Collision against nearby tiles; cannot fall through world; reset-to-spawn key

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
