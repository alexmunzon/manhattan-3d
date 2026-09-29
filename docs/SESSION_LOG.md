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

## 2026-09-29 · M2 On foot

- **Changes:** Added `Input` (keyboard plus pointer-lock mouse), `PlayerController` (raycast kinematic
  character: walk 4.5 m/s, sprint 9 m/s, jump, wall slide, 0.45 m step-up, ground snap, fall-through
  recovery, spawn waits for tiles to settle), `FollowCamera` (orbit, wall pull-in, wheel zoom), a
  procedural `Avatar` with a walk/air cycle, and a `PlayHint` overlay. `WorldHit` now carries a surface
  normal. BVHs are built per tile on `load-model` and freed on `dispose-model`. Replaced deprecated
  `Clock` with `Timer`. Added ADR-005.
- **Verified:** 26 unit tests pass: 7 controller tests on the demo city (standing, walk/sprint speed,
  wall block, jump, rooftop landing, respawn, wait-for-ground). In the browser on Google tiles: the
  player spawns on a Lower Manhattan rooftop (y ≈ 19.6), stays grounded, and moves with W. A raycast costs
  0.043 ms.
- **Not verified:** mouse-look and feel at a real frame rate. The browser pane was hidden, so rAF was
  throttled to a few fps. This needs a human playtest.
- **Gotcha:** a hidden browser pane throttles rendering. Also close duplicate tabs, because each one opens
  its own billable tiles session.
- **Next:** playtest M2 by hand, then M3 (climb and glide). Carry-overs: Google logo, the collision policy
  check, and a CC0 character.

## 2026-09-29 · M3 Climb & glide (+ M2 character)

- **Changes:** Added the Quaternius "Animated Base Character" (`public/models/character.glb`, credited in
  `THIRD_PARTY_NOTICES.md`) through `CharacterModel`: normalised to 1.8 m, crossfaded clips, and a
  speed-matched run/sprint. Added `AvatarView`/`Pose`. Added `findLedge` (wall, reach, height and
  headroom probes). `GliderController` is an arcade glide-path model: it settles at ~16 m/s, dives and
  flares, banks into turns, stalls, lands, and crashes into walls. `Character` owns the mode and routes
  to one controller; `gameMode.ts` is a pure transition table. Added `GliderWing` (blue delta wing),
  `ModeHud` (mph and altitude), per-mode camera rigs with FOV blending and glide recentering, a dev-only
  `__manhattan.tick()` for driving frames while the tab is hidden, and `resolve.dedupe` for three.
  Imports are now `three/addons/*`.
- **Verified:** 48 unit tests pass (ledge, climb flow, glider physics, glider deploy/land/reset, mode
  table). In the browser on Google tiles: the character renders at the correct scale with the idle clip;
  glide deploy at +80 m reads ~25–28 mph; it flew and landed on a rooftop at y = 67 m and returned to
  idle on foot. The duplicate-three warning is gone.
- **Not verified:** climbing on Google photogrammetry (the ledge probes may be noisy on real façades),
  and feel at 60 fps. Needs a human playtest.
- **Known polish:** from directly behind, the glider wing looks edge-on (a thin line). Lift the camera
  during glide in M5.
- **Next:** M4 Drive (the `Driving_Loop` clip already exists in the character file).

## 2026-09-29 · M4 Drive

- **Changes:** Added `CarController` (arcade raycast car, ADR-006), a procedural `CarModel` with
  spinning and steering wheels, and a `driving` mode in the state machine. V enters the car or calls it,
  and exit picks the clear side. Added the driving camera rig and HUD, and the `Driving_Loop` pose (the
  avatar is hidden in the car). `findStreetLevel` spawns at the nearest street-level point.
  Floor-gap recovery covers the player and car (ADR-007). Replaced the `tick` hook with a dev-only
  `?headless` URL flag that runs frames on timers, so hidden tabs keep rendering and streaming.
- **Verified:** 62 unit tests pass (car speed, brake, reverse, handbrake, steering, wall bounce,
  placement, enter/drive/exit, passenger-side exit, calling the car, reset, street spawn, floor-gap
  recovery, roof-edge fall). In the browser on Google tiles with `?headless`: spawned on the street at
  y ≈ -26.8 with the car beside the player, entered with V, reached 72 mph, drove 66 m along the street
  staying grounded, and exited with V standing beside the car.
- **Found and fixed:** the player fell through a tile-swap hole at spawn (ADR-007). Spawning was
  landing on rooftops. Exiting put the player into a wall.
- **Testing tip:** automated browser checks should open `http://127.0.0.1:5173/?headless`.
- **Next:** M5 HUD and polish (minimap, teleport, keycap legend, post-processing, lifting the glider
  camera). Decide on a CC0 car model (needs owner approval to download).

## 2026-09-29 · M5 HUD & polish

- **Changes:** Added the Quaternius Taxi (CC0) with re-pivoted spinning and steering wheels. Added the
  photoreal `Minimap` (ortho render, scissored, north-up) with `WorldSource.addCamera`, `TeleportBar`
  with the places list and Manhattan bounds, `?lat=&lon=` spawn links, `InfoPanel` (coords, copy link,
  avatar colours, graphics detail), `ControlsLegend` keycaps, `DebugOverlay` (backquote), physically
  based `Sky` that follows the camera, `BlobShadow` for the character and car, a raised glide camera
  pivot (the wing no longer looks edge-on), C to toggle a wide camera, and `Character.teleport`. Added
  ADR-008.
- **Verified:** 94 unit tests pass (places/bounds, teleport parsing, heading format, plus all earlier
  tests). In the browser (headless) on Google tiles: the HUD layout renders, and the minimap shows the
  photoreal top-down city once the glass blur was removed from behind it. Teleporting via the bar to
  "times square" landed at 40.75800, -73.98550 with the taxi alongside. Glided over Times Square with
  the wing shown correctly. Debug overlay: 55–57 FPS, 253 draw calls, 580k triangles.
- **Bug found and fixed:** the frosted-glass `backdrop-filter` blurred the WebGL minimap underneath it.
- **Not verified:** copying to the clipboard, the low-detail setting's effect on FPS, and responsive
  layout below 900 px.
- **Next:** M6. Run the full loop, handle bridge coverage gaps, record the README video/GIF, do a
  security review, and add the Google logo.
