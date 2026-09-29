import type { Camera, Object3D, Ray } from 'three';
import type { LocalFrame, Vec3 } from './geo';

/** Lifecycle state of a world source, surfaced to the HUD. */
export type WorldStatus =
  { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };

/** A ray hit against world geometry, in game space. */
export interface WorldHit {
  point: Vec3;
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
  /** Data credits that must be shown on screen while this source is visible. */
  attributions(): readonly string[];
  /** Releases all GPU and CPU resources. The source is unusable afterwards. */
  dispose(): void;
}
