import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { SPAWN } from '../config/world';
import { DemoCitySource } from '../world/DemoCitySource';
import { LocalFrame } from '../world/geo';
import { findWalls } from './probes';

describe('findWalls', () => {
  it('finds tall building walls from a street corner', async () => {
    const city = new DemoCitySource(new LocalFrame(SPAWN));
    await city.load();
    const walls = findWalls(city, [new Vector3(0, 0, 24)], 60, 10);
    expect(walls.length).toBeGreaterThan(0);
    for (const w of walls) expect(w.stand.y).toBeCloseTo(0, 2);
  });

  it('finds knee-high walls that sit below the 1 m probe', async () => {
    const knee = new DemoCitySource(new LocalFrame(SPAWN), { minHeight: 0.8, maxHeight: 0.9 });
    await knee.load();
    const walls = findWalls(knee, [new Vector3(0, 0, 24)], 60, 10);
    expect(walls.length).toBeGreaterThan(0);
    expect(walls.some((w) => w.climbable)).toBe(true);
  });
});
