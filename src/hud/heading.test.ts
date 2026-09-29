import { describe, expect, it } from 'vitest';
import { formatHeading, yawToBearing } from './heading';

describe('heading', () => {
  it.each([
    [0, 0, 'N · 000°'],
    [-Math.PI / 2, 90, 'E · 090°'],
    [Math.PI, 180, 'S · 180°'],
    [Math.PI / 2, 270, 'W · 270°'],
    [-Math.PI / 4, 45, 'NE · 045°'],
    [-2 * Math.PI, 0, 'N · 000°'],
  ])('yaw %f -> %f° (%s)', (yaw, bearing, text) => {
    expect(yawToBearing(yaw)).toBeCloseTo(bearing, 6);
    expect(formatHeading(yawToBearing(yaw))).toBe(text);
  });
});
