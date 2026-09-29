import { Ray, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { SPAWN } from '../config/world';
import { DemoCitySource } from '../world/DemoCitySource';
import { LocalFrame } from '../world/geo';
import { Character, type CharacterInput } from './Character';
import { GLIDER, GliderController } from './GliderController';
import { findLedge } from './ledge';

const DT = 1 / 60;
const EAST_YAW = -Math.PI / 2; // camera yaw whose forward vector is +x
const EAST = new Vector3(1, 0, 0);
const idle: CharacterInput = {
  forward: 0,
  right: 0,
  sprint: false,
  jump: false,
  glider: false,
  vehicle: false,
  handbrake: false,
};

let tall: DemoCitySource;
let low: DemoCitySource;
/** x of the building face east of the street at z = 24 (same layout in both cities). */
let wallX: number;

beforeAll(async () => {
  const frame = new LocalFrame(SPAWN);
  tall = new DemoCitySource(frame);
  low = new DemoCitySource(frame, { minHeight: 1.6, maxHeight: 2.0 });
  await Promise.all([tall.load(), low.load()]);
  const hit = low.raycast(new Ray(new Vector3(0, 1, 24), EAST.clone()), 50);
  if (!hit) throw new Error('expected a wall east of the street');
  wallX = hit.point.x;
});

function spawnCharacter(world: DemoCitySource, x: number, z: number): Character {
  const character = new Character(world);
  for (let t = 0; !character.foot.trySpawn(x, z, DT); t += DT) {
    if (t > 5) throw new Error('spawn never settled');
  }
  return character;
}

function run(c: Character, input: CharacterInput, seconds: number, yaw = EAST_YAW): void {
  for (let t = 0; t < seconds; t += DT) c.update(DT, input, yaw);
}

describe('findLedge', () => {
  it('finds a waist-to-head-high ledge in front of a wall', () => {
    const ledge = findLedge(low, new Vector3(wallX - 0.5, 0, 24), EAST, false);
    expect(ledge).not.toBeNull();
    expect(ledge?.top.y).toBeGreaterThan(1.5);
    expect(ledge?.top.x).toBeGreaterThan(wallX);
  });

  it('rejects walls that are too tall to climb', () => {
    expect(findLedge(tall, new Vector3(wallX - 0.5, 0, 24), EAST, false)).toBeNull();
  });

  it('rejects walls that are out of reach', () => {
    expect(findLedge(low, new Vector3(wallX - 3, 0, 24), EAST, false)).toBeNull();
  });
});

describe('Character climbing', () => {
  it('climbs onto a low roof with jump and ends on foot on top', () => {
    const c = spawnCharacter(low, wallX - 0.5, 24);
    c.update(DT, { ...idle, jump: true }, EAST_YAW);
    expect(c.mode).toBe('climbing');
    run(c, idle, 1);
    expect(c.mode).toBe('onFoot');
    expect(c.position.y).toBeGreaterThan(1.5);
    expect(c.foot.onGround).toBe(true);
  });

  it('jumps normally when no ledge is in front', () => {
    const c = spawnCharacter(low, 0, 24);
    c.update(DT, { ...idle, jump: true }, EAST_YAW);
    expect(c.mode).toBe('onFoot');
    expect(c.foot.onGround).toBe(false);
  });
});

describe('GliderController', () => {
  it('only deploys with enough air below', () => {
    const glider = new GliderController(tall);
    expect(glider.canDeploy(new Vector3(0, 1, 24))).toBe(false);
    expect(glider.canDeploy(new Vector3(0, 60, 24))).toBe(true);
  });

  it('settles into a steady descending glide near 16 m/s', () => {
    const glider = new GliderController(tall);
    glider.deploy(new Vector3(0, 0, -12), 0);
    const pos = new Vector3(0, 900, 0);
    const vel = new Vector3();
    for (let t = 0; t < 20; t += DT) glider.update(DT, { pitch: 0, roll: 0 }, pos, vel);
    expect(glider.airspeed).toBeGreaterThan(13);
    expect(glider.airspeed).toBeLessThan(19);
    expect(vel.y).toBeLessThan(0);
    expect(pos.z).toBeLessThan(-200); // flew north
  });

  it('dives faster than it glides and turns when banked', () => {
    const neutral = new GliderController(tall);
    const dive = new GliderController(tall);
    const turner = new GliderController(tall);
    for (const g of [neutral, dive, turner]) g.deploy(new Vector3(0, 0, -15), 0);
    const p = [new Vector3(0, 900, 0), new Vector3(0, 900, 0), new Vector3(0, 900, 0)];
    const v = new Vector3();
    for (let t = 0; t < 6; t += DT) {
      neutral.update(DT, { pitch: 0, roll: 0 }, p[0] as Vector3, v);
      dive.update(DT, { pitch: 1, roll: 0 }, p[1] as Vector3, v);
      turner.update(DT, { pitch: 0, roll: 1 }, p[2] as Vector3, v);
    }
    expect(dive.airspeed).toBeGreaterThan(neutral.airspeed + 5);
    expect(turner.yaw).toBeLessThan(-0.5); // banked right turns clockwise (toward east)
    expect(Math.abs(turner.bank)).toBeLessThanOrEqual(GLIDER.maxBank);
  });
});

describe('Character gliding', () => {
  it('deploys with H in the air, lands on the street and returns on foot', () => {
    const c = spawnCharacter(tall, 0, 3);
    c.position.y = 40;
    c.foot.onGround = false;
    c.update(DT, { ...idle, glider: true }, 0);
    expect(c.mode).toBe('gliding');
    // Glide north along the x = 0 street until touchdown.
    for (let t = 0; t < 30 && c.mode === 'gliding'; t += DT) c.update(DT, idle, 0);
    expect(c.mode).toBe('onFoot');
    expect(c.position.y).toBeLessThan(1);
  });

  it('will not deploy the glider while standing on the ground', () => {
    const c = spawnCharacter(tall, 0, 24);
    c.update(DT, { ...idle, glider: true }, 0);
    expect(c.mode).toBe('onFoot');
  });

  it('reset returns to spawn on foot from any mode', () => {
    const c = spawnCharacter(tall, 0, 24);
    c.position.y = 60;
    c.foot.onGround = false;
    c.update(DT, { ...idle, glider: true }, 0);
    c.reset();
    expect(c.mode).toBe('onFoot');
    expect(c.position.toArray()).toEqual([0, 0, 24]);
  });
});
