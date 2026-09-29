import { describe, expect, it } from 'vitest';
import { ecefToGeodetic, geodeticToEcef, LocalFrame, type GeoPoint } from './geo';
import { SPAWN } from '../config/world';

const CM = 0.01;
const METRES_PER_DEG_LAT = 111_000;

describe('geodetic <-> ECEF', () => {
  it.each<GeoPoint>([
    { lat: 0, lon: 0, alt: 0 },
    SPAWN,
    { lat: 40.8296, lon: -73.9262, alt: 120 },
    { lat: -33.8568, lon: 151.2153, alt: 5 },
  ])('round-trips %o within 1 cm', (p) => {
    const back = ecefToGeodetic(geodeticToEcef(p));
    const drift = new LocalFrame(p).toLocal(back);
    expect(Math.hypot(drift.x, drift.y, drift.z)).toBeLessThan(CM);
  });
});

describe('LocalFrame', () => {
  const frame = new LocalFrame(SPAWN);

  it('maps the origin to (0, 0, 0)', () => {
    const v = frame.toLocal(SPAWN);
    expect(Math.hypot(v.x, v.y, v.z)).toBeLessThan(CM);
  });

  it('maps north to -z, east to +x, up to +y', () => {
    const north = frame.toLocal({ ...SPAWN, lat: SPAWN.lat + 0.001 });
    expect(north.z).toBeCloseTo(-0.001 * METRES_PER_DEG_LAT, -1);
    expect(Math.abs(north.x)).toBeLessThan(CM);

    expect(frame.toLocal({ ...SPAWN, lon: SPAWN.lon + 0.001 }).x).toBeGreaterThan(80);
    expect(frame.toLocal({ ...SPAWN, alt: 50 }).y).toBeCloseTo(50, 3);
  });

  it('round-trips game-space points within 1 cm across the play area', () => {
    for (const v of [
      { x: 0, y: 0, z: 0 },
      { x: 1500, y: 30, z: -4200 },
      { x: -800, y: 400, z: 2500 },
    ]) {
      const back = frame.toLocal(frame.toGeo(v));
      expect(Math.hypot(back.x - v.x, back.y - v.y, back.z - v.z)).toBeLessThan(CM);
    }
  });
});
