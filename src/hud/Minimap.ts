import { OrthographicCamera, type Scene, type Vector3, type WebGLRenderer } from 'three';
import type { WorldSource } from '../world/WorldSource';
import { el } from './dom';
import { formatHeading, yawToBearing } from './heading';

export const MINIMAP = {
  /** Half-width of the visible area in metres, per zoom step. */
  ranges: [120, 250, 500, 1000, 2000],
  defaultRange: 1,
  compactPx: 200,
  expandedPx: 440,
  cameraHeight: 2500,
} as const;

/**
 * North-up minimap drawn by rendering the world from an orthographic camera straight above the
 * player into a scissored region of the main canvas, so it shows the same photoreal city.
 */
export class Minimap {
  private readonly panel = el('section', 'minimap');
  private readonly view = el('div', 'minimap__view');
  private readonly marker = el('div', 'minimap__marker');
  private readonly headingText = el('span', 'minimap__heading');
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 1, MINIMAP.cameraHeight * 2);
  private rangeIndex: number = MINIMAP.defaultRange;
  private expanded = false;
  private lastSize = 0;
  private lastHeading = '';

  constructor(
    parent: HTMLElement,
    private readonly world: WorldSource,
  ) {
    this.panel.setAttribute('aria-label', 'Minimap');
    // Only the header is frosted glass: a backdrop blur over the view would blur the map itself.
    const header = el('div', 'panel minimap__header');
    const title = el('span', 'label', 'Map');
    const controls = el('div', 'minimap__controls');
    controls.append(
      this.button('−', 'Zoom out', () => {
        this.zoom(1);
      }),
      this.button('+', 'Zoom in', () => {
        this.zoom(-1);
      }),
      this.button('Expand', 'Toggle large map', () => {
        this.expanded = !this.expanded;
        this.panel.classList.toggle('minimap--expanded', this.expanded);
      }),
    );
    header.append(title, this.headingText, controls);
    const north = el('span', 'minimap__north', 'N');
    this.view.append(this.marker, north);
    this.panel.append(header, this.view);
    parent.append(this.panel);

    this.camera.up.set(0, 0, -1); // north (-z) at the top of the map
    this.world.addCamera(this.camera, MINIMAP.compactPx, MINIMAP.compactPx);
  }

  /** Renders the map for this frame. Call after the main scene render. */
  render(
    renderer: WebGLRenderer,
    scene: Scene,
    player: Vector3,
    facing: number,
    viewYaw: number,
  ): void {
    const rect = this.view.getBoundingClientRect();
    if (rect.width === 0) return;
    if (rect.width !== this.lastSize) {
      this.lastSize = rect.width;
      this.world.addCamera(this.camera, rect.width, rect.height);
    }

    const range = MINIMAP.ranges[this.rangeIndex] ?? MINIMAP.ranges[MINIMAP.defaultRange];
    const aspect = rect.width / rect.height;
    this.camera.left = -range * aspect;
    this.camera.right = range * aspect;
    this.camera.top = range;
    this.camera.bottom = -range;
    this.camera.position.set(player.x, player.y + MINIMAP.cameraHeight, player.z);
    this.camera.lookAt(player.x, player.y, player.z);
    this.camera.updateProjectionMatrix();

    const fog = scene.fog;
    scene.fog = null;
    const y = window.innerHeight - rect.bottom;
    renderer.setScissorTest(true);
    renderer.setScissor(rect.left, y, rect.width, rect.height);
    renderer.setViewport(rect.left, y, rect.width, rect.height);
    renderer.clear();
    renderer.render(scene, this.camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    scene.fog = fog;

    this.marker.style.transform = `translate(-50%, -50%) rotate(${yawToBearing(facing)}deg)`;
    const heading = formatHeading(yawToBearing(viewYaw));
    if (heading !== this.lastHeading) {
      this.lastHeading = heading;
      this.headingText.textContent = heading;
    }
  }

  dispose(): void {
    this.world.removeCamera(this.camera);
    this.panel.remove();
  }

  private zoom(step: number): void {
    this.rangeIndex = Math.min(MINIMAP.ranges.length - 1, Math.max(0, this.rangeIndex + step));
  }

  private button(text: string, label: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', 'chip', text);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    return b;
  }
}
