import { Vector3 } from 'three';
import type { Character, CharacterInput } from '../player/Character';
import { createRandom } from '../world/random';
import {
  clearance,
  clearestHeading,
  findRoof,
  findWalls,
  forwardOf,
  hasHeadroom,
  surfaceBelow,
  surveyOrigins,
  yawToward,
  type Roof,
  type WallSpot,
} from './probes';
import type { Command, Scenario, ScenarioContext, Step } from './scenario';

/**
 * The gameplay test cases. Each factory returns a fresh scenario (steps keep state in closures).
 * Steps marked "scripted" move the player directly where the demo city has no way to get there
 * (e.g. no stairs to a tall roof); everything else is done with the same inputs a player uses.
 */

const IDLE: Command = { input: {} };
const ENTER_DISTANCE = 5;
const SURVEY_RADIUS = 40;
/** A climb must rise at least this much and no more than a mid-air ledge allows. */
const CLIMB_RISE = { min: 0.5, max: 3.0 } as const;
const STOPPED = 0.5;
const LIFT_HEIGHT = 40;
const WIDE_SEARCH_RADIUS = 150;
const SEARCH_SECONDS = 20;
/** After a scripted move, wait for this long with no tiles streaming (at most the max). */
const SETTLE_QUIET_SECONDS = 0.5;
const SETTLE_MAX_SECONDS = 10;
const SETTLE_PROBE_LIFT = 4;
/** Lower Manhattan streets slope; street spots may sit this far above or below spawn. */
const STREET_GRADE = 3;

// ---------- building blocks ----------

/** Holds `input` for `seconds`. */
function hold(
  name: string,
  seconds: number,
  input: Partial<CharacterInput>,
  opts: { yaw?: (ctx: ScenarioContext) => number; check?: Step['check'] } = {},
): Step {
  return {
    name,
    timeout: seconds + 1,
    tick: (ctx) => (ctx.t >= seconds ? 'done' : { input, yaw: opts.yaw?.(ctx) }),
    ...(opts.check && { check: opts.check }),
  };
}

/** Presses a key for one frame, then waits `settle` seconds before checking. */
function press(
  name: string,
  key: 'jump' | 'vehicle' | 'glider',
  opts: { yaw?: (ctx: ScenarioContext) => number; settle?: number; check?: Step['check'] } = {},
): Step {
  const settle = opts.settle ?? 0;
  let pressed = false;
  return {
    name,
    timeout: settle + 1,
    begin: () => {
      pressed = false;
      return undefined;
    },
    tick: (ctx) => {
      const yaw = opts.yaw?.(ctx);
      if (!pressed) {
        pressed = true;
        return { input: { [key]: true }, yaw };
      }
      return ctx.t >= settle ? 'done' : { input: {}, yaw };
    },
    ...(opts.check && { check: opts.check }),
  };
}

/** Command that walks straight toward `target`, or 'done' once there. */
function walkToward(c: Character, target: Vector3, within = 0.3): Command | 'done' {
  const d = target.clone().sub(c.position).setY(0);
  if (d.length() < within) return 'done';
  return { input: { forward: 1 }, yaw: yawToward(d) };
}

/**
 * After a scripted move: keeps the player on the current floor until tiles there stop streaming,
 * the way the game's own teleport waits before spawning. Real players never arrive mid-download.
 */
function settler(): { start(t: number): void; busy(ctx: ScenarioContext): boolean } {
  let started = 0;
  let quietSince = 0;
  return {
    start(t) {
      started = t;
      quietSince = t;
    },
    busy(ctx) {
      if (ctx.world.streaming) quietSince = ctx.t;
      const settled = ctx.t - quietSince >= SETTLE_QUIET_SECONDS;
      if (settled || ctx.t - started > SETTLE_MAX_SECONDS) return false;
      const c = ctx.character;
      const floor = surfaceBelow(ctx.world, c.position, c.position.y + SETTLE_PROBE_LIFT);
      if (floor !== null) c.foot.placeAt(c.position.x, floor, c.position.z);
      return true;
    },
  };
}

