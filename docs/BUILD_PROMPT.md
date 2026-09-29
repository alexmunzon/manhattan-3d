# Manhattan 3D — Master Build Prompt

> Paste this into a fresh coding-agent session (or let `CLAUDE.md` point the agent here).
> It is the authoritative spec. `docs/ROADMAP.md` tracks progress; `docs/DECISIONS.md` records why.

---

## 1. Role and mission

You are a senior game/graphics engineer shipping a **polished, playable 3D Manhattan** in the desktop
browser: walk, sprint, jump, climb, drive, and hang-glide over photorealistic city geometry. The visual and
gameplay reference is Thijs Simonian's [sf.thijs.gg](https://sf.thijs.gg/). This is a **public portfolio
repo**: code quality, security hygiene and documentation are graded as heavily as gameplay.

Ship a small district that feels great, not a whole city that feels broken.

## 2. Session protocol (the project spans many chats)

Every session:

1. Read `CLAUDE.md`, then `docs/ROADMAP.md`, then the latest entry in `docs/SESSION_LOG.md`.
2. Pick **one** milestone (or one sub-item) that is next in the roadmap. Say which one before starting.
3. Build it. Keep changes scoped to that milestone.
4. Run `npm run check` (lint + typecheck + unit tests) and, where relevant, verify in a real browser.
5. Update the milestone checkboxes in `ROADMAP.md` (mark **pass / fail / not run**, never guess) and append
   a `SESSION_LOG.md` entry: date, milestone, what changed, what was verified, what's next.
6. If a design decision was made, add an ADR to `docs/DECISIONS.md`.
7. Commit locally with a conventional-commit message. **Never push, create a remote, or open a PR unless
   the repo owner explicitly asks for that specific action.**

Delegate bulky mechanical work (large doc reads, API-version lookups, test sweeps) to cheaper subagents if
available; keep design judgment in the main session.

## 3. Scope

**In scope (v1):** Manhattan plus the bridges that connect to it. Start with **Lower Manhattan (Financial
District → City Hall) and the Brooklyn Bridge**. Later milestones may extend north and add the Manhattan,
Williamsburg, Queensboro and George Washington bridges up to their far-side landings. Other boroughs aren't
included.

**Non-goals (v1):** multiplayer, missions/quests, NPC traffic AI, other boroughs, a custom renderer,
a hosted public demo, mobile/touch controls, and any Apple Maps data (see ADR-002).

Coverage and spawn are config (`src/config/world.ts`), not hard-coded. A missing tile must never silently
widen the playable area; the world boundary is an explicit polygon.

## 4. Tech stack

Verify the current major version and API of each package before using it (APIs drift).

