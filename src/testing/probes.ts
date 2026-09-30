import { Ray, Vector3 } from 'three';
import { findLedge } from '../player/ledge';
import type { WorldSource } from '../world/WorldSource';

/**
 * Raycast helpers that let one scenario script find its way around any city: the demo grid or
 * real Google photogrammetry. They only read loaded geometry, like the game itself.
 */

const PROBE_HEIGHT = 1;
/** Second wall probe height: knee-high ledges, planters and plinths sit below the 1 m ray. */
const KNEE_HEIGHT = 0.5;
const WALL_NORMAL_MAX_Y = 0.7;
/** Stand this far in front of a wall face before trying to climb it. */
const STAND_OFF = 0.5;
const SAME_LEVEL = 0.5;
const ray = new Ray();

/** Camera yaw that makes "forward" point along `dir` (0 = north, matching the game). */
export function yawToward(dir: Vector3): number {
  return Math.atan2(-dir.x, -dir.z);
}

/** Unit horizontal forward vector for a camera yaw. */
export function forwardOf(yaw: number, out = new Vector3()): Vector3 {
  return out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
}

/** Clear horizontal distance from `from` (at knee-to-waist height) along `yaw`, up to `max`. */
export function clearance(world: WorldSource, from: Vector3, yaw: number, max: number): number {
  ray.origin.set(from.x, from.y + PROBE_HEIGHT, from.z);
  forwardOf(yaw, ray.direction);
  return world.raycast(ray, max)?.distance ?? max;
}

/** The heading (of `samples`) with the longest clear run from `from`. */
export function clearestHeading(
  world: WorldSource,
  from: Vector3,
  max = 80,
  samples = 24,
): { yaw: number; distance: number } {
  let best = { yaw: 0, distance: -1 };
  for (let i = 0; i < samples; i++) {
    const yaw = (i / samples) * Math.PI * 2;
    const distance = clearance(world, from, yaw, max);
    if (distance > best.distance) best = { yaw, distance };
  }
  return best;
}

/** A wall face the player can walk up to, and whether the game should find a ledge there. */
export interface WallSpot {
  /** Survey point on the street the wall was seen from, in a straight clear line. */
  origin: Vector3;
  /** Where to stand, facing the wall. */
  stand: Vector3;
  /** Camera yaw that faces the wall. */
  yaw: number;
  climbable: boolean;
}

/**
 * Finds distinct wall faces within `radius` of each origin, reachable in a straight line on the
 * same level. Nearest first; spots closer than `spacing` to an earlier one are skipped.
 */
export function findWalls(
  world: WorldSource,
  origins: readonly Vector3[],
  radius: number,
  count: number,
  spacing = 4,
  headings = 16,
): WallSpot[] {
  const found: (WallSpot & { distance: number })[] = [];
  const dir = new Vector3();
  for (const origin of origins) {
    for (let i = 0; i < headings; i++) {
      const yaw = (i / headings) * Math.PI * 2;
      forwardOf(yaw, dir);
      ray.direction.copy(dir);
      // The nearest face at either height: a plinth or sill is where the body actually stops.
      let hit: ReturnType<WorldSource['raycast']> = null;
      for (const height of [PROBE_HEIGHT, KNEE_HEIGHT]) {
        ray.origin.set(origin.x, origin.y + height, origin.z);
        const h = world.raycast(ray, hit?.distance ?? radius);
        if (h && Math.abs(h.normal.y) < WALL_NORMAL_MAX_Y) hit = h;
      }
      if (!hit || hit.distance < STAND_OFF * 2) continue;
      // Face the wall square-on (along its normal), as a player lining up a climb would.
      const facing = new Vector3(-hit.normal.x, 0, -hit.normal.z).normalize();
      const stand = hit.point.clone().addScaledVector(facing, -STAND_OFF);
      const floor = surfaceBelow(world, stand, origin.y + PROBE_HEIGHT);
      if (floor === null || Math.abs(floor - origin.y) > SAME_LEVEL) continue;
      stand.y = floor;
      if (found.some((s) => s.stand.distanceTo(stand) < spacing)) continue;
      const climbable = findLedge(world, stand, facing, false) !== null;
      found.push({ origin, stand, yaw: yawToward(facing), climbable, distance: hit.distance });
    }
  }
  return found
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count)
    .map(({ origin, stand, yaw, climbable }) => ({ origin, stand, yaw, climbable }));
}

