import {
  ACESFilmicToneMapping,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Timer,
  WebGLRenderer,
} from 'three';
import { FollowCamera, type CameraRig } from './camera/FollowCamera';
import { readMapsApiKey } from './config/env';
import { isInManhattan } from './config/places';
import { SPAWN } from './config/world';
import { AttributionLine, GOOGLE_MAPS_LOGO } from './hud/attribution';
import { mountControlsLegend } from './hud/ControlsLegend';
import { DebugOverlay } from './hud/DebugOverlay';
import { el } from './hud/dom';
import { InfoPanel } from './hud/InfoPanel';
import { Minimap } from './hud/Minimap';
import { ModeHud } from './hud/modeHud';
import { showNotice } from './hud/notice';
import { PlayHint } from './hud/playHint';
import { Toast } from './hud/toast';
import { showSetupScreen } from './hud/setupScreen';
import { TeleportBar } from './hud/TeleportBar';
import { Input } from './input/Input';
import type { SelftestDriver } from './testing/selftest';
import { Avatar } from './player/Avatar';
import { Character, type CharacterInput } from './player/Character';
import { CharacterModel } from './player/CharacterModel';
import type { AvatarView } from './player/pose';
import { BlobShadow } from './scene/BlobShadow';
import { Environment } from './scene/environment';
import type { GameMode } from './state/gameMode';
import { CarModel, type CarView } from './vehicles/CarModel';
import { GliderWing } from './vehicles/GliderWing';
import { TaxiModel } from './vehicles/TaxiModel';
import { DemoCitySource } from './world/DemoCitySource';
import { GoogleTilesSource } from './world/GoogleTilesSource';
import { LocalFrame, type GeoPoint } from './world/geo';
import type { WorldSource } from './world/WorldSource';
import './styles.css';

const MAX_PIXEL_RATIO = 2;
const MAX_FRAME_SECONDS = 1 / 20;
const HUD_REFRESH_MS = 250;
const WHEEL_STEP_PX = 100;
/** Hover height of the camera while street-level tiles load, so they stream at high detail. */
const LOADING_CAMERA_HEIGHT = 120;
/** Camera framing per mode (docs/VISUAL_SPEC.md). Glider FOV widens further with speed. */
const RIGS: Record<GameMode, CameraRig> = {
  onFoot: { distance: 4, fov: 60, height: 1.6 },
  climbing: { distance: 4, fov: 60, height: 1.6 },
  // Pivot above the wing so the canopy is seen from above rather than edge-on.
  gliding: { distance: 9, fov: 70, height: 3.6 },
  driving: { distance: 7, fov: 65, height: 1.8 },
};
const GLIDE_FOV_PER_MPS = 0.35;
const FOG = { demo: { near: 300, far: 1400 }, google: { near: 900, far: 4500 } } as const;

