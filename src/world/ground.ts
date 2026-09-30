import type { Ray, Vector3 } from 'three';
import type { WorldSource } from './WorldSource';

const SAMPLE_STEP = 4;
/** Surfaces within this height of the lowest one count as the same street level. */
const LEVEL_TOLERANCE = 0.5;
/** Hole recovery looks down from this far above the last safe floor (bumps and slopes). */
const FLOOR_RECOVERY_LIFT = 0.5;

/**
 * Finds street level near (x, z): the lowest surface within `radius`, preferring the sample
 * closest to (x, z) among those at that level. Returns null if nothing has loaded there yet.
 */
export function findStreetLevel(
  world: WorldSource,
  x: number,
  z: number,
  radius: number,
): { x: number; y: number; z: number } | null {
  const samples: { x: number; y: number; z: number; d2: number }[] = [];
  let lowest = Infinity;
  for (let dx = -radius; dx <= radius; dx += SAMPLE_STEP) {
    for (let dz = -radius; dz <= radius; dz += SAMPLE_STEP) {
      const d2 = dx * dx + dz * dz;
      if (d2 > radius * radius) continue;
      const y = world.heightAt(x + dx, z + dz);
      if (y === null) continue;
      samples.push({ x: x + dx, y, z: z + dz, d2 });
      lowest = Math.min(lowest, y);
    }
  }
  let best: { x: number; y: number; z: number; d2: number } | null = null;
  for (const s of samples) {
    if (s.y <= lowest + LEVEL_TOLERANCE && (best === null || s.d2 < best.d2)) best = s;
  }
  return best && { x: best.x, y: best.y, z: best.z };
}

/**
 * Streaming-hole check shared by the player and the car (ADR-007): once `position` has dropped
 * `floorRecoveryDrop` below `lastSafe`, looks straight down from just above the last safe height.
 * A walkable floor between there and the feet is one they fell through; returns its height.
 */
export function floorAboveFeet(
  world: WorldSource,
  ray: Ray,
  position: Vector3,
  lastSafe: Vector3,
  limits: { floorRecoveryDrop: number; floorRecoveryBand: number; minFloorNormalY: number },
): number | null {
  if (position.y > lastSafe.y - limits.floorRecoveryDrop) return null;
  const from = lastSafe.y + FLOOR_RECOVERY_LIFT;
  ray.origin.set(position.x, from, position.z);
  ray.direction.set(0, -1, 0);
  const hit = world.raycast(ray, from - position.y);
  if (!hit || hit.normal.y < limits.minFloorNormalY) return null;
  if (hit.point.y < lastSafe.y - limits.floorRecoveryBand) return null;
  return hit.point.y;
}
