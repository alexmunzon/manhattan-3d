import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Timer,
  WebGLRenderer,
} from 'three';
import { FollowCamera, type CameraRig } from './camera/FollowCamera';
import { readMapsApiKey } from './config/env';
import { SPAWN } from './config/world';
import { AttributionLine } from './hud/attribution';
import { el } from './hud/dom';
import { showNotice } from './hud/notice';
import { PlayHint } from './hud/playHint';
import { showSetupScreen } from './hud/setupScreen';
import { Input } from './input/Input';
import { ModeHud } from './hud/modeHud';
import { Avatar } from './player/Avatar';
import { Character, type CharacterInput } from './player/Character';
import { CharacterModel } from './player/CharacterModel';
import type { AvatarView } from './player/pose';
import type { GameMode } from './state/gameMode';
import { CarModel } from './vehicles/CarModel';
import { GliderWing } from './vehicles/GliderWing';
import { DemoCitySource } from './world/DemoCitySource';
import { GoogleTilesSource } from './world/GoogleTilesSource';
import { LocalFrame } from './world/geo';
import type { WorldSource } from './world/WorldSource';
import './styles.css';

const SKY = new Color('#9cc3e0');
const MAX_PIXEL_RATIO = 2;
const MAX_FRAME_SECONDS = 1 / 20;
const ATTRIBUTION_REFRESH_MS = 500;
const WHEEL_STEP_PX = 100;
/** Hover height of the camera while street-level tiles load, so they stream at high detail. */
const LOADING_CAMERA_HEIGHT = 120;
/** Camera framing per mode (docs/VISUAL_SPEC.md). Glider FOV widens further with speed. */
const RIGS: Record<GameMode, CameraRig> = {
  onFoot: { distance: 4, fov: 60 },
  climbing: { distance: 4, fov: 60 },
  gliding: { distance: 9, fov: 70 },
  driving: { distance: 7, fov: 65 },
};
const GLIDE_FOV_PER_MPS = 0.35;
const FOG = { demo: { near: 300, far: 1400 }, google: { near: 900, far: 4500 } } as const;

async function start(app: HTMLElement): Promise<void> {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  app.append(renderer.domElement);

  const scene = new Scene();
  scene.background = SKY;
  scene.add(new HemisphereLight('#dfeaf5', '#4a4038', 1.2));
  const sun = new DirectionalLight('#fff1dc', 2.2);
  sun.position.set(-300, 400, 200);
  scene.add(sun);

  const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 20_000);
  camera.position.set(0, LOADING_CAMERA_HEIGHT, 1);
  camera.lookAt(0, 0, 0);

  const hud = el('div', 'hud');
  app.append(hud);

  const apiKey = readMapsApiKey();
  const frame = new LocalFrame(SPAWN);
  const world: WorldSource = apiKey
    ? new GoogleTilesSource(frame, apiKey, renderer, camera)
    : new DemoCitySource(frame);
  const fog = apiKey ? FOG.google : FOG.demo;
  scene.fog = new Fog(SKY, fog.near, fog.far);
  scene.add(world.root);

  await world.load();
  if (world.status.kind === 'error') showNotice(hud, 'Map tiles unavailable', world.status.message);
  if (!apiKey) showSetupScreen(hud);

  const attribution = new AttributionLine(hud);
  attribution.set(world.attributions());
  window.setInterval(() => {
    attribution.set(world.attributions());
  }, ATTRIBUTION_REFRESH_MS);

  const input = new Input(renderer.domElement);
  const character = new Character(world);
  const avatar: AvatarView = await CharacterModel.load().catch((error: unknown) => {
    console.warn('Character model failed to load; using placeholder', error);
    return new Avatar();
  });
  const wing = new GliderWing();
  const carModel = new CarModel();
  scene.add(wing.root, carModel.root);
  carModel.root.visible = false;
  const followCamera = new FollowCamera(camera);
  const hint = new PlayHint(hud);
  const modeHud = new ModeHud(hud);
  const intent: CharacterInput = {
    forward: 0,
    right: 0,
    sprint: false,
    jump: false,
    glider: false,
    vehicle: false,
    handbrake: false,
  };

  renderer.domElement.addEventListener(
    'wheel',
    (e) => {
      followCamera.zoom(e.deltaY / WHEEL_STEP_PX);
    },
    { passive: true },
  );
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const timer = new Timer();
  const runFrame = (time: number): void => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), MAX_FRAME_SECONDS);

    const spawned = character.foot.spawned;
    if (!spawned) {
      if (character.trySpawn(dt)) scene.add(avatar.root);
    } else {
      readIntent(input, intent);
      if (input.wasPressed('KeyR')) character.reset();
      character.update(dt, intent, followCamera.yaw);

      const gliding = character.mode === 'gliding';
      const driving = character.mode === 'driving';
      const { car } = character;
      const { position } = character;
      const bank = character.glider.bank;
      avatar.root.position.copy(position);
      avatar.update(dt, character.pose, character.speed, character.facing, bank);
      avatar.root.visible = !driving;
      wing.update(gliding, position.x, position.y, position.z, character.facing, bank);
      carModel.root.visible = character.carPlaced;
      if (character.carPlaced) {
        const p = car.position;
        carModel.update(dt, p.x, p.y, p.z, car.yaw, car.pitch, car.roll, car.speed, car.steer);
      }

      const rig = RIGS[character.mode];
      followCamera.setRig(
        gliding ? { ...rig, fov: rig.fov + character.speed * GLIDE_FOV_PER_MPS } : rig,
      );
      const look = input.look;
      if (gliding || driving) {
        followCamera.recenter(character.facing, dt, look.x !== 0 || look.y !== 0);
      }
      followCamera.update(dt, position, look, world);
      if (gliding) modeHud.set('Gliding', character.speed, character.altitude);
      else modeHud.set(driving ? 'Driving' : null, character.speed, null);
    }
    hint.set(!spawned ? 'loading' : input.locked ? 'playing' : 'unlocked');

    world.update(camera);
    renderer.render(scene, camera);
    input.endFrame();
  };
  renderer.setAnimationLoop(runFrame);

  if (import.meta.env.DEV) window.__manhattan = { renderer, world, camera, character };
}

/**
 * Dev-only `?headless`: drive frames from a timer instead of requestAnimationFrame, which browsers
 * pause in hidden tabs. Used by automated browser checks; rendering and tile streaming both keep
 * running. Must run before anything schedules a frame.
 */
function installHeadlessClock(): void {
  const FRAME_MS = 16;
  window.requestAnimationFrame = (callback) =>
    window.setTimeout(() => {
      callback(performance.now());
    }, FRAME_MS);
  window.cancelAnimationFrame = (handle) => {
    window.clearTimeout(handle);
  };
}

/** Maps held keys to a device-independent movement intent. */
function readIntent(input: Input, out: CharacterInput): void {
  const axis = (pos: string, neg: string): number =>
    (input.isDown(pos) ? 1 : 0) - (input.isDown(neg) ? 1 : 0);
  out.forward = axis('KeyW', 'KeyS');
  out.right = axis('KeyD', 'KeyA');
  out.sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
  out.jump = input.wasPressed('Space');
  out.glider = input.wasPressed('KeyH');
  out.vehicle = input.wasPressed('KeyV');
  out.handbrake = input.isDown('Space');
}

if (import.meta.env.DEV && new URLSearchParams(location.search).has('headless')) {
  installHeadlessClock();
}

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app root element');
start(app).catch((error: unknown) => {
  console.error('Failed to start', error);
});
