import {
  AnimationMixer,
  Box3,
  Color,
  Group,
  LoopOnce,
  Mesh,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Material,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AvatarView, Pose } from './pose';

const MODEL_URL = '/models/character.glb';
const TARGET_HEIGHT = 1.8;
const CROSSFADE_SECONDS = 0.18;
const TURN_RATE = 12;
/** Native ground speed (m/s) of the run and sprint clips, used to stop feet sliding. */
const RUN_CLIP_SPEED = 4.5;
const SPRINT_CLIP_SPEED = 8;
/** Glide: tip the body forward into a prone hang-glider position. */
const GLIDE_PITCH = -1.25;

const CLIP_FOR_POSE: Record<Pose, string> = {
  idle: 'Rig|Idle_Loop',
  run: 'Rig|Jog_Fwd_Loop',
  sprint: 'Rig|Sprint_Loop',
  jump: 'Rig|Jump_Start',
  fall: 'Rig|Jump_Loop',
  climb: 'Rig|Crouch_Fwd_Loop',
  glide: 'Rig|Jump_Loop',
  drive: 'Rig|Driving_Loop',
};

/** Rigged, animated character (Quaternius Universal Animation Library). */
export class CharacterModel implements AvatarView {
  readonly root = new Group();
  private readonly body = new Group();
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<Pose, AnimationAction>();
  private current: AnimationAction | null = null;
  private currentPose: Pose | null = null;
  private heading = 0;

  private constructor(model: Object3D, clips: AnimationClip[]) {
    this.root.name = 'character';
    // Normalise to human height with feet at y = 0, facing -z.
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    model.scale.multiplyScalar(TARGET_HEIGHT / size.y);
    const box = new Box3().setFromObject(model);
    model.position.y -= box.min.y;
    model.rotation.y = Math.PI;
    model.traverse((node) => {
      node.castShadow = true;
      node.frustumCulled = false; // skinned bounds don't follow animation
    });
    this.body.add(model);
    this.root.add(this.body);

    this.mixer = new AnimationMixer(model);
    for (const [pose, name] of Object.entries(CLIP_FOR_POSE) as [Pose, string][]) {
      const clip = clips.find((c) => c.name === name);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      if (pose === 'jump') {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(pose, action);
    }
  }

  /** Loads the character model; rejects if the file is missing or invalid. */
  static async load(): Promise<CharacterModel> {
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    return new CharacterModel(gltf.scene, gltf.animations);
  }

  update(dt: number, pose: Pose, speed: number, yaw: number, bank: number): void {
    const diff = Math.atan2(Math.sin(yaw - this.heading), Math.cos(yaw - this.heading));
    this.heading += diff * Math.min(1, TURN_RATE * dt);
    this.root.rotation.y = this.heading;
    const gliding = pose === 'glide';
    this.body.rotation.set(gliding ? GLIDE_PITCH : 0, 0, gliding ? -bank : 0);
    this.body.position.y = gliding ? 1.2 : 0;

    this.play(pose);
    if (this.current) {
      if (pose === 'run') this.current.timeScale = Math.max(0.6, speed / RUN_CLIP_SPEED);
      else if (pose === 'sprint') this.current.timeScale = speed / SPRINT_CLIP_SPEED;
      else this.current.timeScale = 1;
    }
    this.mixer.update(dt);
  }

  setColor(color: string): void {
    this.root.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const mesh = node as Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of materials) if ('color' in m && m.color instanceof Color) m.color.set(color);
    });
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.root.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const mesh = node as Mesh;
      mesh.geometry.dispose();
      const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of materials) m.dispose();
    });
    this.root.clear();
  }

  private play(pose: Pose): void {
    if (pose === this.currentPose) return;
    this.currentPose = pose;
    const next = this.actions.get(pose);
    if (!next || next === this.current) return;
    next.reset().play();
    if (this.current) next.crossFadeFrom(this.current, CROSSFADE_SECONDS, false);
    this.current = next;
  }
}
