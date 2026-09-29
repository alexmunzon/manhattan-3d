import { describe, expect, it } from 'vitest';
import { describeTileError } from './tileErrors';

describe('describeTileError', () => {
  it.each([
    ['Failed to load tileset: 403', /rejected the API key/],
    ['401 Unauthorized', /rejected the API key/],
    ['429 Too Many Requests', /quota/],
    ['503 Service Unavailable', /trouble/],
    ['TypeError: Failed to fetch', /internet connection/],
  ])('maps %s', (message, expected) => {
    expect(describeTileError(new Error(message))).toMatch(expected);
  });

  it('never leaks the request URL or key', () => {
    const message = describeTileError(
      new Error('403 https://tile.googleapis.com/v1/3dtiles/root.json?key=SECRET123'),
    );
    expect(message).not.toMatch(/SECRET123|googleapis\.com\/v1/);
  });
});
