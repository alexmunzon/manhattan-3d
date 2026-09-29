/** Which controller owns the player this frame. Exactly one is active at a time. */
export type GameMode = 'onFoot' | 'climbing' | 'gliding' | 'driving';

export type ModeEvent =
  'climb' | 'climbDone' | 'deployGlider' | 'stowGlider' | 'land' | 'enterCar' | 'exitCar' | 'reset';

const TRANSITIONS: Record<GameMode, Partial<Record<ModeEvent, GameMode>>> = {
  onFoot: { climb: 'climbing', deployGlider: 'gliding', enterCar: 'driving', reset: 'onFoot' },
  climbing: { climbDone: 'onFoot', reset: 'onFoot' },
  gliding: { stowGlider: 'onFoot', land: 'onFoot', climb: 'climbing', reset: 'onFoot' },
  driving: { exitCar: 'onFoot', reset: 'onFoot' },
};

/** Pure state transition. Events that don't apply to the current mode leave it unchanged. */
export function nextMode(mode: GameMode, event: ModeEvent): GameMode {
  return TRANSITIONS[mode][event] ?? mode;
}
