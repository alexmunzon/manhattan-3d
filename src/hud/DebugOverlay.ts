import type { WebGLRenderer } from 'three';
import { el } from './dom';

const REFRESH_MS = 500;

interface ChromeMemory {
  memory?: { usedJSHeapSize: number };
}

/** Toggleable (backquote key) performance readout: FPS, draw calls, triangles, GPU objects. */
export class DebugOverlay {
  private readonly node = el('pre', 'panel debug');
  private frames = 0;
  private elapsed = 0;
  private lastUpdate = 0;

  constructor(parent: HTMLElement) {
    this.node.hidden = true;
    parent.append(this.node);
  }

  toggle(): void {
    this.node.hidden = !this.node.hidden;
  }

  /** Call once per frame after rendering. */
  update(dt: number, renderer: WebGLRenderer): void {
    this.frames++;
    this.elapsed += dt;
    const now = performance.now();
    if (this.node.hidden || now - this.lastUpdate < REFRESH_MS) return;
    this.lastUpdate = now;
    const fps = this.elapsed > 0 ? this.frames / this.elapsed : 0;
    this.frames = 0;
    this.elapsed = 0;
    const { render, memory } = renderer.info;
    const heap = (performance as Performance & ChromeMemory).memory?.usedJSHeapSize;
    this.node.textContent = [
      `FPS        ${fps.toFixed(0)}`,
      `Draw calls ${render.calls}`,
      `Triangles  ${(render.triangles / 1000).toFixed(0)}k`,
      `Geometries ${memory.geometries}`,
      `Textures   ${memory.textures}`,
      heap ? `JS heap    ${(heap / 1e6).toFixed(0)} MB` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
