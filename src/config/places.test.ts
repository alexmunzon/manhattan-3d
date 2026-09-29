import { describe, expect, it } from 'vitest';
import { isInManhattan, PLACES, resolveTeleport } from './places';

describe('isInManhattan', () => {
  it.each(PLACES.map((p) => [p.name, p.lat, p.lon] as const))('%s is inside', (_, lat, lon) => {
    expect(isInManhattan(lat, lon)).toBe(true);
  });

  it.each([
    ['Brooklyn (DUMBO)', 40.7033, -73.9881],
    ['Jersey City', 40.7178, -74.0431],
    ['Queens (Long Island City)', 40.7447, -73.9485],
    ['Statue of Liberty', 40.6892, -74.0445],
  ])('%s is outside', (_, lat, lon) => {
    expect(isInManhattan(lat, lon)).toBe(false);
  });
});

describe('resolveTeleport', () => {
  it('accepts "lat, lon" and "lat lon" inside Manhattan', () => {
    expect(resolveTeleport('40.758, -73.9855')).toMatchObject({ ok: true });
    expect(resolveTeleport('40.758 -73.9855')).toMatchObject({ ok: true });
  });

  it('rejects coordinates outside Manhattan', () => {
    expect(resolveTeleport('40.7033, -73.9881')).toMatchObject({ ok: false });
  });

  it('matches place names case-insensitively, by prefix, then substring', () => {
    expect(resolveTeleport('times square')).toMatchObject({ ok: true, label: 'Times Square' });
    expect(resolveTeleport('empire')).toMatchObject({ ok: true, label: 'Empire State Building' });
    expect(resolveTeleport('grand central')).toMatchObject({ label: 'Grand Central Terminal' });
    expect(resolveTeleport('park')).toMatchObject({ ok: true });
  });

  it('explains unknown or empty input', () => {
    expect(resolveTeleport('')).toMatchObject({ ok: false });
    expect(resolveTeleport('Hogwarts')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Hogwarts/) as string,
    });
  });
});
