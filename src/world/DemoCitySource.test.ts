import { Ray, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SPAWN } from '../config/world';
import { DemoCitySource } from './DemoCitySource';
import { LocalFrame } from './geo';

const frame = new LocalFrame(SPAWN);

async function loaded(): Promise<DemoCitySource> {
  const city = new DemoCitySource(frame);
  await city.load();
  return city;
}

describe('DemoCitySource', () => {
  it('reports ready after load', async () => {
    const city = await loaded();
    expect(city.status.kind).toBe('ready');
  });

  it('generates the same city for the same seed', async () => {
    const a = await loaded();
    const b = await loaded();
    for (const [x, z] of [
      [40, 40],
      [-200, 130],
      [310, -75],
    ] as const) {
      expect(a.heightAt(x, z)).toBe(b.heightAt(x, z));
    }
  });

  it('finds the ground in a street and rooftops above it', async () => {
    const city = await loaded();
    // Streets run through the centre of the grid when blocksPerSide is even.
    expect(city.heightAt(0, 0)).not.toBeNull(); // toBeCloseTo would accept null as 0
    expect(city.heightAt(0, 0)).toBeCloseTo(0, 5);
    const heights = [40, 120, 200].map((x) => city.heightAt(x, 40) ?? 0);
    expect(Math.max(...heights)).toBeGreaterThan(10);
  });

  it('respects the raycast max distance', async () => {
    const city = await loaded();
    const ray = new Ray(new Vector3(0, 1000, 0), new Vector3(0, -1, 0));
    expect(city.raycast(ray, 500)).toBeNull();
    expect(city.raycast(ray, 1500)?.distance).toBeCloseTo(1000, 3);
  });

  it('labels itself as synthetic data', async () => {
    const city = await loaded();
    expect(city.attributions().join(' ')).toMatch(/not real map data/);
  });

  it('releases geometry and materials on dispose', async () => {
    const city = await loaded();
    const disposables = city.root.children.flatMap((child) => {
      const mesh = child as unknown as {
        geometry: { dispose(): void };
        material: { dispose(): void };
      };
      return [mesh.geometry, mesh.material];
    });
    const spies = disposables.map((d) => vi.spyOn(d, 'dispose'));
    city.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    expect(city.root.children).toHaveLength(0);
    expect(city.status.kind).toBe('idle');
  });
});
