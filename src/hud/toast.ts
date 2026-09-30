import { el } from './dom';

const SHOW_MS = 3000;

/** Short-lived bottom-centre message (e.g. why an action did nothing). */
export class Toast {
  private readonly node = el('div', 'panel toast');
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(parent: HTMLElement) {
    this.node.setAttribute('role', 'status');
    this.node.hidden = true;
    parent.append(this.node);
  }

  show(text: string): void {
    this.node.textContent = text;
    this.node.hidden = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.node.hidden = true;
      this.timer = null;
    }, SHOW_MS);
  }
}