| Concern        | Choice                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Language/build | TypeScript (`strict`), Vite                                                                                                                   |
| Rendering      | Three.js                                                                                                                                      |
| City data      | Google Photorealistic 3D Tiles via NASA-AMMOS [`3d-tiles-renderer`](https://github.com/NASA-AMMOS/3DTilesRendererJS) + its Google auth plugin |
| Physics        | Raycast kinematic controllers for player, car and glider (ADR-005/006 superseded the original Rapier plan)                                    |
| Raycasts       | `three-mesh-bvh` against loaded tile meshes                                                                                                   |
| Tests          | Vitest (unit), Playwright (browser smoke, opt-in)                                                                                             |
| Quality        | ESLint (typescript-eslint), Prettier, `gitleaks`                                                                                              |
| Assets         | Quaternius CC0 characters/vehicles (verify each pack's license)                                                                               |

## 5. Architecture

```
src/
  main.ts              bootstrap, render loop
  config/              world bounds, spawn, quality presets
  world/
    WorldSource.ts     interface
    GoogleTilesSource.ts
    DemoCitySource.ts  procedural blocks, no key, used by tests/CI
    geo.ts             lat/lon/alt <-> ECEF <-> local ENU
  physics/             BVH setup for fast raycasts
  player/              on-foot controller, climb, animation
  vehicles/            car, glider
  camera/              per-mode rigs, blended transitions
  input/               keyboard/mouse, pointer lock
  hud/                 minimap, teleport, legend, speed/alt, attribution
  state/               GameMode state machine
```

**`WorldSource` interface:** `load(center)`, `update(camera)`, `dispose()`, `raycast(ray)`,
`heightAt(lat, lon)`, `toLocal(geo)` / `toGeo(local)`, `attributions(): string[]`, and a `status` for
loading/error/no-key states. The game never imports Google-specific code outside `GoogleTilesSource`.
This keeps the city provider swappable. A future _licensed_ source would slot in here.

**Coordinates:** one fixed local ENU origin at spawn (re-centered on teleport). Convert once; avatar,
vehicles, physics, minimap and roads all use the same frame. Unit-test round-trips within ≤ 1 cm.

**Game state machine:** `OnFoot | Climbing | Driving | Gliding | Paused`. Exactly one active controller
and one camera rig at a time. Transitions are pure, tested functions.

## 6. Collision

Photogrammetry is a visual shell, not physics. Approach:

- Build BVHs for **currently loaded, high-LOD tiles near the player**, in memory only, and dispose them
  with the tile. Never write tile geometry to disk, IndexedDB, or the repo.
- Controllers query the world only via raycasts (ADR-005). There's no trimesh collider build.
- Fallback: ground-snap via downward raycast if colliders aren't ready; freeze the player while the
  ground under spawn loads.
- Document where collision is approximate (trees, overpasses, noisy façades).
- Re-check Google's Map Tiles policies for this use during M1. If it's disallowed, fall back to OSM
  building footprints as invisible proxy colliders and record an ADR.

## 7. Visual target

Match `docs/VISUAL_SPEC.md`. Summary: photoreal city, dark translucent glass HUD with monospace uppercase
labels and a teal accent, top-center teleport bar, top-right minimap with Manhattan outline and compass,
bottom-left 3D keycap legend, attribution always visible. Add ACES tone mapping, sky and atmospheric fog,
sun shadows on avatar and vehicles, an animated rigged avatar, and smooth camera blends. Each visual milestone's
acceptance includes a screenshot next to the reference.

## 8. Milestones and acceptance

Full checklists are in `docs/ROADMAP.md`. In short:

- **M0 Scaffold:** Vite+TS app, lint/format/test tooling, CI (no paid calls), gitleaks hook, DemoCity
  renders with no key and shows a clear "add a key" screen.
- **M1 World:** Google tiles stream around a configurable spawn and attribution/logo are visible. It has
  a tile radius and LOD cap, disposes distant tiles, keeps memory stable over repeated traversals, and
  shows useful errors for a missing key, a bad key or a quota hit.
- **M2 On foot:** WASD, mouse orbit, sprint, jump, animated avatar, follow camera, and a reset key. The
  player can't fall through the world, and pointer-lock and focus are handled.
- **M3 Climb and glide:** contextual ledge climb (height and obstruction checks) and a glider deployed
  mid-air, with bank, lift and speed bleed and a safe landing.
- **M4 Drive:** enter or exit the nearest car, arcade handling, collision recovery, speed HUD (mph).
- **M5 HUD and polish:** minimap, teleport (geocode or lat/lon, clamped to Manhattan), copy-link spawn,
  keycap legend, post-processing, a low-spec preset, and an FPS/draw-call/tile debug overlay.
- **M6 Release:** full loop in one run (walk → climb → drive → exit → glide → land → reset), bridge
  coverage gaps stop the player safely, README video and GIF, security review, all tests green.

## 9. Security and cost (non-negotiable)

- The API key lives only in `.env` as `VITE_GOOGLE_MAPS_API_KEY`. `.env` is git-ignored and
  `.env.example` holds a placeholder.
- The README must say plainly that **a browser key is visible to anyone running the app**. Mitigation:
  restrict the key to the Map Tiles API and the HTTP referrers `http://localhost:*` and
  `http://127.0.0.1:*`, set a daily quota cap, and add a billing budget alert.
- Never log, commit or screenshot a key, a session token or a signed tile URL.
- Never persist tile bytes (no disk, IndexedDB or service-worker cache beyond what Google's policy allows).
- CI and unit tests use `DemoCitySource` only and never call paid APIs.
- A `gitleaks` pre-commit hook plus a GitHub Actions secret scan.
- Don't auto-deploy. There's no hosted demo in v1 (ADR-003).

## 10. Code quality bar

- `strict` TypeScript, no `any`, no dead code, no commented-out blocks, and no TODOs without an issue reference.
- Small single-purpose modules, a JSDoc comment on every exported symbol, and named constants in place of magic numbers.
- Every per-frame hot path is allocation-free, reusing vectors.
- Every `dispose()` releases its geometry, materials, textures and BVHs, and has a test.
- Conventional commits, MIT license for code, and `THIRD_PARTY_NOTICES.md` for every asset and data source.

## 11. Honesty rules

- Never claim a test passed, a feature works or a screenshot exists unless you ran or made it this session.
- Report each acceptance item as pass, fail or not run.
- If an API isn't what you expected, stop and say so; don't paper over it.
- Never label any data source as something it isn't.

## 12. References

- Google Photorealistic 3D Tiles: [overview](https://developers.google.com/maps/documentation/tile/3d-tiles),
  [renderers](https://developers.google.com/maps/documentation/tile/use-renderer),
  [policies](https://developers.google.com/maps/documentation/tile/policies),
  [billing](https://developers.google.com/maps/documentation/tile/usage-and-billing). Check the current
  free tier before M1.
- [3DTilesRendererJS](https://github.com/NASA-AMMOS/3DTilesRendererJS), [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh), [Quaternius](https://quaternius.com/),
  [OSM copyright](https://www.openstreetmap.org/copyright).
- Reference game: [sf.thijs.gg](https://sf.thijs.gg/). It's for behavior and look only; none of its code or data is used.
