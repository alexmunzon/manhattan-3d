import { Ray, Vector3 } from 'three';
import type { WorldSource } from '../world/WorldSource';

export const LEDGE = {
  /** How far ahead a wall may be to start a climb. */
  wallReach: 0.9,
  /** Ledge heights (above the feet) that can be climbed from standing / mid-air. */
  minHeight: 0.6,
  maxHeightGrounded: 2.4,
  maxHeightAirborne: 3.0,
  /** How far past the wall face the player ends up standing. */
  standInset: 0.45,
  /** Clear space required above the ledge for the player's body. */
  headroom: 1.8,
  minFloorNormalY: 0.7,
} as const;

const WALL_PROBE_HEIGHT = 1.0;
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
  ray.origin.set(feet.x, feet.y + WALL_PROBE_HEIGHT, feet.z);
  ray.direction.set(forward.x, 0, forward.z).normalize();
  const wall = world.raycast(ray, LEDGE.wallReach);
  if (!wall || wall.normal.y >= LEDGE.minFloorNormalY) return null;
  const wallDistance = wall.distance;

  const maxHeight = airborne ? LEDGE.maxHeightAirborne : LEDGE.maxHeightGrounded;
  // Probe down onto the top, just past the wall face.
  scratch
    .copy(ray.direction)
    .multiplyScalar(wallDistance + LEDGE.standInset)
    .add(feet);
  ray.origin.set(scratch.x, feet.y + maxHeight + TOP_PROBE_LIFT, scratch.z);
  ray.direction.set(0, -1, 0);
  const top = world.raycast(ray, maxHeight + TOP_PROBE_LIFT);
  if (!top || top.normal.y < LEDGE.minFloorNormalY) return null;
  const height = top.point.y - feet.y;
  if (height < LEDGE.minHeight || height > maxHeight) return null;
  const topPoint = top.point.clone();

  // Headroom: nothing directly above the landing spot.
  ray.origin.set(topPoint.x, topPoint.y + 0.05, topPoint.z);
  ray.direction.set(0, 1, 0);
  if (world.raycast(ray, LEDGE.headroom)) return null;

  return { top: topPoint };
}
