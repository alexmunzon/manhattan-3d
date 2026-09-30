import { beforeAll, describe, expect, it } from 'vitest';
import { SPAWN } from '../config/world';
import { DemoCitySource } from '../world/DemoCitySource';
import { LocalFrame } from '../world/geo';
import { PLAYER, PlayerController, type MoveIntent } from './PlayerController';

const DT = 1 / 60;
const idle: MoveIntent = { forward: 0, right: 0, sprint: false, jump: false };
const east: MoveIntent = { ...idle, right: 1 }; // camera yaw 0 faces north, so right is east
let city: DemoCitySource;

beforeAll(async () => {
  city = new DemoCitySource(new LocalFrame(SPAWN));
  await city.load();
});

/** Spawns a player at (x, z) on the demo city and waits out the settle timer. */
function spawn(x: number, z: number): PlayerController {
  const player = new PlayerController(city);
  let t = 0;
  while (!player.trySpawn(x, z, DT)) {
    t += DT;
    if (t > PLAYER.spawnSettleSeconds + 1) throw new Error('spawn never settled');
  }
  return player;
}

function run(player: PlayerController, intent: MoveIntent, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) player.update(DT, intent, 0);
}

// The demo grid (10 blocks of 60 m + 18 m streets) puts a north-south street along x = -9..9 and,
// at z = 24, a building whose west face sits at x ≈ 12 (verified by sampling heightAt).
describe('PlayerController on the demo city', () => {
  it('waits for ground before spawning', () => {
    const unloaded = { heightAt: () => null } as unknown as DemoCitySource;
    const empty = new PlayerController(unloaded);
    expect(empty.trySpawn(0, 0, 10)).toBe(false);
    expect(empty.spawned).toBe(false);
  });

  it('stands still on the street without sinking', () => {
    const player = spawn(0, 24);
    run(player, idle, 2);
    expect(player.position.y).toBeCloseTo(0, 3);
    expect(player.onGround).toBe(true);
  });

  it('walks at walking speed and sprints faster', () => {
    const walker = spawn(0, 24);
    run(walker, { ...idle, forward: 1 }, 1);
    const sprinter = spawn(0, 24);
    run(sprinter, { ...idle, forward: 1, sprint: true }, 1);
    expect(walker.speed).toBeCloseTo(PLAYER.walkSpeed, 1);
    expect(sprinter.speed).toBeCloseTo(PLAYER.sprintSpeed, 1);
    expect(walker.position.z).toBeLessThan(24); // forward at yaw 0 is north (-z)
  });

  it('is stopped by a building wall instead of walking through it', () => {
    const player = spawn(0, 24);
    run(player, { ...east, sprint: true }, 5);
    expect(player.position.x).toBeGreaterThan(5);
    expect(player.position.x).toBeLessThan(12);
    expect(player.position.y).toBeCloseTo(0, 3);
  });

  it('jumps and lands back on the ground', () => {
    const player = spawn(0, 24);
    player.update(DT, { ...idle, jump: true }, 0);
    run(player, idle, 0.2);
    expect(player.position.y).toBeGreaterThan(0.5);
    expect(player.onGround).toBe(false);
    run(player, idle, 2);
    expect(player.position.y).toBeCloseTo(0, 3);
    expect(player.onGround).toBe(true);
  });

  it('lands on a rooftop when dropped from above', () => {
    const roof = city.heightAt(24, 24) ?? 0;
    expect(roof).toBeGreaterThan(10);
    const player = spawn(24, 24);
    player.position.y += 30;
    player.onGround = false;
    run(player, idle, 4);
    expect(player.position.y).toBeCloseTo(roof, 2);
  });

  it('climbs back onto its floor after a streaming hole instead of falling forever', () => {
    let blind = false;
    const flaky = {
      raycast: (...args: Parameters<DemoCitySource['raycast']>) =>
        blind ? null : city.raycast(...args),
      heightAt: (x: number, z: number) => (blind ? null : city.heightAt(x, z)),
    } as unknown as DemoCitySource;
    const player = new PlayerController(flaky);
    player.spawnAt(0, 0, 24);
    blind = true; // tiles swapping: nothing under the player
    run(player, idle, 0.8);
    expect(player.position.y).toBeLessThan(-3);
    blind = false;
    run(player, idle, 0.1);
    expect(player.position.y).toBeCloseTo(0, 3);
    expect(player.onGround).toBe(true);
  });

  it('is caught within about half a metre when a brief hole closes', () => {
    let blind = false;
    const flaky = {
      raycast: (...args: Parameters<DemoCitySource['raycast']>) =>
        blind ? null : city.raycast(...args),
      heightAt: (x: number, z: number) => (blind ? null : city.heightAt(x, z)),
    } as unknown as DemoCitySource;
    const player = new PlayerController(flaky);
    player.spawnAt(0, 0, 24);
    let lowest = 0;
    blind = true; // a short tile swap: the street vanishes for a quarter second
    for (let t = 0; t < 0.25; t += DT) {
      player.update(DT, idle, 0);
      lowest = Math.min(lowest, player.position.y);
    }
    blind = false;
    for (let t = 0; t < 0.5; t += DT) {
      player.update(DT, idle, 0);
      lowest = Math.min(lowest, player.position.y);
    }
    expect(player.position.y).toBeCloseTo(0, 3);
    expect(player.onGround).toBe(true);
    expect(lowest).toBeGreaterThan(-1);
  });

  it('is not pulled back up when stepping off a low roof', () => {
    const low = new DemoCitySource(new LocalFrame(SPAWN), { minHeight: 1.6, maxHeight: 2 });
    return low.load().then(() => {
      const roof = low.heightAt(24, 24) ?? 0;
      const player = new PlayerController(low);
      player.spawnAt(24, roof, 24);
      run(player, { ...idle, forward: 0, right: -1 }, 5); // walk west off the edge into the street
      expect(roof).toBeGreaterThan(1.5);
      expect(player.position.y).toBeCloseTo(0, 3);
      expect(player.onGround).toBe(true);
    });
  });

  it('walks along a 29 cm seam between tiles without falling in', () => {
    // Same crack as measured on Google tiles: downward rays inside the strip find nothing.
    const seam = {
      raycast: (...args: Parameters<DemoCitySource['raycast']>) => {
        const [ray] = args;
        const inCrack = Math.abs(ray.origin.x) < 0.145 && ray.direction.y < -0.5;
        return inCrack ? null : city.raycast(...args);
      },
      heightAt: (x: number, z: number) => (Math.abs(x) < 0.145 ? null : city.heightAt(x, z)),
    } as unknown as DemoCitySource;
    const player = new PlayerController(seam);
    player.spawnAt(0, 0, 60);
    let lowest = 0;
    for (let t = 0; t < 2; t += DT) {
      player.update(DT, { ...idle, forward: 1 }, 0); // north, right along the crack
      lowest = Math.min(lowest, player.position.y);
    }
    expect(player.position.z).toBeLessThan(55);
    expect(lowest).toBeGreaterThan(-0.05);
    expect(player.onGround).toBe(true);
  });

  it('still falls normally off a roof edge', () => {
    const roof = city.heightAt(24, 24) ?? 0;
    const player = spawn(24, 24);
    player.position.set(0, roof, 24); // step off the roof over the street
    player.onGround = false;
    run(player, idle, 4);
    expect(player.position.y).toBeCloseTo(0, 3);
  });

  it('returns to spawn on respawn', () => {
    const player = spawn(0, 24);
    run(player, { ...idle, forward: 1 }, 2);
    player.respawn();
    expect(player.position.toArray()).toEqual([0, 0, 24]);
    expect(player.speed).toBe(0);
  });
});
