import {
  BoxGeometry,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferGeometry,
} from 'three';
import type { AvatarView, Pose } from './pose';

const STRIDE_FREQUENCY = 1.6; // swing cycles per metre-per-second of speed
const MAX_SWING = 0.9;
const TURN_RATE = 12;
const AIR_LEG_TUCK = 0.5;
const AIR_ARM_RAISE = 0.9;

const COLORS = { skin: '#d9ad8c', shirt: '#2b6f8f', pants: '#1f2a36', pack: '#3fd0c9' } as const;

/**
 * Stylised procedural mannequin with a simple walk/run/air cycle. Faces -z (north) at yaw 0.
 * Placeholder until a CC0 rigged character is added.
 */
export class Avatar implements AvatarView {
  readonly root = new Group();
  private readonly leftArm = new Group();
  private readonly rightArm = new Group();
  private readonly leftLeg = new Group();
  private readonly rightLeg = new Group();
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: MeshStandardMaterial[] = [];
  private phase = 0;
  private heading = 0;

  constructor() {
    this.root.name = 'avatar';
    const skin = this.material(COLORS.skin);
    const shirt = this.material(COLORS.shirt);
    const pants = this.material(COLORS.pants);
    const pack = this.material(COLORS.pack);

    const torso = this.mesh(new CapsuleGeometry(0.2, 0.45, 4, 12), shirt);
    torso.position.y = 1.2;
    const head = this.mesh(new SphereGeometry(0.14, 16, 12), skin);
    head.position.y = 1.66;
    const backpack = this.mesh(new BoxGeometry(0.28, 0.32, 0.12), pack);
    backpack.position.set(0, 1.25, 0.22);

    this.limb(this.leftArm, -0.27, 1.42, 0.065, 0.5, shirt);
    this.limb(this.rightArm, 0.27, 1.42, 0.065, 0.5, shirt);
    this.limb(this.leftLeg, -0.1, 0.9, 0.085, 0.72, pants);
    this.limb(this.rightLeg, 0.1, 0.9, 0.085, 0.72, pants);

    this.root.add(torso, head, backpack, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);
  }

  update(dt: number, pose: Pose, speed: number, yaw: number, bank: number): void {
    const diff = Math.atan2(Math.sin(yaw - this.heading), Math.cos(yaw - this.heading));
    this.heading += diff * Math.min(1, TURN_RATE * dt);
    this.root.rotation.set(
      pose === 'glide' ? -1.25 : 0,
      this.heading,
      pose === 'glide' ? -bank : 0,
      'YXZ',
    );

    if (pose !== 'idle' && pose !== 'run' && pose !== 'sprint') {
      this.setSwing(AIR_LEG_TUCK, -AIR_LEG_TUCK * 0.4, -AIR_ARM_RAISE, -AIR_ARM_RAISE);
      return;
    }
    this.phase += dt * speed * STRIDE_FREQUENCY * Math.PI;
    const swing = Math.sin(this.phase) * Math.min(1, speed / 5) * MAX_SWING;
    this.setSwing(swing, -swing, -swing * 0.8, swing * 0.8);
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.root.clear();
  }

  private setSwing(leftLeg: number, rightLeg: number, leftArm: number, rightArm: number): void {
    this.leftLeg.rotation.x = leftLeg;
    this.rightLeg.rotation.x = rightLeg;
    this.leftArm.rotation.x = leftArm;
    this.rightArm.rotation.x = rightArm;
  }

  /** Builds a limb hanging from a pivot so rotating the pivot swings it like a joint. */
  private limb(
    pivot: Group,
    x: number,
    y: number,
    radius: number,
    length: number,
    material: MeshStandardMaterial,
  ): void {
    pivot.position.set(x, y, 0);
    const mesh = this.mesh(new CapsuleGeometry(radius, length - radius * 2, 4, 8), material);
    mesh.position.y = -length / 2;
    pivot.add(mesh);
  }

  private mesh(geometry: BufferGeometry, material: MeshStandardMaterial): Mesh {
    this.geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = true;
    return mesh;
  }

  private material(color: string): MeshStandardMaterial {
    const m = new MeshStandardMaterial({ color, roughness: 0.7 });
    this.materials.push(m);
    return m;
  }
}
