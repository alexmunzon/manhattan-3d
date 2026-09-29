import { Ray, Vector3, type PerspectiveCamera } from 'three';
import type { WorldSource } from '../world/WorldSource';

export const FOLLOW_CAMERA = {
  distance: 4,
  minDistance: 1.5,
  maxDistance: 14,
  pivotHeight: 1.6,
  /** Radians per pixel of mouse movement. */
  sensitivity: 0.0025,
  minPitch: -1.2,
  maxPitch: 0.7,
  /** Gap kept between the camera and any wall it is pulled in by. */
  wallPadding: 0.25,
  /** Per-second smoothing rates: pull in fast to avoid clipping, ease back out slowly. */
  pullInRate: 30,
  easeOutRate: 4,
  zoomStep: 0.8,
} as const;

/** Third-person orbit camera that follows a target and pulls in to avoid clipping into walls. */
export class FollowCamera {
  /** Heading in radians; 0 looks north (-z). */
  yaw = 0;
  pitch = -0.25;
  private desiredDistance: number = FOLLOW_CAMERA.distance;
  private currentDistance: number = FOLLOW_CAMERA.distance;
  private readonly pivot = new Vector3();
  private readonly back = new Vector3();
  private readonly ray = new Ray();

  constructor(private readonly camera: PerspectiveCamera) {}

  /** Adjusts the preferred distance; positive zooms out. */
  zoom(steps: number): void {
    this.desiredDistance = Math.min(
      FOLLOW_CAMERA.maxDistance,
      Math.max(FOLLOW_CAMERA.minDistance, this.desiredDistance + steps * FOLLOW_CAMERA.zoomStep),
    );
  }

  update(dt: number, target: Vector3, look: { x: number; y: number }, world: WorldSource): void {
    this.yaw -= look.x * FOLLOW_CAMERA.sensitivity;
    this.pitch = Math.min(
      FOLLOW_CAMERA.maxPitch,
      Math.max(FOLLOW_CAMERA.minPitch, this.pitch - look.y * FOLLOW_CAMERA.sensitivity),
    );

    this.pivot.set(target.x, target.y + FOLLOW_CAMERA.pivotHeight, target.z);
    // Unit vector from the pivot back toward the camera.
    const cosPitch = Math.cos(this.pitch);
    this.back.set(
      Math.sin(this.yaw) * cosPitch,
      -Math.sin(this.pitch),
      Math.cos(this.yaw) * cosPitch,
    );

    this.ray.origin.copy(this.pivot);
    this.ray.direction.copy(this.back);
    const hit = world.raycast(this.ray, this.desiredDistance + FOLLOW_CAMERA.wallPadding);
    const allowed = hit
      ? Math.max(FOLLOW_CAMERA.minDistance * 0.5, hit.distance - FOLLOW_CAMERA.wallPadding)
      : this.desiredDistance;
    const rate =
      allowed < this.currentDistance ? FOLLOW_CAMERA.pullInRate : FOLLOW_CAMERA.easeOutRate;
    this.currentDistance += (allowed - this.currentDistance) * Math.min(1, rate * dt);

    this.camera.position.copy(this.pivot).addScaledVector(this.back, this.currentDistance);
    this.camera.lookAt(this.pivot);
  }
}
