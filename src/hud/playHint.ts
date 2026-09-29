import { el } from './dom';

const CONTROLS =
  'WASD move · Shift sprint · Space jump/climb · H glider (in air) · Wheel zoom · R reset · Esc release';

/** Bottom-centre hint that prompts for pointer lock and lists controls. */
export class PlayHint {
  private readonly node = el('div', 'panel play-hint');
  private readonly title = el('p', 'label');

  constructor(parent: HTMLElement) {
    this.node.append(this.title, el('p', 'play-hint__controls', CONTROLS));
    parent.append(this.node);
  }

  /** Updates the prompt from the current loading and pointer-lock state. */
  set(state: 'loading' | 'unlocked' | 'playing'): void {
    this.node.hidden = state === 'playing';
    this.title.textContent = state === 'loading' ? 'Loading street level…' : 'Click to play';
  }
}
