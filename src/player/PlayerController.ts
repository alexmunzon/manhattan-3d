import { Ray, Vector3 } from 'three';
import type { WorldSource } from '../world/WorldSource';

/** What the player wants to do this frame, independent of input device. */
export interface MoveIntent {
  /** -1..1, positive is away from the camera. */
  forward: number;
  /** -1..1, positive is camera-right. */
  right: number;
  sprint: boolean;
  jump: boolean;
}

export const PLAYER = {
  walkSpeed: 4.5,
  sprintSpeed: 9,
  groundAccel: 40,
  airAccel: 8,
  gravity: 22,
  jumpSpeed: 7.5,
  terminalSpeed: 55,
  radius: 0.35,
  /** Max ledge height walked up without jumping (curbs, stairs). */
  stepHeight: 0.45,
  /** How far below the feet ground is still "stuck to" when walking downhill. */
  groundSnap: 0.35,
  /** Surfaces with a normal Y below this are walls, above are floors. */
  minFloorNormalY: 0.6,
  /** Falling this far below the last safe spot counts as falling through the world. */
  fallLimit: 150,
  /**
   * Streaming tiles can briefly leave a hole while they swap detail levels. If the player has
   * dropped this far below where they stood, and the surface at their spot is back within
   * `floorRecoveryBand` of that height, they fell through their own floor: put them back on it.
   */
  floorRecoveryDrop: 3,
  floorRecoveryBand: 3,
  /** Wait this long after ground first appears, so tiles can refine before spawning. */
  spawnSettleSeconds: 1.5,
} as const;

const WALL_PROBE_HEIGHTS = [PLAYER.stepHeight + 0.05, 1.0, 1.6] as const;
const SLIDE_ITERATIONS = 2;
const GROUNDED_PROBE_LIFT = 1.0;

/**
 * Kinematic third-person character: walks, sprints, jumps, slides along walls and steps up curbs,
 * using only raycasts against the {@link WorldSource}. Works identically on any city provider.
 */
export class PlayerController {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  onGround = false;
  spawned = false;

  private readonly lastSafe = new Vector3();
  private readonly spawnPoint = new Vector3();
  private settleTimer = 0;
  private readonly ray = new Ray();
  private readonly delta = new Vector3();
  private readonly wishDir = new Vector3();
  private readonly wallNormal = new Vector3();

  constructor(private readonly world: WorldSource) {}

  /**
   * Places the player on the topmost surface at (x, z) once geometry there has loaded and settled.
   * Call every frame until it returns true.
   */
  trySpawn(x: number, z: number, dt: number): boolean {
    const ground = this.world.heightAt(x, z);
    if (ground === null) {
      this.settleTimer = 0;
      return false;
    }
    this.settleTimer += dt;
    if (this.settleTimer < PLAYER.spawnSettleSeconds) return false;
    this.spawnAt(x, ground, z);
    return true;
  }

  /** Sets the spawn point and places the player there immediately. */
  spawnAt(x: number, y: number, z: number): void {
    this.spawnPoint.set(x, y, z);
    this.respawn();
    this.spawned = true;
  }

  /** Returns to the spawn point, standing still. */
  respawn(): void {
    const ground = this.world.heightAt(this.spawnPoint.x, this.spawnPoint.z);
    if (ground !== null) this.spawnPoint.y = ground;
    this.position.copy(this.spawnPoint);
    this.lastSafe.copy(this.spawnPoint);
    this.velocity.set(0, 0, 0);
    this.onGround = true;
  }

  /** Advances the simulation by `dt` seconds. `yaw` is the camera heading (0 = facing north). */
  update(dt: number, intent: MoveIntent, yaw: number): void {
    if (!this.spawned) return;
    this.applyMovementInput(dt, intent, yaw);

    if (intent.jump && this.onGround) {
      this.velocity.y = PLAYER.jumpSpeed;
      this.onGround = false;
    }
    this.velocity.y = Math.max(this.velocity.y - PLAYER.gravity * dt, -PLAYER.terminalSpeed);

    this.moveHorizontally(dt);
    this.moveVertically(dt);

    if (!this.onGround) this.recoverFromFloorGap();
    if (this.position.y < this.lastSafe.y - PLAYER.fallLimit) {
      this.position.copy(this.lastSafe);
      this.velocity.set(0, 0, 0);
    }
  }

