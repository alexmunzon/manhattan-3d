import { Ray, Vector3 } from 'three';
import type { Character, CharacterInput } from '../player/Character';
import type { GameMode } from '../state/gameMode';
import type { WorldSource } from '../world/WorldSource';

/**
 * Scripted gameplay scenarios: a robot playtester that presses buttons frame by frame and checks
 * the game state after every frame. The same scenarios run in Vitest on the demo city and in the
 * browser (`?headless&selftest=…`) on Google tiles.
 */

export const NO_INPUT: Readonly<CharacterInput> = {
  forward: 0,
  right: 0,
  sprint: false,
  jump: false,
  glider: false,
  vehicle: false,
  handbrake: false,
};

/** What the robot does this frame. `yaw` overrides the camera heading when set. */
export interface Command {
  input: Partial<CharacterInput>;
  yaw?: number | undefined;
}

export interface ScenarioContext {
  readonly character: Character;
  readonly world: WorldSource;
  /** Where the player spawned; reset returns here. */
  readonly spawn: Vector3;
  /** Seconds since the current step began. */
  t: number;
  /** Named counts a scenario reports alongside pass/fail (e.g. ledges found). */
  readonly metrics: Record<string, number>;
}

export interface Step {
  name: string;
  /** Longest the step may run, in seconds, before it fails. */
  timeout: number;
  /** Runs once when the step begins. Returns a failure message if the step can't start. */
  begin?(ctx: ScenarioContext): string | undefined;
  /** Input for this frame, or 'done' once the step has finished. */
  tick(ctx: ScenarioContext): Command | 'done';
  /** Checked when the step ends. Returns a failure message, or undefined on success. */
  check?(ctx: ScenarioContext): string | undefined;
  /** Short note recorded on success (e.g. "no ledge here"). */
  note?(ctx: ScenarioContext): string | undefined;
}

export interface Scenario {
  name: string;
  steps: Step[];
  /** Keep going after a failed step (independent trials) instead of skipping the rest. */
  continueOnFail?: boolean;
}

export type StepStatus = 'pass' | 'fail' | 'skipped';

export interface StepResult {
  name: string;
  status: StepStatus;
  detail?: string | undefined;
  seconds: number;
}

export interface Violation {
  rule: string;
  detail: string;
  /** The last frames before it, oldest first: "y/ground?/floor below from 1 m up (Δ to feet)". */
  trace: string[];
  time: number;
  mode: GameMode;
  position: [number, number, number];
}

export interface ScenarioResult {
  name: string;
  passed: boolean;
  steps: StepResult[];
  violations: Violation[];
  metrics: Record<string, number>;
}

/** Thresholds for the per-frame checks. */
export const LIMITS = {
  /** No surface below for this long while airborne means the player fell through the world. */
  fallThroughSeconds: 0.5,
  /** Probe starts this far above the feet, so standing on a floor always finds it. */
  surfaceProbeLift: 0.5,
  /** A climb that takes longer than this is stuck. */
  maxClimbSeconds: 1,
  /** Camera further than this from the player, for longer than the grace period, is lost. */
  cameraMaxDistance: 15,
  cameraGraceSeconds: 0.5,
  /** Player moved this far in the window while the camera barely moved: stuck camera. */
  stuckWindowSeconds: 1,
  stuckPlayerMove: 2,
  stuckCameraMove: 0.25,
  /** Frame-to-frame moves longer than this are teleports (resets, scripted moves), not walking. */
  maxTunnelStep: 2,
  maxViolations: 20,
} as const;

/** Heights above the feet where a frame's movement must not cross a wall (above curbs and steps). */
const TUNNEL_PROBE_HEIGHTS = [1.0, 1.6] as const;
const WALL_NORMAL_MAX_Y = 0.6;
const AHEAD_PROBE = 1.5;
const AHEAD_HISTORY = 10;
/** Frames of state kept so each violation shows what led up to it. */
const TRACE_FRAMES = 12;

const MODES: readonly GameMode[] = ['onFoot', 'climbing', 'gliding', 'driving'];
const PROBE_DISTANCE = 5_000;

/** Checks the rules that must hold on every frame of every scenario. */
class InvariantMonitor {
  readonly violations: Violation[] = [];
  private readonly ray = new Ray(new Vector3(), new Vector3(0, -1, 0));
  private readonly lastCar = new Vector3();
  private noSurface = 0;
  private climbing = 0;
  private cameraFar = 0;
  private readonly trail: { time: number; player: Vector3; camera: Vector3 }[] = [];
  /** Rules currently in violation, so one episode is reported once, not every frame. */
  private readonly active = new Set<string>();
  private readonly lastPosition = new Vector3();
  private lastMode: GameMode;
  /** What was just ahead of the player in recent frames (m, or "-" for nothing). */
  private readonly ahead: string[] = [];
  private readonly dir = new Vector3();
  private readonly trace: string[] = [];
  private readonly probe = new Ray(new Vector3(), new Vector3(0, -1, 0));

