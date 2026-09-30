import { Ray, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { SPAWN } from '../config/world';
import { DemoCitySource } from './DemoCitySource';
import { LocalFrame } from './geo';
import { floorAboveFeet } from './ground';

const LIMITS = { floorRecoveryDrop: 0.5, floorRecoveryBand: 1.5, minFloorNormalY: 0.7 };
let city: DemoCitySource;

beforeAll(async () => {
  city = new DemoCitySource(new LocalFrame(SPAWN));
  await city.load();
});

/** The demo city with a 29 cm crack along x = 0, as measured between two Google tiles. */
function withSeam(): DemoCitySource {
  return {
    raycast: (...args: Parameters<DemoCitySource['raycast']>) => {
      const [ray] = args;
      const inCrack = Math.abs(ray.origin.x) < 0.145 && ray.direction.y < -0.5;
      return inCrack ? null : city.raycast(...args);
    },
  } as unknown as DemoCitySource;
}

describe('floorAboveFeet (streaming-hole rescue)', () => {
  const ray = new Ray();
  const lastSafe = new Vector3(0, 0, 24); // street level on the demo city

  it('does nothing until the body has dropped past the limit', () => {
    expect(floorAboveFeet(city, ray, new Vector3(0, -0.3, 24), lastSafe, LIMITS)).toBeNull();
  });

  // `toBeCloseTo` treats null as 0, so a missing floor must be ruled out separately.
  const expectStreet = (y: number | null): void => {
    expect(y).not.toBeNull();
    expect(y).toBeCloseTo(0, 3);
  };

  it('finds the street it fell through', () => {
    expectStreet(floorAboveFeet(city, ray, new Vector3(0, -0.6, 24), lastSafe, LIMITS));
  });

  it('still finds the street when the centre ray falls into a tile seam', () => {
    const seam = withSeam();
    expect(seam.raycast(new Ray(new Vector3(0, 1, 24), new Vector3(0, -1, 0)), 5)).toBeNull();
    expectStreet(floorAboveFeet(seam, ray, new Vector3(0, -0.6, 24), lastSafe, LIMITS));
  });

  it('finds nothing under a real fall off a roof edge', () => {
    const roof = city.heightAt(24, 24) ?? 0;
    expect(roof).toBeGreaterThan(10);
    const safe = new Vector3(24, roof, 24);
    // A metre off the edge, over the street: only air above the feet.
    const off = new Vector3(24, roof - 3, 24 - 24 + 1);
    expect(floorAboveFeet(city, ray, off, safe, LIMITS)).toBeNull();
  });
});
