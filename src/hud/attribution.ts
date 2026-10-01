import { el } from './dom';

/**
 * Official Google Maps logo (unmodified; white wordmark with a dark outline, the variant Google
 * specifies for busy backgrounds such as map imagery). Shown only when Google tiles are the world.
 * Source: https://developers.google.com/maps/documentation/tile/policies (attribution assets).
 */
export const GOOGLE_MAPS_LOGO = `${import.meta.env.BASE_URL}brand/GoogleMaps_Logo_WithDarkOutline.svg`;

/**
 * Always-visible data credit line required by map providers: the provider logo (when one is
 * required) followed by the per-tile copyright text, aggregated.
 */
export class AttributionLine {
  private readonly node = el('div', 'attribution');
  private readonly text = el('span', 'attribution__text');
  private current = '';

  constructor(parent: HTMLElement, options: { logo?: string | undefined } = {}) {
    this.node.setAttribute('aria-label', 'Map data attribution');
    if (options.logo) {
      const logo = el('img', 'attribution__logo');
      logo.src = options.logo;
      logo.alt = 'Google Maps';
      logo.width = 105; // intrinsic SVG size; CSS sets the displayed height
      logo.height = 22;
      logo.draggable = false;
      this.node.append(logo);
    }
    this.node.append(this.text);
    parent.append(this.node);
  }

  /** Updates the credits; touches the DOM only when the text actually changes. */
  set(credits: readonly string[]): void {
    const text = credits.join(' · ');
    if (text === this.current) return;
    this.current = text;
    this.text.textContent = text;
  }
}
