import { TilesRenderer } from '3d-tiles-renderer';
import {
  GLTFExtensionsPlugin,
  GoogleCloudAuthPlugin,
  ReorientationPlugin,
  TilesFadePlugin,
  UnloadTilesPlugin,
} from '3d-tiles-renderer/plugins';
import {
  Group,
  Raycaster,
  type Camera,
  type Intersection,
  type Object3D,
  type Ray,
  type WebGLRenderer,
} from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { buildBoundsTrees, disposeBoundsTrees } from '../physics/bvh';
import type { LocalFrame } from './geo';
import { describeTileError } from './tileErrors';
import {
  createWorldHit,
  toWorldHit,
  type WorldHit,
  type WorldSource,
  type WorldDetail,
  type WorldStatus,
} from './WorldSource';

const DEG_TO_RAD = Math.PI / 180;
/** Screen-space error target in pixels; higher loads coarser tiles and fewer requests. */
const ERROR_TARGET: Record<WorldDetail, number> = { high: 20, low: 40 };
/** GPU/CPU budget for cached tiles before least-recently-used tiles are evicted. */
const CACHE_MAX_BYTES = 350 * 1024 * 1024;
const CACHE_MIN_BYTES = 250 * 1024 * 1024;
const RAY_CEILING = 2_000;
const DRACO_DECODER_PATH = '/draco/';

/**
 * Google Photorealistic 3D Tiles, streamed around the frame origin. Tiles live in memory only
 * and are evicted by the renderer's LRU cache; nothing is persisted.
 */
export class GoogleTilesSource implements WorldSource {
  readonly id = 'google';
  readonly root = new Group();
  private currentStatus: WorldStatus = { kind: 'idle' };
  private readonly tiles: TilesRenderer;
  private readonly dracoLoader = new DRACOLoader().setDecoderPath(DRACO_DECODER_PATH);
  private readonly raycaster = new Raycaster();
  private readonly downRay: Ray;
  private readonly hits: Intersection[] = [];
  private readonly hit = createWorldHit();
  private readonly credits: string[] = [];
  private readonly attributionScratch: { type: string; value: unknown }[] = [];

  constructor(
    readonly frame: LocalFrame,
    apiKey: string,
    private readonly renderer: WebGLRenderer,
    camera: Camera,
  ) {
    this.root.name = 'google-tiles';
    this.tiles = new TilesRenderer();
    this.tiles.registerPlugin(
      new GoogleCloudAuthPlugin({ apiToken: apiKey, autoRefreshToken: true }),
    );
    this.tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: this.dracoLoader }));
    this.tiles.registerPlugin(new TilesFadePlugin());
    this.tiles.registerPlugin(new UnloadTilesPlugin());
    this.tiles.registerPlugin(
      new ReorientationPlugin({
        lat: frame.origin.lat * DEG_TO_RAD,
        lon: frame.origin.lon * DEG_TO_RAD,
        height: frame.origin.alt,
      }),
    );
    this.tiles.errorTarget = ERROR_TARGET.high;
    this.tiles.lruCache.maxBytesSize = CACHE_MAX_BYTES;
    this.tiles.lruCache.minBytesSize = CACHE_MIN_BYTES;
    this.tiles.setCamera(camera);
    this.tiles.addEventListener('load-model', ({ scene }: { scene: Object3D }) => {
      buildBoundsTrees(scene);
    });
    this.tiles.addEventListener('dispose-model', ({ scene }: { scene: Object3D }) => {
      disposeBoundsTrees(scene);
    });
    this.raycaster.firstHitOnly = true;

    // ReorientationPlugin yields +x west / +z north; game space is +x east / -z north.
    this.root.rotation.y = Math.PI;
    this.root.add(this.tiles.group);

    this.downRay = this.raycaster.ray.clone();
    this.downRay.direction.set(0, -1, 0);
  }

  get status(): WorldStatus {
    return this.currentStatus;
  }

  load(): Promise<void> {
    this.currentStatus = { kind: 'loading' };
    return new Promise((resolve) => {
      const onRoot = (): void => {
        this.currentStatus = { kind: 'ready' };
        cleanup();
        resolve();
      };
      const onError = (event: { tile: unknown; error: unknown }): void => {
        if (event.tile !== null) return; // individual tile failures are retried by the renderer
        this.currentStatus = { kind: 'error', message: describeTileError(event.error) };
        cleanup();
        resolve();
      };
      const cleanup = (): void => {
        this.tiles.removeEventListener('load-root-tileset', onRoot);
        this.tiles.removeEventListener('load-error', onError);
      };
      this.tiles.addEventListener('load-root-tileset', onRoot);
      this.tiles.addEventListener('load-error', onError);
      // The root tileset request is made on the first update.
      this.tiles.update();
    });
  }

  update(camera: Camera): void {
    this.tiles.setResolutionFromRenderer(camera, this.renderer);
    camera.updateMatrixWorld();
    this.tiles.update();
  }

  addCamera(camera: Camera, width: number, height: number): void {
    this.tiles.setCamera(camera);
    this.tiles.setResolution(camera, width, height);
  }

  removeCamera(camera: Camera): void {
    this.tiles.deleteCamera(camera);
  }

  setDetail(detail: WorldDetail): void {
    this.tiles.errorTarget = ERROR_TARGET[detail];
  }

  raycast(ray: Ray, maxDistance: number): WorldHit | null {
    this.raycaster.ray.copy(ray);
    this.raycaster.far = maxDistance;
    this.hits.length = 0;
    this.raycaster.intersectObject(this.tiles.group, true, this.hits);
    const hit = this.hits[0];
    return hit ? toWorldHit(hit, this.raycaster.ray, this.hit) : null;
  }

  heightAt(x: number, z: number): number | null {
    this.downRay.origin.set(x, RAY_CEILING, z);
    const hit = this.raycast(this.downRay, RAY_CEILING * 2);
    return hit ? hit.point.y : null;
  }

  attributions(): readonly string[] {
    this.attributionScratch.length = 0;
    this.tiles.getAttributions(this.attributionScratch);
    this.credits.length = 0;
    this.credits.push('Google');
    for (const { type, value } of this.attributionScratch) {
      if (type === 'string' && typeof value === 'string' && value) this.credits.push(value);
    }
    return this.credits;
  }

  dispose(): void {
    this.tiles.dispose();
    this.dracoLoader.dispose();
    this.root.clear();
    this.currentStatus = { kind: 'idle' };
  }
}
