const PLACEHOLDER_KEY = 'your-restricted-key-here';

/**
 * Returns the Google Maps API key from `.env`, or `null` if it is unset or still the placeholder.
 * The key is bundled into the client by design (browser keys are public); never log it.
 */
export function readMapsApiKey(): string | null {
  const raw: unknown = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (typeof raw !== 'string') return null;
  const key = raw.trim();
  return key && key !== PLACEHOLDER_KEY ? key : null;
}
