/**
 * Geodetic math on the WGS84 ellipsoid.
 *
 * Game space is a local East-North-Up (ENU) frame anchored at a geographic origin, mapped to
 * Three.js axes as: +x = east, +y = up, -z = north.
 */

/** A WGS84 position: degrees and metres above the ellipsoid. */
export interface GeoPoint {
  lat: number;
  lon: number;
  alt: number;
}

/** Minimal mutable 3-vector; `THREE.Vector3` satisfies it. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const WGS84_A = 6_378_137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const GEODETIC_ITERATIONS = 5;
const DEG = Math.PI / 180;

/** Converts a geodetic position to Earth-centred, Earth-fixed metres. */
export function geodeticToEcef(p: GeoPoint, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const lat = p.lat * DEG;
  const lon = p.lon * DEG;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  out.x = (n + p.alt) * cosLat * Math.cos(lon);
  out.y = (n + p.alt) * cosLat * Math.sin(lon);
  out.z = (n * (1 - WGS84_E2) + p.alt) * sinLat;
  return out;
}

/** Converts ECEF metres back to a geodetic position (iterative; sub-millimetre near the surface). */
export function ecefToGeodetic(v: Vec3): GeoPoint {
  const lon = Math.atan2(v.y, v.x);
  const p = Math.hypot(v.x, v.y);
  let lat = Math.atan2(v.z, p * (1 - WGS84_E2));
  let alt = 0;
  for (let i = 0; i < GEODETIC_ITERATIONS; i++) {
    const sinLat = Math.sin(lat);
    const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    alt = p / Math.cos(lat) - n;
    lat = Math.atan2(v.z, p * (1 - (WGS84_E2 * n) / (n + alt)));
  }
  return { lat: lat / DEG, lon: lon / DEG, alt };
}

/** A local ENU frame anchored at a fixed geographic origin. */
export class LocalFrame {
  readonly origin: Readonly<GeoPoint>;
  private readonly originEcef: Vec3;
  private readonly sinLat: number;
  private readonly cosLat: number;
  private readonly sinLon: number;
  private readonly cosLon: number;
  private readonly scratch: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(origin: GeoPoint) {
    this.origin = { ...origin };
    this.originEcef = geodeticToEcef(origin);
    this.sinLat = Math.sin(origin.lat * DEG);
    this.cosLat = Math.cos(origin.lat * DEG);
    this.sinLon = Math.sin(origin.lon * DEG);
    this.cosLon = Math.cos(origin.lon * DEG);
  }

  /** Geographic position → game-space metres (+x east, +y up, -z north). */
  toLocal(p: GeoPoint, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
    const e = geodeticToEcef(p, this.scratch);
    const dx = e.x - this.originEcef.x;
    const dy = e.y - this.originEcef.y;
    const dz = e.z - this.originEcef.z;
    const east = -this.sinLon * dx + this.cosLon * dy;
    const north =
      -this.sinLat * this.cosLon * dx - this.sinLat * this.sinLon * dy + this.cosLat * dz;
    const up = this.cosLat * this.cosLon * dx + this.cosLat * this.sinLon * dy + this.sinLat * dz;
    out.x = east;
    out.y = up;
    out.z = -north;
    return out;
  }

  /** Game-space metres → geographic position. */
  toGeo(v: Vec3): GeoPoint {
    const east = v.x;
    const up = v.y;
    const north = -v.z;
    return ecefToGeodetic({
      x:
        this.originEcef.x -
        this.sinLon * east -
        this.sinLat * this.cosLon * north +
        this.cosLat * this.cosLon * up,
      y:
        this.originEcef.y +
        this.cosLon * east -
        this.sinLat * this.sinLon * north +
        this.cosLat * this.sinLon * up,
      z: this.originEcef.z + this.cosLat * north + this.sinLat * up,
    });
  }
}