const horizontal = (a: Vector3, b: Vector3): number => Math.hypot(a.x - b.x, a.z - b.z);

function expectMode(c: Character, mode: Character['mode']): string | undefined {
  return c.mode === mode ? undefined : `expected ${mode}, got ${c.mode}`;
}

/** Standing on something, with room for a body: not floating and not inside a wall. */
function standingCheck(ctx: ScenarioContext): string | undefined {
  const c = ctx.character;
  if (!c.foot.onGround) return 'not standing on the ground';
  const floor = surfaceBelow(ctx.world, c.position, c.position.y + 0.3);
  if (floor === null || c.position.y - floor > 0.3) return 'floating: no floor under the feet';
  if (!hasHeadroom(ctx.world, c.position)) return 'inside geometry: no headroom';
  return undefined;
}

function resetCheck(ctx: ScenarioContext): string | undefined {
  const c = ctx.character;
  return (
    expectMode(c, 'onFoot') ??
    (horizontal(c.position, ctx.spawn) > 0.5
      ? `${horizontal(c.position, ctx.spawn).toFixed(1)} m from spawn`
      : undefined) ??
    (c.car.speed !== 0 ? `parked car still has speed ${c.car.speed.toFixed(1)} m/s` : undefined) ??
    standingCheck(ctx)
  );
}

/** Presses R (the game calls `reset()`), then checks the player is back at spawn. */
function resetStep(name = 'reset (R)'): Step {
  return {
    name,
    timeout: 2,
    begin: (ctx) => {
      ctx.character.reset();
      return undefined;
    },
    tick: (ctx) => (ctx.t >= 1 ? 'done' : IDLE),
    check: resetCheck,
  };
}

interface Plan {
  wall?: WallSpot | undefined;
  driveYaw: number;
  start: Vector3;
  roof?: Roof | null;
}

/**
 * Finds a climbable wall and walks to it: down the street, then across to the wall. If none is in
 * walking reach, searches street spots up to 150 m away and moves there first (scripted), since
 * real low ledges are rare on photogrammetry.
 */
function walkToClimbableWall(plan: Plan): Step {
  let leg = 0;
  let moved = 0;
  let nextSearch = 0;
  const settle = settler();
  let settling = false;
  /** Distant tiles sharpen after spawn, so a failed search is retried for a while. */
  const search = (ctx: ScenarioContext): void => {
    const c = ctx.character;
    const near = surveyOrigins(ctx.world, c.position);
    plan.wall = findWalls(ctx.world, near, SURVEY_RADIUS, 200).find((w) => w.climbable);
    if (plan.wall) return;
    const far = streetGrid(ctx.world, c.position, ctx.spawn.y, WIDE_SEARCH_RADIUS);
    plan.wall = findWalls(ctx.world, far, 15, 400).find((w) => w.climbable);
    if (!plan.wall) return;
    // Scripted move to the far street spot. Its height came from blurry distant tiles, so hold
    // the player on the current floor while tiles there sharpen, then search again up close.
    moved = horizontal(c.position, plan.wall.origin);
    const o = plan.wall.origin;
    c.foot.placeAt(o.x, o.y, o.z);
    plan.wall = undefined;
    settle.start(ctx.t);
    settling = true;
  };
  return {
    name: 'walk to a climbable wall',
    timeout: 70,
    begin: () => {
      leg = 0;
      moved = 0;
      nextSearch = 0;
      settling = false;
      plan.wall = undefined;
      return undefined;
    },
    tick: (ctx) => {
      if (settling) {
        if (settle.busy(ctx)) return IDLE;
        settling = false;
        nextSearch = ctx.t;
      }
      if (!plan.wall && ctx.t >= nextSearch) {
        nextSearch = ctx.t + 2;
        search(ctx);
      }
      const wall = plan.wall;
      if (!wall) return ctx.t > SEARCH_SECONDS + SETTLE_MAX_SECONDS ? 'done' : IDLE;
      if (leg === 0) {
        if (walkToward(ctx.character, wall.origin) !== 'done') {
          return walkToward(ctx.character, wall.origin);
        }
        leg = 1;
      }
      return walkToward(ctx.character, wall.stand, 0.15);
    },
    check: (ctx) =>
      plan.wall
        ? standingCheck(ctx)
        : `no climbable ledge found within ${WIDE_SEARCH_RADIUS} m after ${SEARCH_SECONDS} s`,
    note: () => (moved > 0 ? `scripted: moved ${moved.toFixed(0)} m to reach a ledge` : undefined),
  };
}

