import { Ray, Vector3 } from 'three';
import type { WorldSource } from '../world/WorldSource';

/** Driver input, -1..1 per axis. */
export interface DriveInput {
  /** Positive = accelerate, negative = brake then reverse. */
  throttle: number;
  /** Positive = steer right. */
  steer: number;
  handbrake: boolean;
}

export const CAR = {
  maxSpeed: 32,
  maxReverse: 8,
  acceleration: 10,
  brakeDecel: 24,
  handbrakeDecel: 30,
  coastDecel: 2.5,
  maxSteer: 0.6,
  /** Steering authority left at top speed (fraction of maxSteer). */
  highSpeedSteer: 0.35,
  steerRate: 3,
  wheelBase: 2.6,
  halfLength: 2.1,
  halfWidth: 0.9,
  gravity: 22,
  /** Probe heights for walls; lower obstacles are driven over like curbs. */
  bumperHeights: [0.6, 1.1],
  /** Fraction of speed kept (reversed) when hitting a wall. */
  bounce: 0.25,
  groundSnap: 0.6,
  probeLift: 1.5,
  minFloorNormalY: 0.6,
  fallLimit: 150,
  /** Same streaming-hole recovery as the on-foot controller (see PLAYER.floorRecoveryDrop). */
  floorRecoveryDrop: 3,
  floorRecoveryBand: 3,
} as const;

/**
 * Arcade car driven by raycasts against the world: bicycle-model steering, four-corner ground
 * following (pitch and roll from the terrain), bumper probes for walls. It cannot flip; a car
 * that falls out of the world is returned to its last safe spot.
 */
export class CarController {
  readonly position = new Vector3();
  /** Heading in radians; 0 = north (-z). */
  yaw = 0;
  pitch = 0;
  roll = 0;
  /** Signed forward speed in m/s. */
  speed = 0;
  steer = 0;
  verticalSpeed = 0;
  onGround = true;

  private readonly lastSafe = new Vector3();
  private readonly ray = new Ray();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly corners = [0, 0, 0, 0];

  constructor(private readonly world: WorldSource) {}

  /** Places the car on the ground at (x, z) facing `yaw`. Returns false if nothing is loaded there. */
  place(x: number, z: number, yaw: number): boolean {
    const ground = this.world.heightAt(x, z);
    if (ground === null) return false;
    this.position.set(x, ground, z);
    this.lastSafe.copy(this.position);
    this.yaw = yaw;
    this.speed = 0;
    this.steer = 0;
    this.verticalSpeed = 0;
    this.pitch = 0;
    this.roll = 0;
    this.onGround = true;
    return true;
  }

  update(dt: number, input: DriveInput): void {
    this.applyThrottle(dt, input);
    this.applySteering(dt, input.steer);
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const travel = this.speed * dt;
    if (travel !== 0 && this.hitsWall(travel)) {
      this.speed = -this.speed * CAR.bounce;
    } else {
      this.position.addScaledVector(this.forward, travel);
    }
    this.followGround(dt);
    if (!this.onGround) this.recoverFromFloorGap();

    if (this.position.y < this.lastSafe.y - CAR.fallLimit) {
      this.position.copy(this.lastSafe);
      this.speed = 0;
      this.verticalSpeed = 0;
    }
  }

  private recoverFromFloorGap(): void {
    if (this.position.y > this.lastSafe.y - CAR.floorRecoveryDrop) return;
    const top = this.world.heightAt(this.position.x, this.position.z);
    if (top === null || Math.abs(top - this.lastSafe.y) > CAR.floorRecoveryBand) return;
    this.position.y = top;
    this.verticalSpeed = 0;
    this.onGround = true;
    this.lastSafe.copy(this.position);
  }

