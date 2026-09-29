import { Ray, Vector3 } from 'three';
import type { WorldSource } from '../world/WorldSource';

/** Steering input for the glider, -1..1 per axis. */
export interface GliderInput {
  /** Positive = nose down (dive, gain speed). */
  pitch: number;
  /** Positive = bank right. */
  roll: number;
}

export const GLIDER = {
  gravity: 9.81,
  /** Glide-path angles in radians: neutral, full dive, full flare. */
  neutralPath: -0.14,
  divePath: -0.45,
  flarePath: 0.08,
  /** Quadratic drag chosen so the neutral glide settles at ~16 m/s (36 mph). */
  drag: 0.0053,
  minDeploySpeed: 10,
  stallSpeed: 7,
  maxSpeed: 45,
  maxBank: 0.6,
  bankRate: 2.5,
  pathRate: 1.5,
  /** Minimum clearance under the player to open the glider. */
  minDeployHeight: 4,
  /** Probe length for detecting touchdown. */
  landingClearance: 0.4,
  minFloorNormalY: 0.6,
} as const;

export type GlideOutcome = 'flying' | 'landed' | 'crashed';

/**
 * Arcade hang glider: a point mass flying along a glide path. Diving trades height for speed,
 * flaring trades speed for height, banking turns. Not a physical flight model.
 */
export class GliderController {
  /** Heading in radians; 0 = north (-z). */
  yaw = 0;
  bank = 0;
  airspeed = 0;
  private path: number = GLIDER.neutralPath;
  private readonly ray = new Ray();
  private readonly step = new Vector3();

  constructor(private readonly world: WorldSource) {}

  /** True if there is enough air under `feet` to open the glider. */
  canDeploy(feet: Vector3): boolean {
    this.ray.origin.copy(feet);
    this.ray.direction.set(0, -1, 0);
    return this.world.raycast(this.ray, GLIDER.minDeployHeight) === null;
  }

  /** Opens the glider, carrying over the player's current momentum. */
  deploy(velocity: Vector3, yaw: number): void {
    const horizontal = Math.hypot(velocity.x, velocity.z);
    this.yaw = horizontal > 1 ? Math.atan2(-velocity.x, -velocity.z) : yaw;
    this.airspeed = Math.max(GLIDER.minDeploySpeed, horizontal);
    this.path = GLIDER.neutralPath;
    this.bank = 0;
  }

  /** Advances the flight, moving `position` and writing world velocity into `velocity`. */
  update(dt: number, input: GliderInput, position: Vector3, velocity: Vector3): GlideOutcome {
    this.bank = approach(this.bank, input.roll * GLIDER.maxBank, GLIDER.bankRate * dt);
    let targetPath =
      input.pitch >= 0
        ? lerp(GLIDER.neutralPath, GLIDER.divePath, input.pitch)
        : lerp(GLIDER.neutralPath, GLIDER.flarePath, -input.pitch);
    if (this.airspeed < GLIDER.stallSpeed) targetPath = GLIDER.divePath; // stall: nose drops
    this.path = approach(this.path, targetPath, GLIDER.pathRate * dt);

    const accel = -GLIDER.gravity * Math.sin(this.path) - GLIDER.drag * this.airspeed ** 2;
    this.airspeed = Math.min(GLIDER.maxSpeed, Math.max(0, this.airspeed + accel * dt));
    this.yaw -= ((GLIDER.gravity * Math.tan(this.bank)) / Math.max(this.airspeed, 1)) * dt;

    const cosPath = Math.cos(this.path);
    velocity.set(
      -Math.sin(this.yaw) * cosPath * this.airspeed,
      Math.sin(this.path) * this.airspeed,
      -Math.cos(this.yaw) * cosPath * this.airspeed,
    );

    // Obstacle ahead along the flight path?
    this.step.copy(velocity).multiplyScalar(dt);
    const distance = this.step.length();
    this.ray.origin.copy(position).y += 1;
    this.ray.direction.copy(this.step).divideScalar(distance || 1);
    const hit = distance > 0 ? this.world.raycast(this.ray, distance + 0.5) : null;
    if (hit && hit.normal.y < GLIDER.minFloorNormalY) return 'crashed';

    position.add(this.step);

    // Touchdown: walkable ground just under the feet.
    this.ray.origin.set(position.x, position.y + 0.5, position.z);
    this.ray.direction.set(0, -1, 0);
    const ground = this.world.raycast(this.ray, 0.5 + GLIDER.landingClearance);
    if (ground && ground.normal.y >= GLIDER.minFloorNormalY) {
      position.y = ground.point.y;
      return 'landed';
    }
    return 'flying';
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function approach(value: number, target: number, step: number): number {
  return value < target ? Math.min(value + step, target) : Math.max(value - step, target);
}
