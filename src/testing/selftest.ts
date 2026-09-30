import type { Vector3 } from 'three';
import { el } from '../hud/dom';
import type { Character, CharacterInput } from '../player/Character';
import type { WorldSource } from '../world/WorldSource';
import { ScenarioRun, type Scenario, type ScenarioResult } from './scenario';
import { bridgeWalk, buttonMash, facadeClimbs, fullLoop, resetMidAction } from './scenarios';

/**
 * Dev-only in-browser runner: `?headless&selftest=loop|climbs|bridge|google|all`. Plays the scenarios through
 * the real game loop (camera included) on whatever world is loaded: Google tiles when a key is
 * set, or the demo city with `?demo`. Results appear in a HUD panel and on
 * `window.__manhattan.selftest` (step names, positions and counts only).
 */

const SUITES: Record<string, () => Scenario[]> = {
  loop: () => [fullLoop()],
  climbs: () => [facadeClimbs()],
  /** B1: Brooklyn Bridge deck walk; skipped on the demo city. */
  bridge: () => [bridgeWalk()],
  /** G1 + G2 in one page load, so one Google tiles session. */
  google: () => [fullLoop(), facadeClimbs()],
  all: () => [fullLoop(), ...resetMidAction(), buttonMash(), facadeClimbs()],
};

export interface SelftestDriver {
  /** Scripted input for this frame, or null when not (or no longer) running. */
  next(dt: number): { input: CharacterInput; yaw?: number | undefined } | null;
  /** Per-frame checks, after the character and camera have updated. */
  observe(dt: number, input: CharacterInput, camera: Vector3): void;
}

export function createSelftest(
  suite: string,
  character: Character,
  world: WorldSource,
  hud: HTMLElement,
): SelftestDriver | null {
  const make = SUITES[suite];
  if (!make) {
    console.warn(`[selftest] unknown suite "${suite}"; use ${Object.keys(SUITES).join(', ')}`);
    return null;
  }
  const queue = make();
  const results: ScenarioResult[] = [];
  const panel = el('pre', 'selftest');
  Object.assign(panel.style, {
    position: 'absolute',
    left: '16px',
    bottom: '16px',
    maxWidth: 'min(560px, calc(100vw - 32px))',
    maxHeight: '45vh',
    overflow: 'auto',
    margin: '0',
    padding: '10px 12px',
    font: '12px/1.4 ui-monospace, monospace',
    color: '#e8edf2',
    background: 'rgba(10, 14, 18, 0.85)',
    borderRadius: '8px',
    whiteSpace: 'pre-wrap',
    zIndex: '50',
  });
  hud.append(panel);

  let run: ScenarioRun | null = null;
  let finished = false;
  let frames = 0;

  const render = (): void => {
    const lines = [...results, ...(run ? [run.result] : [])].map(describe);
    const status = finished
      ? `done: ${results.filter((r) => r.passed).length}/${results.length} passed`
      : 'running…';
    panel.textContent = [`selftest "${suite}" on ${world.id}: ${status}`, ...lines].join('\n');
  };

  const finish = (): void => {
    finished = true;
    render();
    if (window.__manhattan) window.__manhattan.selftest = results;
  };

  return {
    next(dt) {
      if (finished) return null;
      for (;;) {
        if (!run) {
          const scenario = queue.shift();
          if (!scenario) {
            finish();
            return null;
          }
          character.reset();
          run = new ScenarioRun(scenario, character, world, character.position);
        }
        const frame = run.next(dt);
        if (frame) return frame;
        results.push(run.result);
        run = null;
        render();
      }
    },
    observe(dt, input, camera) {
      run?.observe(dt, input, camera);
      if (run && ++frames % 20 === 0) render();
    },
  };
}

function describe(result: ScenarioResult): string {
  const mark = result.passed ? 'PASS' : result.steps.length === 0 ? '....' : 'FAIL';
  const lines = [`${mark} ${result.name}`];
  for (const step of result.steps) {
    if (step.status === 'pass' && !step.detail) continue;
    lines.push(`   ${step.status} ${step.name}${step.detail ? `: ${step.detail}` : ''}`);
  }
  for (const v of result.violations) lines.push(`   rule ${v.rule} at ${v.time} s: ${v.detail}`);
  const metrics = Object.entries(result.metrics);
  if (metrics.length) lines.push(`   ${metrics.map(([k, n]) => `${k}=${n}`).join(' ')}`);
  return lines.join('\n');
}
