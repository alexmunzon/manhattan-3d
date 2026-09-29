import { Ray, Vector3 } from 'three';
import { nextMode, type GameMode, type ModeEvent } from '../state/gameMode';
import type { WorldSource } from '../world/WorldSource';
import { GliderController, type GliderInput } from './GliderController';
import { findLedge, type LedgeTarget } from './ledge';
import { PlayerController, type MoveIntent } from './PlayerController';
import type { Pose } from './pose';

/** Everything the player asked for this frame. */
export interface CharacterInput extends MoveIntent {
  /** Toggle the glider (H). */
  glider: boolean;
}

const CLIMB_SECONDS = 0.7;
/** Fraction of the climb spent rising before moving onto the ledge. */
const CLIMB_RISE_PORTION = 0.65;
const LANDING_SPEED_KEPT = 0.5;
const SPRINT_POSE_SPEED = 6;
const IDLE_SPEED = 0.3;

/**
 * Owns the player's mode (on foot, climbing, gliding) and routes each frame to the one active
 * controller. All controllers share the same position and velocity vectors.
 */
export class Character {
  mode: GameMode = 'onFoot';
  readonly foot: PlayerController;
  readonly glider: GliderController;
  /** Facing yaw for the avatar (0 = north). */
  facing = 0;

  private climb: { from: Vector3; to: LedgeTarget; t: number } | null = null;
  private jumpedAt = -1;
  private time = 0;
  private readonly forward = new Vector3();
  private readonly ray = new Ray();

  constructor(private readonly world: WorldSource) {
    this.foot = new PlayerController(world);
    this.glider = new GliderController(world);
  }

  get position(): Vector3 {
    return this.foot.position;
  }

  get velocity(): Vector3 {
    return this.foot.velocity;
  }

  /** Horizontal speed in m/s. */
  get speed(): number {
    return this.mode === 'gliding' ? this.glider.airspeed : this.foot.speed;
  }

  /** Height above the surface below, in metres, or null if nothing is below. */
  get altitude(): number | null {
    this.ray.origin.copy(this.position);
    this.ray.direction.set(0, -1, 0);
    return this.world.raycast(this.ray, 5_000)?.distance ?? null;
  }

  reset(): void {
    this.climb = null;
    this.send('reset');
    this.foot.respawn();
  }

  update(dt: number, input: CharacterInput, cameraYaw: number): void {
    this.time += dt;
    switch (this.mode) {
      case 'onFoot':
        this.updateOnFoot(dt, input, cameraYaw);
        break;
      case 'climbing':
        this.updateClimb(dt);
        break;
      case 'gliding':
        this.updateGlide(dt, input);
        break;
    }
  }

  /** Pose for the avatar view. */
  get pose(): Pose {
    if (this.mode === 'climbing') return 'climb';
    if (this.mode === 'gliding') return 'glide';
    if (!this.foot.onGround) return this.time - this.jumpedAt < 0.35 ? 'jump' : 'fall';
    if (this.foot.speed < IDLE_SPEED) return 'idle';
    return this.foot.speed > SPRINT_POSE_SPEED ? 'sprint' : 'run';
  }

  private updateOnFoot(dt: number, input: CharacterInput, cameraYaw: number): void {
    const airborne = !this.foot.onGround;
    if (input.jump) {
      this.forward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
      const ledge = findLedge(this.world, this.position, this.forward, airborne);
      if (ledge) {
        this.startClimb(ledge);
        return;
      }
    }
    if (input.glider && airborne && this.glider.canDeploy(this.position)) {
      this.glider.deploy(this.velocity, cameraYaw);
      this.send('deployGlider');
      return;
    }
    if (input.jump && !airborne) this.jumpedAt = this.time;
    this.foot.update(dt, input, cameraYaw);
    if (this.foot.speed > IDLE_SPEED) {
      this.facing = Math.atan2(-this.velocity.x, -this.velocity.z);
    }
  }

  private startClimb(ledge: LedgeTarget): void {
    this.climb = { from: this.position.clone(), to: ledge, t: 0 };
    this.facing = Math.atan2(-(ledge.top.x - this.position.x), -(ledge.top.z - this.position.z));
    this.velocity.set(0, 0, 0);
    this.send('climb');
  }

  private updateClimb(dt: number): void {
    if (!this.climb) return;
    const c = this.climb;
    c.t = Math.min(1, c.t + dt / CLIMB_SECONDS);
    const rise = Math.min(1, c.t / CLIMB_RISE_PORTION);
    const across = Math.max(0, (c.t - CLIMB_RISE_PORTION) / (1 - CLIMB_RISE_PORTION));
    this.position.set(
      c.from.x + (c.to.top.x - c.from.x) * across,
      c.from.y + (c.to.top.y - c.from.y) * easeOut(rise),
      c.from.z + (c.to.top.z - c.from.z) * across,
    );
    if (c.t >= 1) {
      this.climb = null;
      this.foot.onGround = true;
      this.send('climbDone');
    }
  }

  private updateGlide(dt: number, input: CharacterInput): void {
    if (input.glider) {
      this.send('stowGlider');
      this.foot.onGround = false;
      return;
    }
    const steer: GliderInput = { pitch: input.forward, roll: input.right };
    const outcome = this.glider.update(dt, steer, this.position, this.velocity);
    this.facing = this.glider.yaw;
    if (outcome === 'flying') return;

    if (outcome === 'landed') {
      this.velocity.multiplyScalar(LANDING_SPEED_KEPT).setY(0);
      this.foot.onGround = true;
    } else {
      this.velocity.set(0, 0, 0); // crashed into a wall: drop and fall
      this.foot.onGround = false;
    }
    this.send('land');
  }

  private send(event: ModeEvent): void {
    this.mode = nextMode(this.mode, event);
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 2;
}
