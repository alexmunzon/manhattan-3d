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
import { mountAttribution } from './hud/attribution';
import { el } from './hud/dom';
import { showSetupScreen } from './hud/setupScreen';
import { DemoCitySource } from './world/DemoCitySource';
import { LocalFrame } from './world/geo';
import type { WorldSource } from './world/WorldSource';
import './styles.css';

const SKY = new Color('#9cc3e0');
const FOG_NEAR = 300;
const FOG_FAR = 1400;
const MAX_PIXEL_RATIO = 2;

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
  scene.fog = new Fog(SKY, FOG_NEAR, FOG_FAR);
  scene.add(new HemisphereLight('#dfeaf5', '#4a4038', 1.2));
  const sun = new DirectionalLight('#fff1dc', 2.2);
  sun.position.set(-300, 400, 200);
  scene.add(sun);

  const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 5000);
  camera.position.set(220, 180, 220);

  // Temporary free-orbit viewer; replaced by the player controller in M2.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;

  // M1 adds GoogleTilesSource when a key is present; until then every run uses the demo city.
  const hasKey = readMapsApiKey() !== null;
  const world: WorldSource = new DemoCitySource(new LocalFrame(SPAWN));
  await world.load();
  scene.add(world.root);

  const hud = el('div', 'hud');
  app.append(hud);
  mountAttribution(hud, world.attributions());
  if (!hasKey) showSetupScreen(hud);

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
