import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { readMapsApiKey } from './config/env';
import { SPAWN } from './config/world';
import { AttributionLine } from './hud/attribution';
import { el } from './hud/dom';
import { showNotice } from './hud/notice';
import { showSetupScreen } from './hud/setupScreen';
import { DemoCitySource } from './world/DemoCitySource';
import { GoogleTilesSource } from './world/GoogleTilesSource';
import { LocalFrame } from './world/geo';
import type { WorldSource } from './world/WorldSource';
import './styles.css';

const SKY = new Color('#9cc3e0');
const MAX_PIXEL_RATIO = 2;
const ATTRIBUTION_REFRESH_MS = 500;

type Vec3Tuple = [number, number, number];

/** Per-source view settings: fog range and the initial orbit camera placement. */
const VIEW: Record<
  'demo' | 'google',
  { fogNear: number; fogFar: number; eye: Vec3Tuple; target: Vec3Tuple }
> = {
  demo: { fogNear: 300, fogFar: 1400, eye: [220, 180, 220], target: [0, 0, 0] },
  // Street level in Lower Manhattan sits roughly 30 m below the WGS84 ellipsoid.
  google: { fogNear: 900, fogFar: 4500, eye: [350, 260, 350], target: [0, -30, 0] },
};

async function start(app: HTMLElement): Promise<void> {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  app.append(renderer.domElement);

  const scene = new Scene();
  scene.background = SKY;
  scene.add(new HemisphereLight('#dfeaf5', '#4a4038', 1.2));
  const sun = new DirectionalLight('#fff1dc', 2.2);
  sun.position.set(-300, 400, 200);
  scene.add(sun);

  const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 20_000);

  const hud = el('div', 'hud');
  app.append(hud);

  const apiKey = readMapsApiKey();
  const frame = new LocalFrame(SPAWN);
  const world: WorldSource = apiKey
    ? new GoogleTilesSource(frame, apiKey, renderer, camera)
    : new DemoCitySource(frame);
  const view = apiKey ? VIEW.google : VIEW.demo;
  scene.fog = new Fog(SKY, view.fogNear, view.fogFar);
  camera.position.set(...view.eye);
  scene.add(world.root);

  // Temporary free-orbit viewer; replaced by the player controller in M2.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...view.target);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();

  await world.load();
  if (world.status.kind === 'error') showNotice(hud, 'Map tiles unavailable', world.status.message);
  if (!apiKey) showSetupScreen(hud);

  const attribution = new AttributionLine(hud);
  attribution.set(world.attributions());
  window.setInterval(() => {
    attribution.set(world.attributions());
  }, ATTRIBUTION_REFRESH_MS);

  if (import.meta.env.DEV) window.__manhattan = { renderer, world, camera };

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  renderer.setAnimationLoop(() => {
    controls.update();
    world.update(camera);
    renderer.render(scene, camera);
  });
}

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app root element');
start(app).catch((error: unknown) => {
  console.error('Failed to start', error);
});
