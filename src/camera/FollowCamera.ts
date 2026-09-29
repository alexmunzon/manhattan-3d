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
  /** Per-second rate for blending distance/FOV between mode rigs. */
  rigBlendRate: 2.5,
  /** Per-second rate at which the camera swings behind a vehicle's heading. */
  recenterRate: 1.5,
} as const;

const WIDE_ZOOM_OFFSET = 6;

/** Per-mode camera framing (see docs/VISUAL_SPEC.md). */
export interface CameraRig {
  distance: number;
  fov: number;
  /** Height of the orbit pivot above the target's feet. */
  height: number;
}

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
  private rigDistance: number = FOLLOW_CAMERA.distance;
  private rigFov: number;
  private rigHeight: number = FOLLOW_CAMERA.pivotHeight;
  private pivotHeight: number = FOLLOW_CAMERA.pivotHeight;
  private zoomOffset = 0;

  constructor(private readonly camera: PerspectiveCamera) {
    this.rigFov = camera.fov;
  }

  /** Blends toward a new framing over a fraction of a second (no hard cuts). */
  setRig(rig: CameraRig): void {
    this.rigDistance = rig.distance;
    this.rigFov = rig.fov;
    this.rigHeight = rig.height;
  }

  /** Toggles between the default framing and a wide, pulled-back view (C key). */
  toggleWide(): void {
    this.zoomOffset = this.zoomOffset > 0 ? 0 : WIDE_ZOOM_OFFSET;
  }

  /** Swings the camera behind `heading` (e.g. the glider), unless the player is looking around. */
  recenter(heading: number, dt: number, lookActive: boolean): void {
    if (lookActive) return;
    const diff = Math.atan2(Math.sin(heading - this.yaw), Math.cos(heading - this.yaw));
    this.yaw += diff * Math.min(1, FOLLOW_CAMERA.recenterRate * dt);
  }

  /** Adjusts the preferred distance; positive zooms out. */
  zoom(steps: number): void {
    this.zoomOffset = Math.min(
      FOLLOW_CAMERA.maxDistance - FOLLOW_CAMERA.distance,
      Math.max(
        FOLLOW_CAMERA.minDistance - FOLLOW_CAMERA.distance,
        this.zoomOffset + steps * FOLLOW_CAMERA.zoomStep,
      ),
    );
  }

  update(dt: number, target: Vector3, look: { x: number; y: number }, world: WorldSource): void {
    this.yaw -= look.x * FOLLOW_CAMERA.sensitivity;
    this.pitch = Math.min(
      FOLLOW_CAMERA.maxPitch,
      Math.max(FOLLOW_CAMERA.minPitch, this.pitch - look.y * FOLLOW_CAMERA.sensitivity),
    );

    const blend = Math.min(1, FOLLOW_CAMERA.rigBlendRate * dt);
    const goal = Math.max(FOLLOW_CAMERA.minDistance, this.rigDistance + this.zoomOffset);
    this.desiredDistance += (goal - this.desiredDistance) * blend;
    if (Math.abs(this.camera.fov - this.rigFov) > 0.01) {
      this.camera.fov += (this.rigFov - this.camera.fov) * blend;
      this.camera.updateProjectionMatrix();
    }

    this.pivotHeight += (this.rigHeight - this.pivotHeight) * blend;
    this.pivot.set(target.x, target.y + this.pivotHeight, target.z);
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
