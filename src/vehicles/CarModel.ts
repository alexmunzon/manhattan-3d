import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type BufferGeometry,
} from 'three';

const WHEEL_RADIUS = 0.36;
const WHEEL_POSITIONS = [
  [-0.85, 1.35],
  [0.85, 1.35],
  [-0.85, -1.35],
  [0.85, -1.35],
] as const;

/** Visual representation of the car. Implementations: {@link TaxiModel}, {@link CarModel}. */
export interface CarView {
  readonly root: import('three').Object3D;
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
  ): void;
  dispose(): void;
}

/** Low-poly procedural hatchback, nose toward -z. Fallback if the taxi model fails to load. */
export class CarModel implements CarView {
  readonly root = new Group();
  private readonly wheels: Mesh[] = [];
  private readonly frontPivots: Group[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: MeshStandardMaterial[] = [];
  private wheelSpin = 0;

  constructor(color = '#c8412f') {
    this.root.name = 'car';
    const paint = this.material(color, 0.35, 0.3);
    const glass = this.material('#1b2530', 0.1, 0.6);
    const rubber = this.material('#141414', 0.9, 0);
    const lamp = this.material('#fff4d6', 0.2, 0);

    const body = this.mesh(new BoxGeometry(1.8, 0.62, 4.2), paint);
    body.position.y = 0.66;
    const cabin = this.mesh(new BoxGeometry(1.6, 0.58, 2.1), glass);
    cabin.position.set(0, 1.25, 0.25);
    const roof = this.mesh(new BoxGeometry(1.62, 0.06, 1.9), paint);
    roof.position.set(0, 1.56, 0.3);
    this.root.add(body, cabin, roof);

    for (const x of [-0.6, 0.6]) {
      const light = this.mesh(new BoxGeometry(0.34, 0.14, 0.05), lamp);
      light.position.set(x, 0.78, -2.11);
      this.root.add(light);
    }

    const wheelGeometry = new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.26, 16).rotateZ(
      Math.PI / 2,
    );
    this.geometries.push(wheelGeometry);
    for (const [x, z] of WHEEL_POSITIONS) {
      const pivot = new Group();
      pivot.position.set(x, WHEEL_RADIUS, -z);
      const wheel = new Mesh(wheelGeometry, rubber);
      wheel.castShadow = true;
      pivot.add(wheel);
      this.wheels.push(wheel);
      if (z > 0) this.frontPivots.push(pivot);
      this.root.add(pivot);
    }
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
    this.wheelSpin -= (speed / WHEEL_RADIUS) * dt;
    for (const wheel of this.wheels) wheel.rotation.x = this.wheelSpin;
    for (const pivot of this.frontPivots) pivot.rotation.y = -steer;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.root.clear();
  }

  private mesh(geometry: BufferGeometry, material: MeshStandardMaterial): Mesh {
    this.geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = true;
    return mesh;
  }

  private material(color: string, roughness: number, metalness: number): MeshStandardMaterial {
    const m = new MeshStandardMaterial({ color, roughness, metalness });
    this.materials.push(m);
    return m;
  }
}
