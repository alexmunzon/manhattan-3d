import { el } from './dom';

/** Renders the always-visible data credit line required by map providers. */
export function mountAttribution(parent: HTMLElement, credits: readonly string[]): HTMLElement {
  const line = el('div', 'attribution', credits.join(' · '));
  line.setAttribute('aria-label', 'Map data attribution');
  parent.append(line);
  return line;
}
