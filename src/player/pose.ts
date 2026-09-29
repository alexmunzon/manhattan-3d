/** High-level body pose the character view should display this frame. */
export type Pose = 'idle' | 'run' | 'sprint' | 'jump' | 'fall' | 'climb' | 'glide' | 'drive';

/** Visual representation of the player. Implementations: {@link CharacterModel}, {@link Avatar}. */
export interface AvatarView {
  readonly root: import('three').Object3D;
  /** Sets the pose, locomotion speed (m/s), facing yaw (0 = north) and glider bank (radians). */
  update(dt: number, pose: Pose, speed: number, yaw: number, bank: number): void;
  dispose(): void;
}