/** Street-level spots (top surface within {@link STREET_GRADE} of `street`) on a grid around `center`. */
function streetGrid(
  world: ScenarioContext['world'],
  center: Vector3,
  street: number,
  radius: number,
  step = 10,
): Vector3[] {
  const spots: Vector3[] = [];
  for (let dx = -radius; dx <= radius; dx += step) {
    for (let dz = -radius; dz <= radius; dz += step) {
      if (Math.hypot(dx, dz) > radius) continue;
      const x = center.x + dx;
      const z = center.z + dz;
      const y = world.heightAt(x, z);
      if (y !== null && Math.abs(y - street) < STREET_GRADE) spots.push(new Vector3(x, y, z));
    }
  }
  return spots;
}

/** Keeps walking into the wall: the player must stop in front of it, not pass through. */
function wallStop(plan: Plan): Step {
  const SECONDS = 0.8;
  let from = new Vector3();
  let face = 0;
  return {
    name: 'walk into the wall and stop',
    timeout: SECONDS + 1,
    begin: (ctx) => {
      from = ctx.character.position.clone();
      // Knee-high ledges count too, so measure the face at knee height as well as 1 m.
      const knee = from.clone().setY(from.y - 0.5);
      const yaw = plan.wall?.yaw ?? 0;
      face = Math.min(clearance(ctx.world, from, yaw, 2), clearance(ctx.world, knee, yaw, 2));
      return face >= 2 ? 'no wall ahead to walk into' : undefined;
    },
    tick: (ctx) => (ctx.t >= SECONDS ? 'done' : { input: { forward: 1 }, yaw: plan.wall?.yaw }),
    // Photogrammetry reshapes a little as tiles refine, so judge by where the wall face was when
    // the step began: the player must stop, and must not end up past that face.
    check: (ctx) => {
      const c = ctx.character;
      const forward = forwardOf(plan.wall?.yaw ?? 0);
      const progress = c.position.clone().sub(from).dot(forward);
      if (progress > face) {
        return `walked ${progress.toFixed(2)} m, past the wall face ${face.toFixed(2)} m ahead`;
      }
      if (c.foot.speed > STOPPED) return `still moving at ${c.foot.speed.toFixed(1)} m/s`;
      return undefined;
    },
  };
}

/** Presses Space at the wall and waits for the climb to finish on top. */
function climbLedge(plan: Plan): Step {
  let pressed = false;
  let started = false;
  return {
    name: 'climb the ledge (Space)',
    timeout: 2,
    begin: (ctx) => {
      pressed = false;
      started = false;
      plan.start = ctx.character.position.clone();
      return undefined;
    },
    tick: (ctx) => {
      const c = ctx.character;
      if (!pressed) {
        pressed = true;
        return { input: { jump: true }, yaw: plan.wall?.yaw };
      }
      if (c.mode === 'climbing') started = true;
      return started && c.mode === 'onFoot' ? 'done' : IDLE;
    },
    check: (ctx) => {
      const rise = ctx.character.position.y - plan.start.y;
      if (rise < CLIMB_RISE.min || rise > CLIMB_RISE.max) return `climb rose ${rise.toFixed(2)} m`;
      return standingCheck(ctx);
    },
  };
}