  private recoverFromFloorGap(): void {
    if (this.position.y > this.lastSafe.y - PLAYER.floorRecoveryDrop) return;
    const top = this.world.heightAt(this.position.x, this.position.z);
    if (top === null || Math.abs(top - this.lastSafe.y) > PLAYER.floorRecoveryBand) return;
    this.position.y = top;
    this.velocity.y = 0;
    this.onGround = true;
    this.lastSafe.copy(this.position);
  }

  /** Horizontal speed in m/s. */
  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  private applyMovementInput(dt: number, intent: MoveIntent, yaw: number): void {
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    // forward = (-sin, 0, -cos), right = (cos, 0, -sin)
    this.wishDir.set(
      -sin * intent.forward + cos * intent.right,
      0,
      -cos * intent.forward - sin * intent.right,
    );
    if (this.wishDir.lengthSq() > 1) this.wishDir.normalize();
    const topSpeed = intent.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const accel = (this.onGround ? PLAYER.groundAccel : PLAYER.airAccel) * dt;
    this.velocity.x = approach(this.velocity.x, this.wishDir.x * topSpeed, accel);
    this.velocity.z = approach(this.velocity.z, this.wishDir.z * topSpeed, accel);
  }

  private moveHorizontally(dt: number): void {
    this.delta.set(this.velocity.x * dt, 0, this.velocity.z * dt);
    for (let i = 0; i < SLIDE_ITERATIONS; i++) {
      const length = this.delta.length();
      if (length < 1e-6) break;
      if (!this.findWall(length)) break;
      // Remove the part of the move (and velocity) that points into the wall, then push out.
      const into = this.delta.dot(this.wallNormal);
      if (into < 0) this.delta.addScaledVector(this.wallNormal, -into);
      const vInto = this.velocity.x * this.wallNormal.x + this.velocity.z * this.wallNormal.z;
      if (vInto < 0) {
        this.velocity.x -= this.wallNormal.x * vInto;
        this.velocity.z -= this.wallNormal.z * vInto;
      }
    }
    this.position.add(this.delta);
  }

  /** Casts along the pending move at several body heights; stores the nearest wall normal. */
  private findWall(length: number): boolean {
    let nearest = Infinity;
    for (const height of WALL_PROBE_HEIGHTS) {
      this.ray.origin.set(this.position.x, this.position.y + height, this.position.z);
      this.ray.direction.copy(this.delta).divideScalar(length);
      const hit = this.world.raycast(this.ray, length + PLAYER.radius);
      if (!hit || hit.normal.y >= PLAYER.minFloorNormalY || hit.distance >= nearest) continue;
      nearest = hit.distance;
      this.wallNormal.set(hit.normal.x, 0, hit.normal.z).normalize();
      // Already closer than our radius: push back out along the wall normal.
      const overlap = PLAYER.radius - hit.distance;
      if (overlap > 0) this.position.addScaledVector(this.wallNormal, overlap);
    }
    return nearest < Infinity;
  }

  private moveVertically(dt: number): void {
    const targetY = this.position.y + this.velocity.y * dt;
    const falling = this.velocity.y <= 0;
    const lift = this.onGround ? GROUNDED_PROBE_LIFT : PLAYER.stepHeight;
    const snap = this.onGround && falling ? PLAYER.groundSnap : 0;
    this.ray.origin.set(this.position.x, this.position.y + lift, this.position.z);
    this.ray.direction.set(0, -1, 0);
    const reach = this.ray.origin.y - targetY + snap;
    const hit = falling ? this.world.raycast(this.ray, Math.max(reach, 0)) : null;

    if (hit && hit.normal.y >= PLAYER.minFloorNormalY) {
      this.position.y = hit.point.y;
      this.velocity.y = 0;
      this.onGround = true;
      this.lastSafe.copy(this.position);
    } else {
      this.position.y = targetY;
      this.onGround = false;
    }
  }
}

/** Moves `value` toward `target` by at most `step`. */
function approach(value: number, target: number, step: number): number {
  return value < target ? Math.min(value + step, target) : Math.max(value - step, target);
}
