# Architecture Decision Records

Short log of significant decisions. Newest last. Format: context → decision → consequences.

## ADR-001 — TypeScript + Vite + Three.js in the browser (2026-09-29)

**Context:** We need a 3D game that's easy to run, easy to show off, and has mature 3D Tiles tooling.
**Decision:** TypeScript (strict), Vite, Three.js, NASA-AMMOS `3d-tiles-renderer`, Rapier physics.
**Consequences:** Anyone can run it with `npm run dev`. There's no native build. Performance is bounded by
WebGL, so tile radius and LOD caps matter.

## ADR-002 — Google Photorealistic 3D Tiles, not Apple Maps (2026-09-29)

**Context:** The reference game (sf.thijs.gg) displays Apple Maps 3D data. Research on 2026-09-29 found:

- The only way to get Apple's mesh is the community reverse-engineering tools (retroplasma and its forks,
  the last active one in 2021–22). They need auth tokens taken from Apple's own client software.
- Apple's Maps Terms of Use prohibit copying, extracting, scraping, reverse engineering and unauthorized
  caching.
- MapKit JS has no 3D or pitch. Native MapKit Flyover renders 3D but gives no mesh, depth or collision.

**Decision:** Use Google Photorealistic 3D Tiles, a licensed service built for this use, behind a
provider-agnostic `WorldSource` interface. The repo contains no Apple data or extraction code.
**Consequences:** It's billed per use and needs on-screen Google attribution. If a licensed Apple source
ever exists, it can be added as a new `WorldSource` adapter.

## ADR-003 — No hosted public demo in v1 (2026-09-29)

**Context:** A browser API key is visible to every visitor, and each visit costs money.
**Decision:** The demo is the README video plus local play with the player's own restricted key.
**Consequences:** There's no surprise bill. Reconsider later with a server-side quota and a kill switch.

## ADR-004 — Collision from loaded tiles, in memory only (2026-09-29, provisional)

**Context:** Photogrammetry has no physics. A separate collision source would drift from the visuals.
**Decision:** Build BVH and trimesh colliders from nearby loaded tiles at runtime and dispose them with
the tiles. Nothing is persisted.
**Consequences:** Collision matches what the player sees but is noisy on trees and façades. Google's
policy fit gets re-verified in M1; the fallback is OSM footprint proxies.

## ADR-005 — Raycast kinematic controller for on-foot movement (2026-09-29)

**Context:** Feeding streaming photogrammetry into a physics engine means building trimesh colliders
constantly as tiles load and unload.
**Decision:** The on-foot controller moves using raycasts against `WorldSource` only. It slides along
walls, steps up curbs and snaps to the ground, with `three-mesh-bvh` for speed. Rapier is deferred to M4
(vehicles), where real dynamics matter.
**Consequences:** It works the same on every world source and is fully unit-testable on the demo city.
There's no physical interaction between the player and objects. Thin geometry smaller than the probe
spacing can be missed.
