import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';

const SPAN = 9;
const CHORD = 3.2;
const HANG_HEIGHT = 2.3;

/** Delta-wing canopy drawn above the player while gliding. */
export class GliderWing {
  readonly root = new Group();
  private readonly geometry = new BufferGeometry();
  private readonly material = new MeshStandardMaterial({
    color: '#2f7fd6',
    roughness: 0.55,
    side: DoubleSide,
  });

  constructor() {
    this.root.name = 'glider';
    // Nose points -z; slight anhedral droop at the tips.
    const half = SPAN / 2;
    this.geometry.setAttribute(
      'position',
      new Float32BufferAttribute(
        [
          0,
          0,
          -CHORD * 0.6,
          -half,
          -0.35,
          CHORD * 0.4,
          0,
          0.1,
          CHORD * 0.1,
          0,
          0,
          -CHORD * 0.6,
          0,
          0.1,
          CHORD * 0.1,
          half,
          -0.35,
          CHORD * 0.4,
        ],
        3,
      ),
    );
    this.geometry.computeVertexNormals();
    const wing = new Mesh(this.geometry, this.material);
    wing.position.y = HANG_HEIGHT;
    wing.castShadow = true;
    this.root.add(wing);
    this.root.visible = false;
  }

  /** Shows the wing at the player, oriented to heading and bank. */
  update(visible: boolean, x: number, y: number, z: number, yaw: number, bank: number): void {
    this.root.visible = visible;
    if (!visible) return;
    this.root.position.set(x, y, z);
    this.root.rotation.set(0, yaw, -bank, 'YXZ');
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
