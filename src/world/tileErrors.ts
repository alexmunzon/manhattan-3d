/**
 * Maps a tile-loading failure to a player-facing message. Never echoes the raw error or URL,
 * which can contain the API key or a session token.
 */
export function describeTileError(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (/\b(401|403)\b/.test(text)) {
    return 'Google rejected the API key. Check that the Map Tiles API is enabled and the key allows this site (http://localhost:5173).';
  }
  if (/\b429\b/.test(text)) {
    return 'Daily Map Tiles quota reached. Tiles will load again once the quota resets.';
  }
  if (/\b5\d\d\b/.test(text)) {
    return 'Google Map Tiles is having trouble right now. Try again in a minute.';
  }
  return 'Could not load map tiles. Check your internet connection and API key.';
}
