import type { Camera, Intersection, Object3D, Ray } from 'three';
import { Vector3 } from 'three';
import type { LocalFrame } from './geo';

/** Lifecycle state of a world source, surfaced to the HUD. */
export type WorldStatus =
  { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };

export type WorldDetail = 'high' | 'low';

/** A ray hit against world geometry, in game space. Reused between calls; copy to keep. */
export interface WorldHit {
  point: Vector3;
  /** Unit surface normal facing the ray origin. */
  normal: Vector3;
  distance: number;
}

/**
 * A provider of city geometry. Gameplay code depends only on this interface, so city providers
 * (the offline demo, Google 3D Tiles, or any future licensed source) are interchangeable.
 */
export interface WorldSource {
  /** Stable identifier, e.g. `demo` or `google`. */
  readonly id: string;
  /** Scene-graph root holding all of this source's renderable geometry. */
  readonly root: Object3D;
  /** Geographic anchor of game space. */
  readonly frame: LocalFrame;
  readonly status: WorldStatus;

  /** Loads the initial area around the frame origin. */
  load(): Promise<void>;
  /** Per-frame streaming update (tile selection, LOD, unloading). Must not allocate. */
  update(camera: Camera): void;
  /** Nearest hit along `ray` within `maxDistance` metres, or `null`. */
  raycast(ray: Ray, maxDistance: number): WorldHit | null;
  /** Height of the topmost surface at game-space (x, z), or `null` if nothing is loaded there. */
  heightAt(x: number, z: number): number | null;
  /** Also streams geometry for an extra camera (e.g. the minimap) rendered at width x height px. */
  addCamera(camera: Camera, width: number, height: number): void;
  /** Stops streaming for a camera added with {@link addCamera}. */
  removeCamera(camera: Camera): void;
  /** Trades visual detail for speed and bandwidth. */
  setDetail(detail: WorldDetail): void;
  /** Data credits that must be shown on screen while this source is visible. */
  attributions(): readonly string[];
  /** Releases all GPU and CPU resources. The source is unusable afterwards. */
  dispose(): void;
}

/**
 * Converts a three.js intersection into a {@link WorldHit}, writing into `out`.
 * The normal is flipped if needed so it always faces the ray (photogrammetry winding is unreliable).
 */
export function toWorldHit(hit: Intersection, ray: Ray, out: WorldHit): WorldHit {
  out.point.copy(hit.point);
  out.distance = hit.distance;
  if (hit.face) {
    out.normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    if (out.normal.dot(ray.direction) > 0) out.normal.negate();
  } else {
    out.normal.copy(ray.direction).negate();
  }
  return out;
}

/** Allocates a reusable {@link WorldHit}. */
export function createWorldHit(): WorldHit {
  return { point: new Vector3(), normal: new Vector3(), distance: 0 };
}
