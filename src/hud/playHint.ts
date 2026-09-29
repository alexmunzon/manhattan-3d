import { el } from './dom';

/** Bottom-centre prompt shown while loading or when the mouse isn't captured. */
export class PlayHint {
  private readonly node = el('div', 'panel play-hint');
  private readonly title = el('p', 'label');
  private state: 'loading' | 'unlocked' | 'playing' | null = null;

  constructor(parent: HTMLElement) {
    this.node.append(this.title);
    parent.append(this.node);
  }

  /** Updates the prompt from the current loading and pointer-lock state. */
  set(state: 'loading' | 'unlocked' | 'playing'): void {
    if (state === this.state) return;
    this.state = state;
    this.node.hidden = state === 'playing';
    this.title.textContent =
      state === 'loading' ? 'Loading street level…' : 'Click to play · Esc to release mouse';
  }
}