  constructor(
    private readonly character: Character,
    private readonly world: WorldSource,
  ) {
    this.lastCar.copy(character.car.position);
    this.lastPosition.copy(character.position);
    this.lastMode = character.mode;
  }

  observe(dt: number, time: number, input: CharacterInput, camera?: Vector3): void {
    const c = this.character;
    const driving = c.mode === 'driving';
    this.recordTrace(time);

    this.rule('one-mode', !MODES.includes(c.mode), time, `unknown mode "${c.mode}"`);
    const finite = [...c.position.toArray(), ...c.velocity.toArray()].every(Number.isFinite);
    this.rule('finite', !finite, time, 'position or velocity is not a number');

    this.ray.origin.copy(c.position);
    this.ray.origin.y += LIMITS.surfaceProbeLift;
    const surface = this.world.raycast(this.ray, PROBE_DISTANCE);
    this.noSurface = !surface && !c.foot.onGround && !driving ? this.noSurface + dt : 0;
    this.rule(
      'fell-through',
      this.noSurface >= LIMITS.fallThroughSeconds,
      time,
      `no surface below for ${this.noSurface.toFixed(2)} s`,
    );

    this.climbing = c.mode === 'climbing' ? this.climbing + dt : 0;
    this.rule(
      'climb-stuck',
      this.climbing > LIMITS.maxClimbSeconds,
      time,
      `climbing for ${this.climbing.toFixed(2)} s`,
    );

    const inCar = c.position.distanceTo(c.car.position);
    this.rule('in-car', driving && inCar > 1e-6, time, `player is ${inCar.toFixed(2)} m from car`);
    const carMoved = c.car.position.distanceTo(this.lastCar) > 1e-6;
    // V on foot may call the car over; otherwise a car nobody is driving must stay put.
    this.rule(
      'car-parked',
      !driving && c.carPlaced && ((carMoved && !input.vehicle) || c.car.speed !== 0),
      time,
      `unattended car moved or kept speed ${c.car.speed.toFixed(2)} m/s`,
    );
    this.lastCar.copy(c.car.position);

    this.observeTunnel(time);
    if (camera) this.observeCamera(dt, time, camera);
  }

  private recordTrace(time: number): void {
    const c = this.character;
    this.probe.origin.set(c.position.x, c.position.y + 1, c.position.z);
    const floor = this.world.raycast(this.probe, 3);
    const below = floor ? (floor.point.y - c.position.y).toFixed(2) : '-';
    this.trace.push(
      `${time.toFixed(2)}s ${c.mode} y=${c.position.y.toFixed(2)} ` +
        `${c.foot.onGround ? 'ground' : 'air'} floorΔ=${below}`,
    );
    if (this.trace.length > TRACE_FRAMES) this.trace.shift();
  }

  /**
   * Walked (or drove) through a wall: this frame's move crossed a wall surface. The detail lists
   * what was just ahead in the frames before: a wall seen there means collision let the player
   * through; nothing seen means the geometry was missing (e.g. a tile swapping detail).
   */
  private observeTunnel(time: number): void {
    const c = this.character;
    const from = this.lastPosition;
    this.dir.set(c.position.x - from.x, 0, c.position.z - from.z);
    const step = this.dir.length();
    const walking = (c.mode === 'onFoot' || c.mode === 'driving') && c.mode === this.lastMode;
    let crossed: string | null = null;
    if (walking && step > 1e-4 && step < LIMITS.maxTunnelStep) {
      this.dir.divideScalar(step);
      for (const height of TUNNEL_PROBE_HEIGHTS) {
        this.ray.origin.set(from.x, from.y + height, from.z);
        this.ray.direction.copy(this.dir);
        const hit = this.world.raycast(this.ray, step);
        if (!hit || Math.abs(hit.normal.y) >= WALL_NORMAL_MAX_Y) continue;
        crossed =
          `crossed a wall at ${height} m moving ${step.toFixed(2)} m in one frame; ` +
          `ahead in previous frames: [${this.ahead.join(' ')}]`;
        break;
      }
    }
    this.rule('walked-through', crossed !== null, time, crossed ?? '');

    // Record what is just ahead now, along the direction of travel.
    if (step > 1e-4) {
      this.ray.origin.set(c.position.x, c.position.y + 1, c.position.z);
      this.ray.direction.copy(this.dir.normalize());
      const hit = this.world.raycast(this.ray, AHEAD_PROBE);
      this.ahead.push(hit ? hit.distance.toFixed(2) : '-');
      if (this.ahead.length > AHEAD_HISTORY) this.ahead.shift();
    }
    this.ray.direction.set(0, -1, 0);
    this.lastPosition.copy(c.position);
    this.lastMode = c.mode;
  }