/** Walks back off the low roof onto the street. */
function dropToStreet(plan: Plan): Step {
  return {
    name: 'walk back down to the street',
    timeout: 5,
    tick: (ctx) => {
      const c = ctx.character;
      // Back at the height the climb started from (streets slope, so not the spawn height).
      const down = c.position.y - plan.start.y < 0.5 && c.foot.onGround && ctx.t > 0.3;
      return down ? 'done' : { input: { forward: 1 }, yaw: (plan.wall?.yaw ?? 0) + Math.PI };
    },
    check: standingCheck,
  };
}

/** V: calls the taxi over if it's far away (parks facing the clearest street). */
function callTaxi(plan: Plan): Step {
  return press('call the taxi (V)', 'vehicle', {
    yaw: (ctx) => {
      if (ctx.t === 0) plan.driveYaw = clearestHeading(ctx.world, ctx.character.position).yaw;
      return plan.driveYaw;
    },
    check: (ctx) => {
      const c = ctx.character;
      if (c.mode === 'driving') return undefined; // it was already close enough to get in
      const d = c.position.distanceTo(c.car.position);
      return d <= ENTER_DISTANCE ? undefined : `taxi is still ${d.toFixed(1)} m away`;
    },
  });
}

function enterTaxi(): Step {
  const step = press('enter the taxi (V)', 'vehicle', {
    check: (ctx) => expectMode(ctx.character, 'driving'),
  });
  // If calling the taxi already got us in, pressing V again would get us out.
  return { ...step, tick: (ctx) => (ctx.character.mode === 'driving' ? 'done' : step.tick(ctx)) };
}

/**
 * Full throttle, steering toward the clearest street like a player would. If the taxi is parked
 * nose-in to something, it first backs out for a second while steering.
 */
function drive(plan: Plan, seconds: number): Step {
  const REVERSE_SECONDS = 1;
  let target = 0;
  let nextAim = 0;
  let reverseUntil = -1;
  let driveFrom = 0;
  return {
    name: `drive for ${seconds} s (W, steering)`,
    timeout: seconds + REVERSE_SECONDS + 2,
    begin: (ctx) => {
      plan.start = ctx.character.car.position.clone();
      nextAim = 0;
      reverseUntil = -1;
      driveFrom = 0;
      return undefined;
    },
    tick: (ctx) => {
      const car = ctx.character.car;
      if (ctx.t >= nextAim) {
        nextAim = ctx.t + 0.5;
        target = clearestHeading(ctx.world, car.position).yaw;
      }
      const diff = Math.atan2(Math.sin(target - car.yaw), Math.cos(target - car.yaw));
      // Positive steer turns clockwise (yaw decreases), so steer against the heading error.
      const steer = Math.max(-1, Math.min(1, -diff * 1.5));
      const stuck = reverseUntil < 0 && ctx.t > 0.5 && Math.abs(car.speed) < STOPPED;
      if (stuck) {
        reverseUntil = ctx.t + REVERSE_SECONDS;
        driveFrom = reverseUntil;
      }
      if (ctx.t < reverseUntil) return { input: { forward: -1, right: -steer } };
      return ctx.t - driveFrom >= seconds ? 'done' : { input: { forward: 1, right: steer } };
    },
    check: (ctx) => {
      const c = ctx.character;
      const travelled = horizontal(c.car.position, plan.start);
      if (c.speed < 10) return `only ${c.speed.toFixed(1)} m/s after ${seconds} s`;
      if (travelled < 20) return `only travelled ${travelled.toFixed(1)} m`;
      if (!c.car.onGround) return 'wheels are off the ground';
      return undefined;
    },
    note: () => (reverseUntil > 0 ? 'backed out first: taxi was parked nose-in' : undefined),
  };
}