async function start(app: HTMLElement): Promise<void> {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.info.autoReset = false; // main view + minimap are counted together
  app.append(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 20_000);
  const hud = el('div', 'hud');
  app.append(hud);

  // Dev-only `?demo`: the free demo city (with some climbable low buildings) even when a key is set.
  const forceDemo = import.meta.env.DEV && new URLSearchParams(location.search).has('demo');
  const apiKey = forceDemo ? undefined : readMapsApiKey();
  const frame = new LocalFrame(SPAWN);
  const world: WorldSource = apiKey
    ? new GoogleTilesSource(frame, apiKey, renderer, camera)
    : new DemoCitySource(frame, forceDemo ? { minHeight: 1.6 } : {});
  const fog = apiKey ? FOG.google : FOG.demo;
  const environment = new Environment(scene, fog.near, fog.far);
  scene.add(new HemisphereLight('#dfeaf5', '#4a4038', 1.2));
  const sun = new DirectionalLight('#fff1dc', 2.2);
  sun.position.copy(environment.sunDirection).multiplyScalar(500);
  scene.add(sun, world.root);

  const target = spawnTarget(frame);
  camera.position.set(target.x, LOADING_CAMERA_HEIGHT, target.z + 1);
  camera.lookAt(target.x, 0, target.z);

  await world.load();
  if (world.status.kind === 'error') showNotice(hud, 'Map tiles unavailable', world.status.message);

  const character = new Character(world);
  const [avatar, carModel] = await Promise.all([loadAvatar(), loadCar()]);
  const wing = new GliderWing();
  scene.add(wing.root, carModel.root);
  carModel.root.visible = false;
  const avatarShadow = new BlobShadow(scene, world, 1.1, 1.1);
  const carShadow = new BlobShadow(scene, world, 2.4, 4.8, 0.55);

  const input = new Input(renderer.domElement);
  const followCamera = new FollowCamera(camera);
  const modeHud = new ModeHud(hud);
  const hint = new PlayHint(hud);
  const toast = new Toast(hud);
  const minimap = new Minimap(hud, world);
  const info = new InfoPanel(hud, {
    onColor: (color) => {
      avatar.setColor(color);
    },
    onDetail: (detail) => {
      world.setDetail(detail);
      renderer.setPixelRatio(
        detail === 'high' ? Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO) : 1,
      );
    },
  });
  new TeleportBar(hud, (point: GeoPoint) => {
    const local = frame.toLocal(point);
    target.x = local.x;
    target.z = local.z;
    character.teleport(local.x, local.z);
  });
  mountControlsLegend(hud);
  const debug = new DebugOverlay(hud);
  // Google's policy requires its logo on screen with Google tiles; the demo city shows none.
  const attribution = new AttributionLine(hud, {
    logo: world.id === 'google' ? GOOGLE_MAPS_LOGO : undefined,
  });
  if (!apiKey && !forceDemo) showSetupScreen(hud);
  const selftest = import.meta.env.DEV ? await loadSelftest(character, world, hud) : null;

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
  let lastHud = 0;
  let avatarAdded = false;
  const runFrame = (time: number): void => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), MAX_FRAME_SECONDS);
    renderer.info.reset();

    if (input.wasPressed('Backquote')) debug.toggle();
    const spawned = character.foot.spawned;
    if (!spawned) {
      camera.position.set(target.x, LOADING_CAMERA_HEIGHT, target.z + 1);
      camera.lookAt(target.x, 0, target.z);
      if (character.trySpawn(dt, target.x, target.z) && !avatarAdded) {
        scene.add(avatar.root);
        avatarAdded = true;
      }
    } else {
      readIntent(input, intent);
      if (input.wasPressed('KeyR')) character.reset();
      if (input.wasPressed('KeyC')) followCamera.toggleWide();
      const scripted = selftest?.next(dt);
      if (scripted) {
        Object.assign(intent, scripted.input);
        if (scripted.yaw !== undefined) followCamera.yaw = scripted.yaw;
      }
      character.update(dt, intent, followCamera.yaw);

      const gliding = character.mode === 'gliding';
      const driving = character.mode === 'driving';
      const { car, position } = character;
      const bank = character.glider.bank;
      avatar.root.position.copy(position);
      avatar.update(dt, character.pose, character.speed, character.facing, bank);
      avatar.root.visible = !driving;
      avatarShadow.update(position, character.facing, !driving);
      wing.update(gliding, position.x, position.y, position.z, character.facing, bank);
      carModel.root.visible = character.carPlaced;
      carShadow.update(car.position, car.yaw, character.carPlaced);
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
      selftest?.observe(dt, intent, camera.position);
      const notice = character.takeNotice();
      if (notice) toast.show(notice);
      if (gliding) modeHud.set('Gliding', character.speed, character.altitude);
      else modeHud.set(driving ? 'Driving' : null, character.speed, null);
    }
    hint.set(!spawned ? 'loading' : input.locked ? 'playing' : 'unlocked');

    environment.follow(camera.position);
    world.update(camera);
    renderer.render(scene, camera);
    minimap.render(renderer, scene, character.position, character.facing, followCamera.yaw);
    debug.update(dt, renderer);

    if (time - lastHud > HUD_REFRESH_MS) {
      lastHud = time;
      attribution.set(world.attributions());
      if (spawned) info.setPosition(frame.toGeo(character.position));
    }
    input.endFrame();
  };
  renderer.setAnimationLoop(runFrame);

  if (import.meta.env.DEV) window.__manhattan = { renderer, world, camera, character };
}

/** Dev-only `?selftest=<suite>`: loads the scripted gameplay runner (see src/testing/selftest.ts). */
async function loadSelftest(
  character: Character,
  world: WorldSource,
  hud: HTMLElement,
): Promise<SelftestDriver | null> {
  const suite = new URLSearchParams(location.search).get('selftest');
  if (!suite) return null;
  const { createSelftest } = await import('./testing/selftest');
  return createSelftest(suite, character, world, hud);
}

/** Spawn point in game space: `?lat=&lon=` from a shared link if it's in Manhattan, else SPAWN. */
function spawnTarget(frame: LocalFrame): { x: number; z: number } {
  const params = new URLSearchParams(window.location.search);
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (params.has('lat') && params.has('lon') && isInManhattan(lat, lon)) {
    const local = frame.toLocal({ lat, lon, alt: 0 });
    return { x: local.x, z: local.z };
  }
  return { x: 0, z: 0 };
}

async function loadAvatar(): Promise<AvatarView> {
  try {
    return await CharacterModel.load();
  } catch (error) {
    console.warn('Character model failed to load; using placeholder', error);
    return new Avatar();
  }
}

async function loadCar(): Promise<CarView> {
  try {
    return await TaxiModel.load();
  } catch (error) {
    console.warn('Taxi model failed to load; using placeholder', error);
    return new CarModel();
  }
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

if (import.meta.env.DEV && new URLSearchParams(location.search).has('headless')) {
  installHeadlessClock();
}

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app root element');
start(app).catch((error: unknown) => {
  console.error('Failed to start', error);
});
