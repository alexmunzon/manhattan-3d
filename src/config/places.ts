import type { GeoPoint } from '../world/geo';

/** Named teleport destinations (street-level points on land). */
export const PLACES: readonly { name: string; lat: number; lon: number }[] = [
  { name: 'Wall Street', lat: 40.70694, lon: -74.01118 },
  { name: 'Battery Park', lat: 40.7033, lon: -74.017 },
  { name: 'One World Trade Center', lat: 40.7127, lon: -74.0134 },
  { name: 'City Hall', lat: 40.7128, lon: -74.006 },
  { name: 'Brooklyn Bridge', lat: 40.7098, lon: -74.002 },
  { name: 'Washington Square Park', lat: 40.7308, lon: -73.9973 },
  { name: 'Flatiron Building', lat: 40.7411, lon: -73.9897 },
  { name: 'Empire State Building', lat: 40.7484, lon: -73.9857 },
  { name: 'Hudson Yards', lat: 40.7538, lon: -74.002 },
  { name: 'Chrysler Building', lat: 40.7516, lon: -73.9755 },
  { name: 'Grand Central Terminal', lat: 40.7527, lon: -73.9772 },
  { name: 'Times Square', lat: 40.758, lon: -73.9855 },
  { name: 'Rockefeller Center', lat: 40.7587, lon: -73.9787 },
  { name: 'Central Park', lat: 40.7812, lon: -73.9665 },
  { name: 'Metropolitan Museum of Art', lat: 40.7794, lon: -73.9632 },
  { name: 'Columbia University', lat: 40.8075, lon: -73.9626 },
  { name: 'Apollo Theater', lat: 40.81, lon: -73.95 },
  { name: 'Inwood Hill Park', lat: 40.8721, lon: -73.9259 },
];

/**
 * Simplified Manhattan shoreline as [lon, lat], used to keep teleports on the island.
 * Hand-traced at roughly 200 m accuracy, which is enough for bounds checks, not for drawing.
 */
export const MANHATTAN_OUTLINE: readonly (readonly [number, number])[] = [
  [-74.0185, 40.7005],
  [-74.0195, 40.706],
  [-74.0165, 40.718],
  [-74.012, 40.729],
  [-74.0105, 40.74],
  [-74.0095, 40.752],
  [-74.001, 40.763],
  [-73.993, 40.773],
  [-73.986, 40.783],
  [-73.976, 40.796],
  [-73.963, 40.815],
  [-73.952, 40.83],
  [-73.942, 40.847],
  [-73.933, 40.862],
  [-73.927, 40.875],
  [-73.912, 40.879],
  [-73.911, 40.873],
  [-73.919, 40.862],
  [-73.93, 40.845],
  [-73.934, 40.825],
  [-73.933, 40.81],
  [-73.935, 40.796],
  [-73.942, 40.787],
  [-73.958, 40.765],
  [-73.968, 40.752],
  [-73.972, 40.743],
  [-73.972, 40.73],
  [-73.973, 40.72],
  [-73.978, 40.711],
  [-73.996, 40.707],
  [-74.006, 40.703],
  [-74.012, 40.7005],
];

/** True if the point lies inside the simplified Manhattan outline (ray-casting test). */
export function isInManhattan(lat: number, lon: number): boolean {
  let inside = false;
  const n = MANHATTAN_OUTLINE.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = MANHATTAN_OUTLINE[i] as readonly [number, number];
    const [xj, yj] = MANHATTAN_OUTLINE[j] as readonly [number, number];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export type TeleportResult =
  { ok: true; point: GeoPoint; label: string } | { ok: false; error: string };

const LAT_LON = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** Resolves teleport-bar text (a place name or "lat, lon") to a point inside Manhattan. */
export function resolveTeleport(query: string): TeleportResult {
  const text = query.trim();
  if (!text) return { ok: false, error: 'Type a place or coordinates' };

  const coords = LAT_LON.exec(text);
  if (coords) {
    const lat = Number(coords[1]);
    const lon = Number(coords[2]);
    if (!isInManhattan(lat, lon))
      return { ok: false, error: 'Those coordinates are outside Manhattan' };
    return { ok: true, point: { lat, lon, alt: 0 }, label: `${lat.toFixed(5)}, ${lon.toFixed(5)}` };
  }

  const needle = text.toLowerCase();
  const place =
    PLACES.find((p) => p.name.toLowerCase() === needle) ??
    PLACES.find((p) => p.name.toLowerCase().startsWith(needle)) ??
    PLACES.find((p) => p.name.toLowerCase().includes(needle));
  if (!place) return { ok: false, error: `No Manhattan place matches "${text}"` };
  return { ok: true, point: { lat: place.lat, lon: place.lon, alt: 0 }, label: place.name };
}
