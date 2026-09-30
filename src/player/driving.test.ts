import { Ray, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { SPAWN } from '../config/world';
import { DemoCitySource } from '../world/DemoCitySource';
import { LocalFrame } from '../world/geo';
import { Character, type CharacterInput } from './Character';

const DT = 1 / 60;
const idle: CharacterInput = {
  forward: 0,
  right: 0,
  sprint: false,
  jump: false,
  glider: false,
  vehicle: false,
  handbrake: false,
};
let city: DemoCitySource;

beforeAll(async () => {
  city = new DemoCitySource(new LocalFrame(SPAWN));
  await city.load();
});

function spawned(x = 0, z = 0): Character {
  const c = new Character(city);
  for (let t = 0; !c.trySpawn(DT, x, z); t += DT) if (t > 5) throw new Error('no spawn');
  return c;
}

function run(c: Character, input: CharacterInput, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) c.update(DT, input, 0);
}

describe('Character spawning', () => {
  it('spawns at street level even when the configured point is a rooftop', () => {
    expect(city.heightAt(24, 24)).toBeGreaterThan(10);
    const c = spawned(24, 24);
    expect(c.position.y).toBeCloseTo(0, 3);
  });

  it('parks a car beside the player on spawn', () => {
    const c = spawned();
    expect(c.carPlaced).toBe(true);
    expect(c.position.distanceTo(c.car.position)).toBeLessThan(5);
  });
});

describe('Character driving', () => {
  it('enters the nearby car with V, drives, and exits on foot beside it', () => {
    const c = spawned();
    c.update(DT, { ...idle, vehicle: true }, 0);
    expect(c.mode).toBe('driving');
    expect(c.pose).toBe('drive');

    // Spawn is on the east-west street at z = 0; point the car down it (camera yaw steers nothing).
    c.car.yaw = -Math.PI / 2;
    run(c, { ...idle, forward: 1 }, 2);
    expect(c.speed).toBeGreaterThan(10);
    expect(c.position.distanceTo(c.car.position)).toBe(0);

    run(c, { ...idle, handbrake: true }, 2);
    c.update(DT, { ...idle, vehicle: true }, 0);
    expect(c.mode).toBe('onFoot');
    run(c, idle, 1);
    expect(c.foot.onGround).toBe(true);
    expect(c.position.distanceTo(c.car.position)).toBeLessThan(3);
    expect(c.car.speed).toBe(0);
  });

  it('exits on the passenger side when the driver side is against a wall', () => {
    const c = spawned();
    c.update(DT, { ...idle, vehicle: true }, 0);
    // Park facing north on the street at z = 24 with a building face just left (west) of the car.
    const hit = city.raycast(new Ray(new Vector3(0, 1, 24), new Vector3(-1, 0, 0)), 50);
    if (!hit) throw new Error('expected a wall west of the street');
    c.car.place(hit.point.x + 1.2, 24, 0);
    c.update(DT, { ...idle, vehicle: true }, 0);
    expect(c.mode).toBe('onFoot');
    expect(c.position.x).toBeGreaterThan(c.car.position.x);
  });

  it('calls the car over with V when it is far away', () => {
    const c = spawned();
    run(c, { ...idle, forward: 1, sprint: true }, 3);
    expect(c.position.distanceTo(c.car.position)).toBeGreaterThan(10);
    c.update(DT, { ...idle, vehicle: true }, 0);
    expect(c.mode).toBe('onFoot');
    expect(c.position.distanceTo(c.car.position)).toBeLessThan(5);
    c.update(DT, { ...idle, vehicle: true }, 0);
    expect(c.mode).toBe('driving');
  });

  it('called while facing a nearby wall, the car parks with road ahead and can drive off', () => {
    const c = spawned();
    const hit = city.raycast(new Ray(new Vector3(0, 1, 24), new Vector3(1, 0, 0)), 50);
    if (!hit) throw new Error('expected a wall east of the street');
    c.foot.placeAt(hit.point.x - 4, 0, 24); // 4 m from the wall, looking straight at it
    const east = -Math.PI / 2;
    c.update(DT, { ...idle, vehicle: true }, east);
    expect(c.carPlaced).toBe(true);
    // Parked pointing down the street, not at the wall (or across the street at the far side).
    expect(c.car.roadAhead(c.car.position.x, 0, c.car.position.z, c.car.yaw, 40)).toBe(40);
    c.update(DT, { ...idle, vehicle: true }, east);
    expect(c.mode).toBe('driving');
    const start = c.car.position.clone();
    run(c, { ...idle, forward: 1 }, 2);
    expect(c.speed).toBeGreaterThan(5);
    expect(c.car.position.distanceTo(start)).toBeGreaterThan(8);
  });

  it('reset leaves the car and returns to spawn on foot', () => {
    const c = spawned();
    c.update(DT, { ...idle, vehicle: true }, 0);
    run(c, { ...idle, forward: 1 }, 1);
    c.reset();
    expect(c.mode).toBe('onFoot');
    expect(c.position.y).toBeCloseTo(0, 3);
  });
});