  private observeCamera(dt: number, time: number, camera: Vector3): void {
    const distance = camera.distanceTo(this.character.position);
    this.cameraFar = distance > LIMITS.cameraMaxDistance ? this.cameraFar + dt : 0;
    this.rule(
      'camera-distance',
      this.cameraFar > LIMITS.cameraGraceSeconds,
      time,
      `camera ${distance.toFixed(1)} m from player`,
    );

    this.trail.push({ time, player: this.character.position.clone(), camera: camera.clone() });
    while (
      this.trail.length > 1 &&
      time - (this.trail[0]?.time ?? time) > LIMITS.stuckWindowSeconds
    ) {
      this.trail.shift();
    }
    const first = this.trail[0];
    const full = first !== undefined && time - first.time >= LIMITS.stuckWindowSeconds * 0.95;
    const moved = first ? first.player.distanceTo(this.character.position) : 0;
    const followed = first ? first.camera.distanceTo(camera) : 0;
    this.rule(
      'camera-stuck',
      full && moved > LIMITS.stuckPlayerMove && followed < LIMITS.stuckCameraMove,
      time,
      `player moved ${moved.toFixed(1)} m in 1 s, camera ${followed.toFixed(2)} m`,
    );
  }

  private rule(name: string, broken: boolean, time: number, detail: string): void {
    if (!broken) {
      this.active.delete(name);
      return;
    }
    if (this.active.has(name)) return;
    this.active.add(name);
    if (this.violations.length >= LIMITS.maxViolations) return;
    const p = this.character.position;
    this.violations.push({
      rule: name,
      detail,
      time: round(time),
      mode: this.character.mode,
      position: [round(p.x), round(p.y), round(p.z)],
      trace: [...this.trace],
    });
  }
}

/**
 * Plays one scenario. Each frame: call {@link next} for the input, update the game with it, then
 * call {@link observe}. Works with any frame driver (a Vitest loop or the browser game loop).
 */
export class ScenarioRun {
  readonly result: ScenarioResult;
  private readonly ctx: ScenarioContext;
  private readonly monitor: InvariantMonitor;
  private index = -1;
  private current: Step | null = null;
  private stepTime = 0;
  private time = 0;

  constructor(
    private readonly scenario: Scenario,
    character: Character,
    world: WorldSource,
    spawn: Vector3,
  ) {
    const metrics: Record<string, number> = {};
    this.ctx = { character, world, spawn: spawn.clone(), t: 0, metrics };
    this.monitor = new InvariantMonitor(character, world);
    this.result = {
      name: scenario.name,
      passed: false,
      steps: [],
      violations: this.monitor.violations,
      metrics,
    };
  }

  get done(): boolean {
    return this.index >= this.scenario.steps.length;
  }

  /** Input for this frame, or null once every step has finished. */
  next(dt: number): { input: CharacterInput; yaw?: number | undefined } | null {
    for (;;) {
      if (!this.current && !this.startNext()) return null;
      const step = this.current;
      if (!step) continue;
      this.ctx.t = this.stepTime;
      if (this.stepTime > step.timeout) {
        this.finish('fail', `timed out after ${step.timeout} s`);
        continue;
      }
      const command = step.tick(this.ctx);
      if (command === 'done') {
        const failure = step.check?.(this.ctx);
        this.finish(failure ? 'fail' : 'pass', failure ?? step.note?.(this.ctx));
        continue;
      }
      this.stepTime += dt;
      this.time += dt;
      return { input: { ...NO_INPUT, ...command.input }, yaw: command.yaw };
    }
  }

  /** Runs the per-frame checks. Call after the game has updated with this frame's input. */
  observe(dt: number, input: CharacterInput, camera?: Vector3): void {
    this.monitor.observe(dt, this.time, input, camera);
  }

  private startNext(): boolean {
    this.index++;
    const step = this.scenario.steps[this.index];
    if (!step) {
      this.close();
      return false;
    }
    this.current = step;
    this.stepTime = 0;
    this.ctx.t = 0;
    const failure = step.begin?.(this.ctx);
    if (failure) this.finish('fail', failure);
    return true;
  }

  private finish(status: StepStatus, detail?: string): void {
    const step = this.current;
    if (!step) return;
    this.result.steps.push({ name: step.name, status, detail, seconds: round(this.stepTime) });
    this.current = null;
    if (status === 'fail' && !this.scenario.continueOnFail) {
      for (const skipped of this.scenario.steps.slice(this.index + 1)) {
        this.result.steps.push({ name: skipped.name, status: 'skipped', seconds: 0 });
      }
      this.index = this.scenario.steps.length;
      this.close();
    }
  }

  private close(): void {
    this.result.passed =
      this.result.steps.every((s) => s.status === 'pass') && this.result.violations.length === 0;
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
