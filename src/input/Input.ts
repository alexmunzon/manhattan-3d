/**
 * Keyboard and pointer-lock mouse input, polled once per frame.
 * Keys use `KeyboardEvent.code` (layout-independent physical keys, e.g. `KeyW`).
 */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private readonly controller = new AbortController();

  constructor(private readonly target: HTMLElement) {
    const { signal } = this.controller;
    window.addEventListener(
      'keydown',
      (e) => {
        this.onKeyDown(e);
      },
      { signal },
    );
    window.addEventListener(
      'keyup',
      (e) => {
        this.down.delete(e.code);
      },
      { signal },
    );
    window.addEventListener(
      'blur',
      () => {
        this.down.clear();
      },
      { signal },
    );
    document.addEventListener(
      'mousemove',
      (e) => {
        this.onMouseMove(e);
      },
      { signal },
    );
    target.addEventListener(
      'click',
      () => {
        this.lock();
      },
      { signal },
    );
  }

  /** True while the pointer is captured for mouse-look. */
  get locked(): boolean {
    return document.pointerLockElement === this.target;
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** True only on the frame the key went down. */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Mouse movement in pixels since the last frame. */
  get look(): { x: number; y: number } {
    return { x: this.lookX, y: this.lookY };
  }

  /** Clears per-frame state. Call at the end of every frame. */
  endFrame(): void {
    this.pressed.clear();
    this.lookX = 0;
    this.lookY = 0;
  }

  dispose(): void {
    this.controller.abort();
    if (this.locked) document.exitPointerLock();
  }

  private lock(): void {
    if (this.locked) return;
    // Rejects if the user dismissed lock very recently; the next click retries.
    this.target.requestPointerLock().catch(() => undefined);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;
    if (!e.repeat) this.pressed.add(e.code);
    this.down.add(e.code);
    if (this.locked && e.code === 'Space') e.preventDefault();
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.locked) return;
    this.lookX += e.movementX;
    this.lookY += e.movementY;
  }
}
