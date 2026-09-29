import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Ray,
  Vector3,
  type Scene,
} from 'three';
import type { WorldSource } from '../world/WorldSource';

const TEXTURE_PX = 64;
const MAX_HEIGHT = 12;
const LIFT = 0.04;
const UP = new Vector3(0, 1, 0);

/**
 * Soft contact shadow projected onto the ground below an object. Photogrammetry tiles are unlit
 * and can't receive real shadows, so this grounds characters and cars visually.
 */
export class BlobShadow {
  private readonly mesh: Mesh;
  private readonly ray = new Ray(new Vector3(), new Vector3(0, -1, 0));
  private readonly tilt = new Quaternion();

  constructor(
    scene: Scene,
    private readonly world: WorldSource,
    width: number,
    length: number,
    private readonly strength = 0.45,
  ) {
    const material = new MeshBasicMaterial({
      map: createBlobTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      fog: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(width, length).rotateX(-Math.PI / 2), material);
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Places the shadow under `position`, fading with height; hides it if nothing is below. */
  update(position: Vector3, yaw: number, visible: boolean): void {
    this.ray.origin.set(position.x, position.y + 0.5, position.z);
    const hit = visible ? this.world.raycast(this.ray, MAX_HEIGHT) : null;
    this.mesh.visible = hit !== null;
    if (!hit) return;
    this.mesh.position.copy(hit.point).addScaledVector(hit.normal, LIFT);
    this.tilt.setFromUnitVectors(UP, hit.normal);
    this.mesh.quaternion.setFromAxisAngle(UP, yaw).premultiply(this.tilt);
    const fade = 1 - Math.min(1, (hit.distance - 0.5) / MAX_HEIGHT);
    (this.mesh.material as MeshBasicMaterial).opacity = this.strength * fade;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    const material = this.mesh.material as MeshBasicMaterial;
    material.map?.dispose();
    material.dispose();
    this.mesh.removeFromParent();
  }
}

function createBlobTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEXTURE_PX;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const r = TEXTURE_PX / 2;
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.6, 'rgba(0,0,0,0.55)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, TEXTURE_PX, TEXTURE_PX);
  }
  return new CanvasTexture(canvas);
}
