import { Box3, Group, Mesh, Vector3, type Material, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CarView } from './CarModel';

const MODEL_URL = '/models/taxi.glb';
const WHEEL_RADIUS = 0.26;

/** Quaternius low-poly NYC taxi (CC0). Wheels are re-pivoted about their centres so they spin. */
export class TaxiModel implements CarView {
  readonly root = new Group();
  private readonly spinners: Object3D[] = [];
  private readonly steerers: Group[] = [];
  private wheelSpin = 0;

  private constructor(model: Object3D) {
    this.root.name = 'taxi';
    model.rotation.y = Math.PI; // model nose points +z; game cars face -z
    model.traverse((node) => {
      node.castShadow = true;
    });
    for (const node of [...model.children]) {
      const name = node.name.toLowerCase();
      if (!name.includes('wheel')) continue;
      const pivot = repivot(node);
      this.spinners.push(node);
      if (name.includes('front')) this.steerers.push(pivot);
    }
    this.root.add(model);
  }

  /** Loads the taxi; rejects if the file is missing or invalid. */
  static async load(): Promise<TaxiModel> {
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    return new TaxiModel(gltf.scene);
  }

  update(
    dt: number,
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
    roll: number,
    speed: number,
    steer: number,
  ): void {
    this.root.position.set(x, y, z);
    this.root.rotation.set(pitch, yaw, roll, 'YXZ');
    // The model is flipped 180°, so forward travel spins wheels the opposite way in model space.
    this.wheelSpin += (speed / WHEEL_RADIUS) * dt;
    for (const wheel of this.spinners) wheel.rotation.x = this.wheelSpin;
    for (const pivot of this.steerers) pivot.rotation.y = -steer;
  }

  dispose(): void {
    this.root.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const mesh = node as Mesh;
      mesh.geometry.dispose();
      const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of materials) m.dispose();
    });
    this.root.clear();
  }
}

/** Wraps `node` in a pivot group at its bounding-box centre so rotations turn it in place. */
function repivot(node: Object3D): Group {
  const parent = node.parent;
  if (!parent) throw new Error('wheel has no parent');
  const center = new Box3().setFromObject(node).getCenter(new Vector3());
  parent.worldToLocal(center);
  const pivot = new Group();
  pivot.position.copy(center);
  parent.add(pivot);
  pivot.add(node);
  node.position.sub(center);
  return pivot;
}
