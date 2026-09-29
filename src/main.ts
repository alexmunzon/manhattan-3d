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
import { FollowCamera } from './camera/FollowCamera';
import { readMapsApiKey } from './config/env';
import { SPAWN } from './config/world';
import { AttributionLine } from './hud/attribution';
import { el } from './hud/dom';
import { showNotice } from './hud/notice';
import { PlayHint } from './hud/playHint';
import { showSetupScreen } from './hud/setupScreen';
import { Input } from './input/Input';
import { Avatar } from './player/Avatar';
import { PlayerController, type MoveIntent } from './player/PlayerController';
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
  const player = new PlayerController(world);
  const avatar = new Avatar();
  const followCamera = new FollowCamera(camera);
  const hint = new PlayHint(hud);
  const intent: MoveIntent = { forward: 0, right: 0, sprint: false, jump: false };

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

  if (import.meta.env.DEV) window.__manhattan = { renderer, world, camera, player };

  const timer = new Timer();
  renderer.setAnimationLoop((time: number) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), MAX_FRAME_SECONDS);

    if (!player.spawned) {
      if (player.trySpawn(0, 0, dt)) scene.add(avatar.root);
    } else {
      readIntent(input, intent);
      if (input.wasPressed('KeyR')) player.respawn();
      player.update(dt, intent, followCamera.yaw);
      avatar.root.position.copy(player.position);
      avatar.animate(dt, player.velocity.x, player.velocity.z, player.onGround);
      followCamera.update(dt, player.position, input.look, world);
    }
    hint.set(!player.spawned ? 'loading' : input.locked ? 'playing' : 'unlocked');

    world.update(camera);
    renderer.render(scene, camera);
    input.endFrame();
  });
}

/** Maps held keys to a device-independent movement intent. */
function readIntent(input: Input, out: MoveIntent): void {
  const axis = (pos: string, neg: string): number =>
    (input.isDown(pos) ? 1 : 0) - (input.isDown(neg) ? 1 : 0);
  out.forward = axis('KeyW', 'KeyS');
  out.right = axis('KeyD', 'KeyA');
  out.sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
  out.jump = input.wasPressed('Space');
}

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app root element');
start(app).catch((error: unknown) => {
  console.error('Failed to start', error);
});
