const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** Converts a game yaw (0 = north, positive = turning left) to a compass bearing in degrees. */
export function yawToBearing(yaw: number): number {
  const degrees = (-yaw * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

/** Formats a bearing like the reference HUD: `E · 081°`. */
export function formatHeading(bearing: number): string {
  const cardinal = CARDINALS[Math.round(bearing / 45) % 8] ?? 'N';
  return `${cardinal} · ${String(Math.round(bearing) % 360).padStart(3, '0')}°`;
}
