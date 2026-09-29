import { el } from './dom';

const ROWS: readonly (readonly [readonly string[], string])[] = [
  [['W', 'A', 'S', 'D'], 'Move / steer'],
  [['Shift'], 'Sprint'],
  [['Space'], 'Jump · climb · brake'],
  [['V'], 'Vehicle'],
  [['H'], 'Glider'],
  [['C'], 'Camera'],
  [['R'], 'Reset'],
];

/** Bottom-left keycap legend, styled like physical keys. */
export function mountControlsLegend(parent: HTMLElement): void {
  const legend = el('section', 'legend');
  legend.setAttribute('aria-label', 'Controls');
  for (const [keys, action] of ROWS) {
    const row = el('div', 'legend__row');
    const caps = el('span', 'legend__keys');
    for (const key of keys) caps.append(el('kbd', 'keycap', key));
    row.append(caps, el('span', 'legend__action', action));
    legend.append(row);
  }
  parent.append(legend);
}
