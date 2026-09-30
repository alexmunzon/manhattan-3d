import { Ray, Vector3 } from 'three';
import { nextMode, type GameMode, type ModeEvent } from '../state/gameMode';
import { CAR, CarController } from '../vehicles/CarController';
import { findStreetLevel } from '../world/ground';
import type { WorldSource } from '../world/WorldSource';
import { GliderController, type GliderInput } from './GliderController';
import { findLedge, type LedgeTarget } from './ledge';
import { PlayerController, type MoveIntent } from './PlayerController';
import type { Pose } from './pose';

/** Everything the player asked for this frame. */
export interface CharacterInput extends MoveIntent {
  /** Toggle the glider (H). */
  glider: boolean;
  /** Enter, exit or call the car (V). */
  vehicle: boolean;
  /** Held brake while driving (Space). */
  handbrake: boolean;
}

const CLIMB_SECONDS = 0.7;
/** Fraction of the climb spent rising before moving onto the ledge. */
const CLIMB_RISE_PORTION = 0.65;
const LANDING_SPEED_KEPT = 0.5;
const SPRINT_POSE_SPEED = 6;
const IDLE_SPEED = 0.3;
/** Search radius around the configured spawn for street level. */
const SPAWN_SEARCH_RADIUS = 40;
const SPAWN_SETTLE_SECONDS = 1.5;
/** Cars within this distance can be entered; otherwise V calls the car to you. */
const ENTER_DISTANCE = 5;
const CAR_CALL_OFFSET = 3.5;
/** Candidate parking spots as (right, back) unit offsets from the player. */
const CAR_CALL_SPOTS = [
  [1, 0],
  [-1, 0],
  [0, 1.5],
  [0, -1.5],
] as const;
const CAR_CALL_MAX_STEP = 1;
/** Open road ahead that makes a parking spot good enough to stop searching. */
const CAR_CALL_ROAD = 40;
const EXIT_SIDE_OFFSET = CAR.halfWidth + 0.8;
export const NO_ROOM_FOR_TAXI = 'No room for the taxi here. Call it from an open street.';

/**
 * Owns the player's mode (on foot, climbing, gliding) and routes each frame to the one active
 * controller. All controllers share the same position and velocity vectors.
 */
export class Character {
  mode: GameMode = 'onFoot';
  readonly foot: PlayerController;
  readonly glider: GliderController;
  readonly car: CarController;
  /** True once the car has been placed in the world. */
  carPlaced = false;
  /** One-shot message for the HUD (for example, the taxi found no room). Cleared by `takeNotice`. */
  private pendingNotice: string | null = null;
  /** Facing yaw for the avatar (0 = north). */
  facing = 0;

  private climb: { from: Vector3; to: LedgeTarget; t: number } | null = null;
  private jumpedAt = -1;
  private time = 0;
  private settle = 0;
  private readonly forward = new Vector3();
  private readonly ray = new Ray();

  constructor(private readonly world: WorldSource) {
    this.foot = new PlayerController(world);
    this.glider = new GliderController(world);
    this.car = new CarController(world);
  }

  /**
   * Spawns on foot at street level near game-space (x, z) once tiles there have loaded and settled,
   * and parks the car beside the player. Call every frame until it returns true.
   */
  trySpawn(dt: number, x = 0, z = 0): boolean {
    if (this.world.heightAt(x, z) === null) {
      this.settle = 0;
      return false;
    }
    this.settle += dt;
    if (this.settle < SPAWN_SETTLE_SECONDS) return false;
    const street = findStreetLevel(this.world, x, z, SPAWN_SEARCH_RADIUS);
    if (!street) return false;
    this.foot.spawnAt(street.x, street.y, street.z);
    this.callCar(0);
    return true;
  }

  get position(): Vector3 {
    return this.foot.position;
  }

  get velocity(): Vector3 {
    return this.foot.velocity;
  }

  /** Horizontal speed in m/s. */
  get speed(): number {
    if (this.mode === 'gliding') return this.glider.airspeed;
    if (this.mode === 'driving') return Math.abs(this.car.speed);
    return this.foot.speed;
  }

  /** Height above the surface below, in metres, or null if nothing is below. */
  get altitude(): number | null {
    this.ray.origin.copy(this.position);
    this.ray.direction.set(0, -1, 0);
    return this.world.raycast(this.ray, 5_000)?.distance ?? null;
  }

  /**
   * Moves to game-space (x, z): the player waits (not simulated) until geometry there has loaded,
   * then spawns at street level with the car alongside.
   */
  teleport(x: number, z: number): void {
    this.climb = null;
    this.send('reset');
    this.parkCar();
    this.velocity.set(0, 0, 0);
    this.position.set(x, this.position.y, z);
    this.foot.spawned = false;
    this.settle = 0;
  }

