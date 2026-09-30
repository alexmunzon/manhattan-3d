import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Raycaster,
  type Intersection,
  type Ray,
} from 'three';
import type { LocalFrame } from './geo';
import { createRandom } from './random';
import {
  createWorldHit,
  toWorldHit,
  type WorldHit,
  type WorldSource,
  type WorldStatus,
} from './WorldSource';

/** Layout parameters for the generated grid city. */
export interface DemoCityOptions {
  seed: number;
  blocksPerSide: number;
  blockSize: number;
  streetWidth: number;
  minHeight: number;
  maxHeight: number;
}

const DEFAULT_OPTIONS: DemoCityOptions = {
  seed: 1811, // the year of the Commissioners' Plan that laid out Manhattan's grid
  blocksPerSide: 10,
  blockSize: 60,
  streetWidth: 18,
  minHeight: 12,
  maxHeight: 160,
};

const BUILDINGS_PER_BLOCK = 4;
const RAY_CEILING = 10_000;
const FACADE_TONES = ['#8b939a', '#a59d91', '#6f7a83', '#b8b2a7', '#5d6770'] as const;

/**
 * Offline, procedurally generated stand-in city. Needs no API key or network, so the game and the
 * test suite run anywhere. It is clearly labelled as synthetic and never presented as map data.
 */
export class DemoCitySource implements WorldSource {
  readonly id = 'demo';
  readonly root = new Group();
  private currentStatus: WorldStatus = { kind: 'idle' };
  private readonly options: DemoCityOptions;
  private readonly raycaster = new Raycaster();
  private readonly downRay: Ray;
  private readonly hits: Intersection[] = [];
  private readonly hit = createWorldHit();
  private buildings: InstancedMesh | null = null;
  private ground: Mesh | null = null;

  constructor(
    readonly frame: LocalFrame,
    options: Partial<DemoCityOptions> = {},
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.root.name = 'demo-city';
    this.downRay = this.raycaster.ray.clone();
    this.downRay.direction.set(0, -1, 0);
  }

  get status(): WorldStatus {
    return this.currentStatus;
  }

  /** Static geometry never streams. */
  readonly streaming = false;

  load(): Promise<void> {
    if (this.currentStatus.kind === 'ready') return Promise.resolve();
    const { blocksPerSide, blockSize, streetWidth } = this.options;
    const extent = blocksPerSide * (blockSize + streetWidth);

    const ground = new Mesh(
      new PlaneGeometry(extent * 1.5, extent * 1.5).rotateX(-Math.PI / 2),
      new MeshStandardMaterial({ color: '#3a3f44', roughness: 0.95 }),
    );
    ground.name = 'demo-ground';
    ground.receiveShadow = true;

    this.buildings = this.createBuildings(extent);
    this.ground = ground;
    this.root.add(ground, this.buildings);
    this.root.updateMatrixWorld(true);
    this.currentStatus = { kind: 'ready' };
    return Promise.resolve();
  }

  update(): void {
    // Static geometry: nothing to stream.
  }

  addCamera(): void {
    // Static geometry is visible to every camera.
  }

  removeCamera(): void {
    // Nothing to release.
  }

  setDetail(): void {
    // A single detail level.
  }

  raycast(ray: Ray, maxDistance: number): WorldHit | null {
    this.raycaster.ray.copy(ray);
    this.raycaster.far = maxDistance;
    this.hits.length = 0;
    this.raycaster.intersectObject(this.root, true, this.hits);
    const hit = this.hits[0];
    return hit ? toWorldHit(hit, this.raycaster.ray, this.hit) : null;
  }

  heightAt(x: number, z: number): number | null {
    this.downRay.origin.set(x, RAY_CEILING, z);
    const hit = this.raycast(this.downRay, RAY_CEILING * 2);
    return hit ? hit.point.y : null;
  }

  attributions(): readonly string[] {
    return ['Procedural demo city: synthetic geometry, not real map data'];
  }

  dispose(): void {
    for (const mesh of [this.buildings, this.ground]) {
      if (!mesh) continue;
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    }
    this.buildings?.dispose();
    this.root.clear();
    this.buildings = null;
    this.ground = null;
    this.currentStatus = { kind: 'idle' };
  }

  private createBuildings(extent: number): InstancedMesh {
    const { seed, blocksPerSide, blockSize, streetWidth, minHeight, maxHeight } = this.options;
    const random = createRandom(seed);
    const count = blocksPerSide * blocksPerSide * BUILDINGS_PER_BLOCK;
    // Unit cube with its base at y = 0, so scaling Y sets the building height directly.
    const geometry = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const material = new MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 });
    const mesh = new InstancedMesh(geometry, material, count);
    mesh.name = 'demo-buildings';
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const matrix = new Matrix4();
    const color = new Color();
    const pitch = blockSize + streetWidth;
    const half = blockSize / 2;
    let index = 0;
    for (let bx = 0; bx < blocksPerSide; bx++) {
      for (let bz = 0; bz < blocksPerSide; bz++) {
        const cx = -extent / 2 + streetWidth / 2 + half + bx * pitch;
        const cz = -extent / 2 + streetWidth / 2 + half + bz * pitch;
        // Split each block into a 2x2 grid of lots.
        for (let lot = 0; lot < BUILDINGS_PER_BLOCK; lot++) {
          const lx = cx + (lot % 2 === 0 ? -half / 2 : half / 2);
          const lz = cz + (lot < 2 ? -half / 2 : half / 2);
          const height = minHeight + (maxHeight - minHeight) * random() ** 2;
          const footprint = half * (0.75 + random() * 0.2);
          matrix.makeScale(footprint, height, footprint).setPosition(lx, 0, lz);
          mesh.setMatrixAt(index, matrix);
          const tone = FACADE_TONES[Math.floor(random() * FACADE_TONES.length)] ?? FACADE_TONES[0];
          mesh.setColorAt(index, color.set(tone));
          index++;
        }
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }
}
