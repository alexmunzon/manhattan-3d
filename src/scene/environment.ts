import { Color, Fog, MathUtils, Vector3, type Scene } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/** Late-afternoon sun from the southwest, matching the warm key light. */
const SUN_ELEVATION_DEG = 32;
const SUN_AZIMUTH_DEG = 225;
const SKY_SCALE = 9_000;
/** Fog colour sampled from the sky near the horizon so distant tiles fade into it. */
export const HORIZON = new Color('#c7d6e4');

/** Physically based sky dome that follows the camera, plus horizon-matched distance fog. */
export class Environment {
  readonly sunDirection = new Vector3();
  private readonly sky = new Sky();

  constructor(scene: Scene, fogNear: number, fogFar: number) {
    this.sky.scale.setScalar(SKY_SCALE);
    const uniforms = this.sky.material.uniforms as Record<string, { value: unknown }>;
    setUniform(uniforms, 'turbidity', 6);
    setUniform(uniforms, 'rayleigh', 1.6);
    setUniform(uniforms, 'mieCoefficient', 0.004);
    setUniform(uniforms, 'mieDirectionalG', 0.8);
    this.sunDirection.setFromSphericalCoords(
      1,
      MathUtils.degToRad(90 - SUN_ELEVATION_DEG),
      MathUtils.degToRad(SUN_AZIMUTH_DEG),
    );
    const sun = uniforms.sunPosition?.value;
    if (sun instanceof Vector3) sun.copy(this.sunDirection);
    scene.add(this.sky);
    scene.background = HORIZON;
    scene.fog = new Fog(HORIZON, fogNear, fogFar);
  }

  /** Keeps the dome centred on the camera so it never clips at the far plane. */
  follow(position: Vector3): void {
    this.sky.position.copy(position);
  }
}

function setUniform(
  uniforms: Record<string, { value: unknown }>,
  name: string,
  value: number,
): void {
  const uniform = uniforms[name];
  if (uniform) uniform.value = value;
}