  private applyThrottle(dt: number, input: DriveInput): void {
    const { throttle } = input;
    if (input.handbrake) {
      this.speed = approach(this.speed, 0, CAR.handbrakeDecel * dt);
    } else if (throttle > 0) {
      this.speed =
        this.speed < 0
          ? approach(this.speed, 0, CAR.brakeDecel * dt)
          : Math.min(CAR.maxSpeed, this.speed + CAR.acceleration * throttle * dt);
    } else if (throttle < 0) {
      this.speed =
        this.speed > 0
          ? approach(this.speed, 0, CAR.brakeDecel * dt)
          : Math.max(-CAR.maxReverse, this.speed + CAR.acceleration * throttle * dt);
    } else {
      this.speed = approach(this.speed, 0, CAR.coastDecel * dt);
    }
  }

  private applySteering(dt: number, steerInput: number): void {
    const speedFactor = Math.min(1, Math.abs(this.speed) / CAR.maxSpeed);
    const authority = CAR.maxSteer * (1 - (1 - CAR.highSpeedSteer) * speedFactor);
    this.steer = approach(this.steer, steerInput * authority, CAR.steerRate * dt);
    if (!this.onGround) return;
    this.yaw -= (this.speed / CAR.wheelBase) * Math.tan(this.steer) * dt;
  }

  /** Casts from both front (or rear) corners at bumper heights along the direction of travel. */
  private hitsWall(travel: number): boolean {
    const direction = Math.sign(travel);
    const reach = Math.abs(travel) + 0.2;
    this.ray.direction.copy(this.forward).multiplyScalar(direction);
    for (const side of [-1, 1]) {
      for (const height of CAR.bumperHeights) {
        this.ray.origin
          .copy(this.position)
          .addScaledVector(this.forward, CAR.halfLength * direction)
          .addScaledVector(this.right, CAR.halfWidth * side);
        this.ray.origin.y += height;
        const hit = this.world.raycast(this.ray, reach);
        if (hit && hit.normal.y < CAR.minFloorNormalY) return true;
      }
    }
    return false;
  }

  /** Samples ground under each wheel to set height, pitch and roll; falls when unsupported. */
  private followGround(dt: number): void {
    let sum = 0;
    let hits = 0;
    let index = 0;
    for (const [f, r] of [
      [1, -1],
      [1, 1],
      [-1, -1],
      [-1, 1],
    ] as const) {
      this.ray.origin
        .copy(this.position)
        .addScaledVector(this.forward, CAR.halfLength * f)
        .addScaledVector(this.right, CAR.halfWidth * r);
      this.ray.origin.y += CAR.probeLift;
      this.ray.direction.set(0, -1, 0);
      const hit = this.world.raycast(this.ray, CAR.probeLift + CAR.groundSnap);
      const h = hit && hit.normal.y >= CAR.minFloorNormalY ? hit.point.y : Number.NaN;
      this.corners[index++] = h;
      if (!Number.isNaN(h)) {
        sum += h;
        hits++;
      }
    }

    const ground = hits > 0 ? sum / hits : Number.NaN;
    const falling = this.verticalSpeed <= 0;
    if (hits >= 2 && falling && this.position.y - ground <= CAR.groundSnap) {
      this.position.y = ground;
      this.verticalSpeed = 0;
      this.onGround = true;
      this.lastSafe.copy(this.position);
      const [fl, fr, rl, rr] = this.corners.map((c) => (Number.isNaN(c) ? ground : c)) as [
        number,
        number,
        number,
        number,
      ];
      this.pitch = Math.atan2((fl + fr - rl - rr) / 2, CAR.halfLength * 2);
      this.roll = Math.atan2((fl + rl - fr - rr) / 2, CAR.halfWidth * 2);
    } else {
      this.verticalSpeed -= CAR.gravity * dt;
      this.position.y += this.verticalSpeed * dt;
      this.onGround = false;
    }
  }
}

function approach(value: number, target: number, step: number): number {
  return value < target ? Math.min(value + step, target) : Math.max(value - step, target);
}