function brake(): Step {
  return {
    name: 'brake to a stop (Space)',
    timeout: 5,
    tick: (ctx) =>
      Math.abs(ctx.character.car.speed) < STOPPED ? 'done' : { input: { handbrake: true } },
  };
}

function exitTaxi(): Step {
  return press('exit the taxi (V)', 'vehicle', {
    settle: 1,
    check: (ctx) => {
      const c = ctx.character;
      const d = horizontal(c.position, c.car.position);
      return (
        expectMode(c, 'onFoot') ??
        (d > 3 ? `landed ${d.toFixed(1)} m from the taxi` : undefined) ??
        standingCheck(ctx)
      );
    },
  });
}

/** Scripted: stands the player on a tall roof (the demo city has no stairs). */
function goToRoof(plan: Plan): Step {
  const settle = settler();
  let settledAt = -1;
  return {
    name: 'go up to a tall roof (scripted)',
    timeout: SETTLE_MAX_SECONDS + 2,
    begin: (ctx) => {
      settle.start(0);
      settledAt = -1;
      plan.roof = findRoof(ctx.world, ctx.character.position, ctx.spawn.y);
      const roof = plan.roof;
      if (!roof) return 'no flat roof 25 m+ tall within 200 m';
      const c = ctx.character;
      c.foot.placeAt(roof.top.x, roof.top.y, roof.top.z);
      return undefined;
    },
    tick: (ctx) => {
      if (settle.busy(ctx)) return IDLE;
      if (settledAt < 0) settledAt = ctx.t;
      return ctx.t - settledAt >= 0.5 ? 'done' : IDLE;
    },
    check: standingCheck,
  };
}

function walkOffEdge(plan: Plan): Step {
  return {
    name: 'run off the roof edge',
    timeout: 20,
    tick: (ctx) => {
      const c = ctx.character;
      if (!c.foot.onGround && (c.altitude ?? 0) >= 5) return 'done';
      return { input: { forward: 1, sprint: true }, yaw: plan.roof?.edgeYaw };
    },
  };
}

function openGlider(): Step {
  return press('open the glider (H)', 'glider', {
    check: (ctx) => expectMode(ctx.character, 'gliding'),
  });
}

function glide(seconds: number): Step {
  return {
    name: `glide for ${seconds} s`,
    timeout: seconds + 1,
    tick: (ctx) => (ctx.t >= seconds || ctx.character.mode !== 'gliding' ? 'done' : IDLE),
    check: (ctx) => {
      const c = ctx.character;
      if (c.mode !== 'gliding') return undefined; // landed or crashed early; the next step checks
      if (c.speed < 10 || c.speed > 25) return `airspeed ${c.speed.toFixed(1)} m/s`;
      if (c.velocity.y >= 0) return 'not descending';
      return undefined;
    },
  };
}

function land(): Step {
  return {
    name: 'land and stand up',
    timeout: 60,
    tick: (ctx) => {
      const c = ctx.character;
      return c.mode === 'onFoot' && c.foot.onGround ? 'done' : IDLE;
    },
    check: standingCheck,
  };
}

/** Scripted: lifts the player straight up into open air above the street. */
function liftIntoAir(name = `lift ${LIFT_HEIGHT} m above the street (scripted)`): Step {
  return {
    name,
    timeout: 1,
    begin: (ctx) => {
      const c = ctx.character;
      if (!hasHeadroom(ctx.world, c.position, LIFT_HEIGHT + 2)) return 'no open air above';
      c.position.y += LIFT_HEIGHT;
      c.velocity.set(0, 0, 0);
      c.foot.onGround = false;
      return undefined;
    },
    tick: () => 'done',
  };
}

// ---------- scenarios ----------

