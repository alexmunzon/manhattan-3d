import { Ray, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { SPAWN } from '../config/world';
import { Character } from '../player/Character';
import { DemoCitySource } from '../world/DemoCitySource';
import { LocalFrame } from '../world/geo';
import { ScenarioRun, type Scenario, type ScenarioResult } from './scenario';
import { buttonMash, fullLoop, resetMidAction } from './scenarios';

const DT = 1 / 60;
const MAX_SECONDS = 300;

/** Demo city with the default grid plus some 1.6–2.4 m buildings, so there are ledges to climb. */
async function mixedCity(): Promise<DemoCitySource> {
  const city = new DemoCitySource(new LocalFrame(SPAWN), { minHeight: 1.6 });
  await city.load();
  return city;
}

/** Spawns a fresh character and plays the scenario to the end at 60 fps. */
async function play(scenario: Scenario): Promise<ScenarioResult> {
  const world = await mixedCity();
  const character = new Character(world);
  for (let t = 0; !character.trySpawn(DT); t += DT) if (t > 5) throw new Error('no spawn');
  const spawn: Vector3 = character.position.clone();
  const run = new ScenarioRun(scenario, character, world, spawn);
  let yaw = 0;
  for (let t = 0; t < MAX_SECONDS; t += DT) {
    const frame = run.next(DT);
    if (!frame) break;
    yaw = frame.yaw ?? yaw;
    character.update(DT, frame.input, yaw);
    run.observe(DT, frame.input);
  }
  expect(run.done, 'scenario ran out of time').toBe(true);
  return run.result;
}

/** Readable failure: the first failed step and every per-frame violation. */
function summary(result: ScenarioResult): string {
  const failed = result.steps.find((s) => s.status === 'fail');
  const lines = [failed ? `step "${failed.name}" failed: ${failed.detail ?? ''}` : 'steps ok'];
  for (const v of result.violations) {
    lines.push(`${v.rule} at ${v.time} s (${v.mode}, ${v.position.join(', ')}): ${v.detail}`);
  }
  return lines.join('\n');
}

describe('gameplay scenarios on the demo city', () => {
  it('A: full loop walk → climb → drive → exit → glide → land → reset', async () => {
    const result = await play(fullLoop());
    expect(result.passed, summary(result)).toBe(true);
  });

  it.each(resetMidAction().map((s) => [s.name, s] as const))('B: %s', async (_name, scenario) => {
    const result = await play(scenario);
    expect(result.passed, summary(result)).toBe(true);
  });

  it('C: 20 s of button mashing never breaks a per-frame rule', async () => {
    const result = await play(buttonMash());
    expect(result.passed, summary(result)).toBe(true);
  });

  it('the walk-through check catches a player dragged through a wall', async () => {
    const world = await mixedCity();
    const character = new Character(world);
    for (let t = 0; !character.trySpawn(DT); t += DT) if (t > 5) throw new Error('no spawn');
    const wall = world.raycast(new Ray(new Vector3(0, 1, 24), new Vector3(1, 0, 0)), 50);
    if (!wall) throw new Error('expected a wall east of the street');
    character.foot.placeAt(wall.point.x - 1, 0, 24);
    const scenario: Scenario = {
      name: 'dragged east',
      steps: [{ name: 'drag', timeout: 2, tick: (ctx) => (ctx.t > 0.5 ? 'done' : { input: {} }) }],
    };
    const run = new ScenarioRun(scenario, character, world, character.position);
    for (let frame = run.next(DT); frame; frame = run.next(DT)) {
      character.position.x += 0.1; // move without physics, straight through the wall
      run.observe(DT, frame.input);
    }
    expect(run.result.violations.map((v) => v.rule)).toContain('walked-through');
  });
});