  reset(): void {
    this.climb = null;
    this.send('reset');
    this.parkCar();
    this.foot.respawn();
  }

  /** Leaves the car where it is, stopped (it only moves while driven). */
  private parkCar(): void {
    this.car.speed = 0;
    this.car.verticalSpeed = 0;
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
      case 'driving':
        this.updateDrive(dt, input);
        break;
    }
  }

  /** Pose for the avatar view. */
  get pose(): Pose {
    if (this.mode === 'climbing') return 'climb';
    if (this.mode === 'gliding') return 'glide';
    if (this.mode === 'driving') return 'drive';
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
    if (input.vehicle && !airborne) {
      if (this.carPlaced && this.position.distanceTo(this.car.position) <= ENTER_DISTANCE) {
        this.velocity.set(0, 0, 0);
        this.position.copy(this.car.position); // camera and HUD follow the car from this frame
        this.send('enterCar');
        return;
      }
      this.callCar(cameraYaw);
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

  /**
   * Parks the car next to the player: tries right, left, behind, then ahead, each facing `yaw`,
   * the other way, and both sideways. A spot must be at the player's own ground level (never a
   * rooftop) and fit the car without touching a wall. The first with a long open road ahead wins;
   * otherwise the one with the most road, so the car points down the street when it can.
   */
  private callCar(yaw: number): void {
    let best: { x: number; z: number; yaw: number; road: number } | null = null;
    for (const [right, back] of CAR_CALL_SPOTS) {
      const x = this.position.x + (Math.cos(yaw) * right + Math.sin(yaw) * back) * CAR_CALL_OFFSET;
      const z = this.position.z + (-Math.sin(yaw) * right + Math.cos(yaw) * back) * CAR_CALL_OFFSET;
      const ground = this.world.heightAt(x, z);
      if (ground === null || Math.abs(ground - this.position.y) > CAR_CALL_MAX_STEP) continue;
      for (const heading of [yaw, yaw + Math.PI, yaw + Math.PI / 2, yaw - Math.PI / 2]) {
        if (!this.car.fits(x, ground, z, heading)) continue;
        const road = this.car.roadAhead(x, ground, z, heading, CAR_CALL_ROAD);
        if (road >= CAR_CALL_ROAD) {
          this.carPlaced = this.car.place(x, z, heading);
          return;
        }
        if (!best || road > best.road) best = { x, z, yaw: heading, road };
      }
    }
    if (best) this.carPlaced = this.car.place(best.x, best.z, best.yaw);
    else this.pendingNotice = NO_ROOM_FOR_TAXI;
  }

  /** Returns and clears the pending HUD message, if any. */
  takeNotice(): string | null {
    const notice = this.pendingNotice;
    this.pendingNotice = null;
    return notice;
  }

  private updateDrive(dt: number, input: CharacterInput): void {
    if (input.vehicle) {
      this.exitCar();
      return;
    }
    this.car.update(dt, {
      throttle: input.forward,
      steer: input.right,
      handbrake: input.handbrake,
    });
    this.position.copy(this.car.position);
    this.velocity.set(
      -Math.sin(this.car.yaw) * this.car.speed,
      this.car.verticalSpeed,
      -Math.cos(this.car.yaw) * this.car.speed,
    );
    this.facing = this.car.yaw;
  }

  /** Steps out on the driver's (left) side, or the passenger side if a wall blocks it. */
  private exitCar(): void {
    const { yaw } = this.car;
    const side = this.sideIsClear(-1, yaw) ? -1 : 1;
    this.position.set(
      this.car.position.x + side * Math.cos(yaw) * EXIT_SIDE_OFFSET,
      this.car.position.y + 0.5,
      this.car.position.z - side * Math.sin(yaw) * EXIT_SIDE_OFFSET,
    );
    this.velocity.set(0, 0, 0);
    this.car.speed = 0;
    this.foot.onGround = false;
    this.send('exitCar');
  }

  /** True if nothing blocks stepping out on `side` (-1 left, 1 right) of a car facing `yaw`. */
  private sideIsClear(side: number, yaw: number): boolean {
    this.ray.origin.copy(this.car.position);
    this.ray.origin.y += 1;
    this.ray.direction.set(side * Math.cos(yaw), 0, -side * Math.sin(yaw));
    return this.world.raycast(this.ray, EXIT_SIDE_OFFSET + 0.4) === null;
  }

  private send(event: ModeEvent): void {
    this.mode = nextMode(this.mode, event);
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 2;
}
