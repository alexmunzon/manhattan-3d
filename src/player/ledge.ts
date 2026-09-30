import { Ray, Vector3 } from 'three';
import type { WorldSource } from '../world/WorldSource';

export const LEDGE = {
  /** How far ahead a wall may be to start a climb. */
  wallReach: 1.1,
  /** Ledge heights (above the feet) that can be climbed from standing / mid-air. */
  minHeight: 0.6,
  maxHeightGrounded: 2.4,
  maxHeightAirborne: 3.0,
  /** How far past the wall face the player ends up standing (first choice). */
  standInset: 0.45,
  /** Other landing spots tried when real, uneven geometry has no floor at the first one. */
  fallbackInsets: [0.3, 0.65],
  /** Clear space required above the ledge for the player's body. */
  headroom: 1.8,
  minFloorNormalY: 0.7,
} as const;

/** Wall probes: knee height (just above a curb step) catches ledges from 0.6 m; 1 m catches more. */
const WALL_PROBE_HEIGHTS = [0.5, 1.0] as const;
const TOP_PROBE_LIFT = 0.6;

/** Where a climb ends: standing on top of the ledge. */
export interface LedgeTarget {
  top: Vector3;
}

const ray = new Ray();
const scratch = new Vector3();

/**
 * Looks for a climbable ledge in front of the player.
 * Checks: a wall within reach, a walkable top within reach height, and headroom above the top.
 */
export function findLedge(
  world: WorldSource,
  feet: Vector3,
  forward: Vector3,
  airborne: boolean,
): LedgeTarget | null {
  const direction = scratch.set(forward.x, 0, forward.z).normalize();
  let wallDistance = Infinity;
  for (const height of WALL_PROBE_HEIGHTS) {
    ray.origin.set(feet.x, feet.y + height, feet.z);
    ray.direction.copy(direction);
    const wall = world.raycast(ray, LEDGE.wallReach);
    if (wall && wall.normal.y < LEDGE.minFloorNormalY) {
      wallDistance = Math.min(wallDistance, wall.distance);
    }
  }
  if (wallDistance === Infinity) return null;

  const maxHeight = airborne ? LEDGE.maxHeightAirborne : LEDGE.maxHeightGrounded;
  for (const inset of [LEDGE.standInset, ...LEDGE.fallbackInsets]) {
    const top = findTop(world, feet, direction, wallDistance + inset, maxHeight);
    if (top) return { top };
  }
  return null;
}

/** A walkable top `along` metres ahead, within climbing height and with headroom above it. */
function findTop(
  world: WorldSource,
  feet: Vector3,
  direction: Vector3,
  along: number,
  maxHeight: number,
): Vector3 | null {
  ray.origin.set(
    feet.x + direction.x * along,
    feet.y + maxHeight + TOP_PROBE_LIFT,
    feet.z + direction.z * along,
  );
  ray.direction.set(0, -1, 0);
  const top = world.raycast(ray, maxHeight + TOP_PROBE_LIFT);
  if (!top || top.normal.y < LEDGE.minFloorNormalY) return null;
  const height = top.point.y - feet.y;
  if (height < LEDGE.minHeight || height > maxHeight) return null;
  const point = top.point.clone();

  // Headroom: nothing directly above the landing spot.
  ray.origin.set(point.x, point.y + 0.05, point.z);
  ray.direction.set(0, 1, 0);
  if (world.raycast(ray, LEDGE.headroom)) return null;
  return point;
}
