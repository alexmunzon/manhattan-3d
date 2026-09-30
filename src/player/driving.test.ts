import { Ray, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { SPAWN } from '../config/world';
import { DemoCitySource } from '../world/DemoCitySource';
import { LocalFrame } from '../world/geo';
import { Character, type CharacterInput, FELL_OUT_OF_WORLD, NO_ROOM_FOR_TAXI } from './Character';

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

describe('Character falling out of the world', () => {
  it('puts the player back on solid ground and says so', () => {
    const c = spawned();
    // A world with nothing in it: the ground vanished (missing bridge span, unloaded tile).
    const nothing = { id: 'void', raycast: () => null, heightAt: () => null } as unknown as DemoCitySource;
    const lost = new Character(nothing);
    lost.foot.spawnAt(0, 0, 24);
    expect(lost.takeNotice()).toBeNull();
    let notice: string | null = null;
    // 150 m of free fall takes about 4 s; the notice follows the rescue on the next frame.
    for (let t = 0; notice === null && t < 6; t += DT) {
      lost.update(DT, idle, 0);
      notice = lost.takeNotice();
    }
    expect(notice).toBe(FELL_OUT_OF_WORLD);
    expect(lost.foot.rescues).toBe(1);
    expect(lost.position.y).toBeGreaterThan(-0.1); // back at the spawn height, one frame on
    expect(lost.takeNotice()).toBeNull();
    expect(c.foot.rescues).toBe(0); // a player on real ground never sees it
  });
});

describe('Character driving', () => {
  it('tells the player when the taxi has no room to park', () => {
    const c = spawned();
    expect(c.takeNotice()).toBeNull();
    c.car.position.set(500, 0, 500); // too far to enter, so V calls it over
    c.car.fits = () => false; // boxed in: nowhere nearby fits a car
    c.update(DT, { ...idle, vehicle: true }, 0);
    expect(c.mode).toBe('onFoot');
    expect(c.takeNotice()).toBe(NO_ROOM_FOR_TAXI);
    expect(c.takeNotice()).toBeNull(); // one-shot
  });

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
