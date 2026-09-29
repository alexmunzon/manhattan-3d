import { el } from './dom';

/** Always-visible data credit line required by map providers. */
export class AttributionLine {
  private readonly node = el('div', 'attribution');
  private current = '';

  constructor(parent: HTMLElement) {
    this.node.setAttribute('aria-label', 'Map data attribution');
    parent.append(this.node);
  }

  /** Updates the credits; touches the DOM only when the text actually changes. */
  set(credits: readonly string[]): void {
    const text = credits.join(' · ');
    if (text === this.current) return;
    this.current = text;
    this.node.textContent = text;
  }
}
