/** Which controller owns the player this frame. Exactly one is active at a time. */
export type GameMode = 'onFoot' | 'climbing' | 'gliding';

export type ModeEvent = 'climb' | 'climbDone' | 'deployGlider' | 'stowGlider' | 'land' | 'reset';

const TRANSITIONS: Record<GameMode, Partial<Record<ModeEvent, GameMode>>> = {
  onFoot: { climb: 'climbing', deployGlider: 'gliding', reset: 'onFoot' },
  climbing: { climbDone: 'onFoot', reset: 'onFoot' },
  gliding: { stowGlider: 'onFoot', land: 'onFoot', climb: 'climbing', reset: 'onFoot' },
};

/** Pure state transition. Events that don't apply to the current mode leave it unchanged. */
export function nextMode(mode: GameMode, event: ModeEvent): GameMode {
  return TRANSITIONS[mode][event] ?? mode;
}
