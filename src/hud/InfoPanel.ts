import type { GeoPoint } from '../world/geo';
import type { WorldDetail } from '../world/WorldSource';
import { el } from './dom';

export const AVATAR_COLORS = [
  '#e0a33a',
  '#3f8f86',
  '#4a78c8',
  '#d8893a',
  '#c8505a',
  '#5f9e5a',
] as const;

export interface InfoPanelHandlers {
  onColor(color: string): void;
  onDetail(detail: WorldDetail): void;
}

/** Coordinates with a copy-link button, avatar colour swatches and a graphics quality toggle. */
export class InfoPanel {
  private readonly coords = el('span', 'info__value');
  private readonly copy = el('button', 'chip', 'Copy link');
  private point: GeoPoint | null = null;
  private lastText = '';

  constructor(parent: HTMLElement, handlers: InfoPanelHandlers) {
    const panel = el('section', 'panel info');
    const coordsRow = el('div', 'info__row');
    coordsRow.append(el('span', 'label', 'Coords'), this.coords, this.copy);
    this.copy.type = 'button';
    this.copy.addEventListener('click', () => {
      void this.copyLink();
    });

    const colorRow = el('div', 'info__row');
    colorRow.append(el('span', 'label', 'Avatar'));
    AVATAR_COLORS.forEach((color, i) => {
      const swatch = el('button', 'swatch');
      swatch.type = 'button';
      swatch.style.background = color;
      swatch.setAttribute('aria-label', `Avatar colour ${i + 1}`);
      swatch.addEventListener('click', () => {
        colorRow.querySelector('.swatch--active')?.classList.remove('swatch--active');
        swatch.classList.add('swatch--active');
        handlers.onColor(color);
      });
      if (i === 0) swatch.classList.add('swatch--active');
      colorRow.append(swatch);
    });

    const qualityRow = el('div', 'info__row');
    const quality = el('button', 'chip', 'High');
    quality.type = 'button';
    quality.addEventListener('click', () => {
      const next: WorldDetail = quality.textContent === 'High' ? 'low' : 'high';
      quality.textContent = next === 'high' ? 'High' : 'Low';
      handlers.onDetail(next);
    });
    qualityRow.append(el('span', 'label', 'Graphics'), quality);

    panel.append(coordsRow, colorRow, qualityRow);
    parent.append(panel);
  }

  /** Updates the displayed coordinates; touches the DOM only when the rounded text changes. */
  setPosition(point: GeoPoint): void {
    this.point = point;
    const text = `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
    if (text === this.lastText) return;
    this.lastText = text;
    this.coords.textContent = text;
  }

  private async copyLink(): Promise<void> {
    if (!this.point) return;
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('lat', this.point.lat.toFixed(5));
    url.searchParams.set('lon', this.point.lon.toFixed(5));
    try {
      await navigator.clipboard.writeText(url.toString());
      this.flash('Copied');
    } catch {
      this.flash('Copy failed');
    }
  }

  private flash(text: string): void {
    this.copy.textContent = text;
    window.setTimeout(() => {
      this.copy.textContent = 'Copy link';
    }, 1500);
  }
}