/**
 * Survey points: `from` plus points every `spacing` metres down each clear street, so walls can
 * be found beyond the first corner. Every point is reachable from `from` in a straight line.
 */
export function surveyOrigins(
  world: WorldSource,
  from: Vector3,
  reach = 90,
  spacing = 12,
): Vector3[] {
  const origins = [from.clone()];
  const dir = new Vector3();
  for (let i = 0; i < 8; i++) {
    const yaw = (i / 8) * Math.PI * 2;
    const clear = clearance(world, from, yaw, reach);
    forwardOf(yaw, dir);
    for (let r = spacing; r < clear - 2; r += spacing) {
      origins.push(from.clone().addScaledVector(dir, r));
    }
  }
  return origins;
}

/** Height of the first surface below (x, fromY, z), or null. */
export function surfaceBelow(world: WorldSource, at: Vector3, fromY: number): number | null {
  ray.origin.set(at.x, fromY, at.z);
  ray.direction.set(0, -1, 0);
  return world.raycast(ray, 5_000)?.point.y ?? null;
}

/** True if nothing solid is directly above `feet` for a standing body. */
export function hasHeadroom(world: WorldSource, feet: Vector3, height = 1.7): boolean {
  ray.origin.set(feet.x, feet.y + 0.05, feet.z);
  ray.direction.set(0, 1, 0);
  return world.raycast(ray, height) === null;
}

/** A flat rooftop at least `minHeight` above `street`, and a heading toward its nearest edge. */
export interface Roof {
  top: Vector3;
  edgeYaw: number;
}

/** Searches a grid around `near` for a flat roof to glide from. */
export function findRoof(
  world: WorldSource,
  near: Vector3,
  street: number,
  minHeight = 25,
  radius = 200,
  step = 8,
): Roof | null {
  let best: { roof: Roof; d: number } | null = null;
  for (let dx = -radius; dx <= radius; dx += step) {
    for (let dz = -radius; dz <= radius; dz += step) {
      const d = Math.hypot(dx, dz);
      if (d > radius || (best && d >= best.d)) continue;
      const x = near.x + dx;
      const z = near.z + dz;
      const y = world.heightAt(x, z);
      if (y === null || y - street < minHeight || !isFlat(world, x, z, y)) continue;
      const edgeYaw = nearestDrop(world, x, z, y);
      if (edgeYaw === null) continue;
      best = { roof: { top: new Vector3(x, y, z), edgeYaw }, d };
    }
  }
  return best?.roof ?? null;
}

function isFlat(world: WorldSource, x: number, z: number, y: number, span = 3): boolean {
  for (const [ox, oz] of [
    [span, 0],
    [-span, 0],
    [0, span],
    [0, -span],
  ] as const) {
    const h = world.heightAt(x + ox, z + oz);
    if (h === null || Math.abs(h - y) > 0.5) return false;
  }
  return true;
}

/** Heading from (x, z) toward the closest point where the roof drops away by 10 m or more. */
function nearestDrop(world: WorldSource, x: number, z: number, y: number): number | null {
  const dir = new Vector3();
  for (let r = 2; r <= 60; r += 2) {
    for (let i = 0; i < 16; i++) {
      const yaw = (i / 16) * Math.PI * 2;
      forwardOf(yaw, dir);
      const h = world.heightAt(x + dir.x * r, z + dir.z * r);
      if (h !== null && y - h >= 10) return yaw;
    }
  }
  return null;
}