/** A: every move chained in one run, as a player would do it. */
export function fullLoop(): Scenario {
  const plan: Plan = { driveYaw: 0, start: new Vector3() };
  return {
    name: 'full loop: walk → climb → drive → exit → glide → land → reset',
    steps: [
      walkToClimbableWall(plan),
      wallStop(plan),
      climbLedge(plan),
      dropToStreet(plan),
      callTaxi(plan),
      enterTaxi(),
      drive(plan, 3),
      brake(),
      exitTaxi(),
      goToRoof(plan),
      walkOffEdge(plan),
      openGlider(),
      glide(3),
      land(),
      resetStep(),
    ],
  };
}

/** B: R pressed in the middle of each action. */
export function resetMidAction(): Scenario[] {
  const climb: Plan = { driveYaw: 0, start: new Vector3() };
  const car: Plan = { driveYaw: 0, start: new Vector3() };
  return [
    {
      name: 'reset while climbing',
      steps: [
        walkToClimbableWall(climb),
        press('start climbing (Space)', 'jump', {
          yaw: () => climb.wall?.yaw ?? 0,
          settle: 0.2,
          check: (ctx) => expectMode(ctx.character, 'climbing'),
        }),
        resetStep(),
      ],
    },
    {
      name: 'reset while gliding',
      steps: [
        liftIntoAir(),
        openGlider(),
        hold('glide for 2 s', 2, {}, { check: (ctx) => expectMode(ctx.character, 'gliding') }),
        resetStep(),
      ],
    },
    {
      name: 'reset while driving',
      steps: [callTaxi(car), enterTaxi(), drive(car, 2), resetStep('reset at speed (R)')],
    },
  ];
}

/**
 * C: 20 s of seeded random button presses. The per-frame checks catch stuck or duplicate
 * controllers. Scripted: every 5 s the player is lifted into the air so the glider gets used.
 */
export function buttonMash(seed = 42, seconds = 20): Scenario {
  const random = createRandom(seed);
  let held: Partial<CharacterInput> = {};
  let yaw = 0;
  let nextChange = 0;
  let nextLift = 5;
  return {
    name: `button mashing for ${seconds} s (seed ${seed})`,
    steps: [
      {
        name: 'mash V / H / Space / WASD / R',
        timeout: seconds + 1,
        tick: (ctx) => {
          const c = ctx.character;
          if (ctx.t >= seconds) return 'done';
          if (ctx.t >= nextChange) {
            nextChange = ctx.t + 0.3 + random() * 0.6;
            const axis = (): number => Math.floor(random() * 3) - 1;
            held = {
              forward: axis(),
              right: axis(),
              sprint: random() < 0.3,
              handbrake: random() < 0.2,
            };
            yaw += (random() - 0.5) * 1.5;
          }
          if (ctx.t >= nextLift) {
            nextLift += 5;
            if (c.mode === 'onFoot' && hasHeadroom(ctx.world, c.position, LIFT_HEIGHT + 2)) {
              c.position.y += LIFT_HEIGHT;
              c.foot.onGround = false;
            }
          }
          if (random() < 0.003) c.reset();
          return {
            input: {
              ...held,
              jump: random() < 0.02,
              vehicle: random() < 0.015,
              glider: random() < 0.02,
            },
            yaw,
          };
        },
      },
      resetStep('reset still works afterwards'),
    ],
  };
}

/**
 * G2: walks up to `count` real façades near spawn and presses Space at each. A climb that
 * starts must end standing on top (not inside a wall, not floating, not up a 20 m wall). Code
 * can't know where a human would expect a ledge, so walls without one are reported, not failed.
 */
