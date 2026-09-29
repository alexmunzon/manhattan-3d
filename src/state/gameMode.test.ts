import { describe, expect, it } from 'vitest';
import { nextMode, type GameMode, type ModeEvent } from './gameMode';

describe('nextMode', () => {
  it.each<[GameMode, ModeEvent, GameMode]>([
    ['onFoot', 'climb', 'climbing'],
    ['climbing', 'climbDone', 'onFoot'],
    ['onFoot', 'deployGlider', 'gliding'],
    ['gliding', 'land', 'onFoot'],
    ['gliding', 'stowGlider', 'onFoot'],
    ['gliding', 'reset', 'onFoot'],
    ['climbing', 'reset', 'onFoot'],
  ])('%s + %s -> %s', (mode, event, expected) => {
    expect(nextMode(mode, event)).toBe(expected);
  });

  it.each<[GameMode, ModeEvent]>([
    ['climbing', 'deployGlider'],
    ['onFoot', 'land'],
    ['onFoot', 'stowGlider'],
    ['climbing', 'climb'],
  ])('ignores %s + %s', (mode, event) => {
    expect(nextMode(mode, event)).toBe(mode);
  });
});
