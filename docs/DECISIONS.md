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

## ADR-004 — Collision from loaded tiles, in memory only (2026-09-29, provisional; see ADR-009)

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

## ADR-006 — Raycast arcade car instead of Rapier (2026-09-29)

**Context:** ADR-005 deferred Rapier to vehicles. An arcade car needs no rigid-body dynamics, and
Rapier would still need colliders built from streaming tiles.
**Decision:** `CarController` is kinematic: bicycle-model steering, four-corner ground raycasts for
height, pitch and roll, and bumper raycasts that bounce the car off walls. Rapier is dropped for v1.
**Consequences:** The car can't flip or tumble, which keeps it arcade-friendly and removes the need for
flip recovery. It's deterministic and unit-tested on the demo city. There are no car-to-car physics.
Photogrammetry parked cars and trees act as solid obstacles.

## ADR-007 — Recover from streaming holes (2026-09-29)

**Context:** In the browser, the player fell through Google tiles right after spawning. While tiles
swap detail levels, the surface underfoot can briefly disappear.
**Decision:** If the player or car has dropped more than 0.5 m below its last safe spot, look straight
down from just above that height. A walkable floor found above the feet is one it fell through: snap
back onto it. Spawning also picks the nearest street-level point, never a rooftop.
**Consequences:** Streaming gaps no longer cause long falls, and players no longer visibly sink. A
real fall off a roof or ledge is unaffected, because there is only air above the feet there.
**Revised 2026-09-30:** the first version waited for a 3 m drop and used the topmost surface. On
Google tiles the gameplay selftest caught players sinking up to 3 m through the street during tile
swaps (and "climbing" back out), so the threshold is now 0.5 m, and the floor-above-feet test
replaces the topmost-surface test so awnings or trees above a low drop can't catch the player.

## ADR-008 — Minimap and teleport without extra paid APIs (2026-09-29)

**Context:** A satellite minimap and address search would normally need more Google APIs (2D tiles,
Geocoding). Each is billed separately and would widen what the key can do.
**Decision:** The minimap is a second, orthographic render of the already-streamed 3D tiles, taken
from straight above the player. Only root-tileset requests are billed, so this adds no cost. Teleport
resolves a curated list of Manhattan places or raw lat/lon, checked against a hand-traced Manhattan
outline.
**Consequences:** The key stays restricted to the Map Tiles API. The minimap costs a second render
pass (about 2x draw calls) and shows only loaded detail. There's no free-text street-address search.

## ADR-009 — Google policy fit for runtime collision (2026-09-30)

**Context:** ADR-004 builds collision from the tiles that are currently rendered and asked for a policy
check. Google's documents were reviewed on 2026-09-30 (a web research pass; quotes are short and the
pages should be re-read before any hosted release):

- Maps Platform Terms of Service, https://cloud.google.com/maps-platform/terms (modified 2026-08-26):
  no caching of Google Maps Content "except as expressly permitted"; no pre-fetching, indexing, storing
  or rehosting outside the services; "Customer will not create content based on Google Maps Content"
  (its examples: tracing roads and building outlines, 3D models from 45° imagery, terrain from Elevation).
- Service Specific Terms, https://cloud.google.com/maps-platform/terms/maps-service-terms (modified
  2026-06-10): no Map Tiles or Photorealistic 3D Tiles clause found, so there is no tile caching allowance.
- Map Tiles API policies, https://developers.google.com/maps/documentation/tile/policies (updated
  2026-09-24): use is for "map visualizations" and "may not" be used for image analysis, machine
  interpretation, object detection, "Geodata extraction or resale" or offline use; you may overlay your
  own 3D objects as long as they "aren't extracted, traced, or otherwise derived" from the tiles; cache
  headers must be respected; the Google logo and per-tile copyright text must be shown unmodified.
- Usage and billing, https://developers.google.com/maps/documentation/tile/usage-and-billing (updated
  2026-09-24): root tileset requests are the quota unit (10,000 per day); a session token allows up to
  three hours of renderer tile requests per root request; the pricing page lists the Photorealistic 3D
  Tiles SKU at $6.00 per 1,000 in the first tier. No sentence says in so many words that only root
  requests are billed, but the SKU and quota wording point that way.
- No official Google guidance, blog post or sample about collision or physics against the tiles was
  found. Cesium exposes tileset collision for camera clamping, but that is a Cesium feature, not a
  Google statement.

**Decision:** Keep ADR-004. Raycasting against the geometry the renderer already holds in memory is
treated as part of visualising and moving through the scene, not as creating content or extracting
geodata: nothing is traced, exported, stored, analysed or reused, and the acceleration structures are
disposed with their tiles. The game stays visualization-only: no persistence (ADR-004), no offline use,
no geometry export, no analysis, tiles never shown with or near a non-Google map, logo and copyright
line always visible. Status: **believed compliant, not confirmed by Google.**

**Consequences:** The residual risk is that "machine interpretation" or "derived" could be read to cover
collision geometry. Before any hosted or commercial release, ask Google Maps Platform support in
writing whether runtime, in-memory collision against displayed tiles is acceptable, and record the
answer here. If the answer is no, the fallback is OSM building footprints extruded as proxy colliders.