export function facadeClimbs(count = 10): Scenario {
  let walls: WallSpot[] = [];
  const steps: Step[] = [
    {
      name: 'survey façades near spawn',
      timeout: 1,
      begin: (ctx) => {
        const origins = surveyOrigins(ctx.world, ctx.spawn);
        walls = findWalls(ctx.world, origins, SURVEY_RADIUS, count);
        ctx.metrics.walls = walls.length;
        ctx.metrics.probeFoundLedge = walls.filter((w) => w.climbable).length;
        ctx.metrics.climbed = 0;
        ctx.metrics.noLedge = 0;
        ctx.metrics.badClimbs = 0;
        return walls.length === 0 ? 'no walls found near spawn' : undefined;
      },
      tick: () => 'done',
      note: () => `${walls.length} walls`,
    },
  ];
  for (let i = 0; i < count; i++) steps.push(climbTrial(i, () => walls[i]));
  return { name: `climb check on ${count} real façades`, steps, continueOnFail: true };
}

function climbTrial(i: number, spot: () => WallSpot | undefined): Step {
  let phase: 'settle' | 'walk' | 'jumped' | 'climbing' | 'skip' = 'settle';
  const settle = settler();
  let walkFrom = 0;
  let jumpedAt = 0;
  let climbed = false;
  let from = new Vector3();
  return {
    name: `façade ${i + 1}`,
    timeout: 8 + SETTLE_MAX_SECONDS,
    begin: (ctx) => {
      const wall = spot();
      climbed = false;
      if (!wall) {
        phase = 'skip';
        return undefined;
      }
      phase = 'settle';
      settle.start(0);
      // Scripted: stand 2 m back from the wall on the street, then walk up to it.
      const c = ctx.character;
      if (c.mode !== 'onFoot') c.reset();
      // Tiles refine as the player moves, so re-read both floors from the current geometry.
      const approach = wall.stand.clone().addScaledVector(forwardOf(wall.yaw), -2);
      const standFloor = surfaceBelow(ctx.world, wall.stand, wall.stand.y + 2);
      const floor = surfaceBelow(ctx.world, approach, wall.stand.y + 2);
      if (floor === null || standFloor === null || Math.abs(floor - standFloor) > 0.5) {
        phase = 'skip';
        return undefined;
      }
      c.foot.placeAt(approach.x, floor, approach.z);
      return undefined;
    },
    tick: (ctx) => {
      const wall = spot();
      const c = ctx.character;
      if (phase === 'skip' || !wall) return 'done';
      if (phase === 'settle') {
        if (settle.busy(ctx)) return IDLE;
        phase = 'walk';
        walkFrom = ctx.t;
      }
      if (phase === 'walk') {
        if (clearance(ctx.world, c.position, wall.yaw, 2) > 0.6 && ctx.t - walkFrom < 4) {
          return { input: { forward: 1 }, yaw: wall.yaw };
        }
        phase = 'jumped';
        jumpedAt = ctx.t;
        from = c.position.clone();
        return { input: { jump: true }, yaw: wall.yaw };
      }
      if (c.mode === 'climbing') {
        climbed = true;
        phase = 'climbing';
      }
      if (phase === 'climbing') return c.mode === 'onFoot' ? 'done' : IDLE;
      return ctx.t - jumpedAt > 1.2 ? 'done' : IDLE;
    },
    check: (ctx) => {
      const wall = spot();
      if (!wall || phase === 'skip') return undefined;
      const m = ctx.metrics;
      if (!climbed) {
        m.noLedge = (m.noLedge ?? 0) + 1;
        return wall.climbable ? 'probe saw a ledge here, but Space did not climb it' : undefined;
      }
      m.climbed = (m.climbed ?? 0) + 1;
      const rise = ctx.character.position.y - from.y;
      const bad =
        rise < CLIMB_RISE.min || rise > CLIMB_RISE.max
          ? `climb rose ${rise.toFixed(2)} m`
          : standingCheck(ctx);
      if (bad) m.badClimbs = (m.badClimbs ?? 0) + 1;
      return bad;
    },
    note: () =>
      phase === 'skip'
        ? 'skipped: no wall or no floor to approach from'
        : climbed
          ? 'climbed'
          : 'no ledge here',
  };
}
