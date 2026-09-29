import { el } from './dom';

const MPS_TO_MPH = 2.23694;

/** Bottom-centre readout of speed (and altitude, when relevant) while driving or gliding. */
export class ModeHud {
  private readonly node = el('div', 'panel mode-hud');
  private readonly mode = el('span', 'label');
  private readonly speed = el('span', 'mode-hud__value');
  private readonly altitude = el('span', 'mode-hud__value');
  private last = '';

  constructor(parent: HTMLElement) {
    this.node.append(this.mode, this.speed, this.altitude);
    this.node.hidden = true;
    parent.append(this.node);
  }

  /** Shows the readout for a mode label, or hides it when `label` is null. */
  set(label: string | null, speedMps: number, altitude: number | null): void {
    const mph = Math.round(speedMps * MPS_TO_MPH);
    const alt = altitude === null ? '' : `${Math.round(altitude)} m`;
    const key = `${label ?? ''}|${mph}|${alt}`;
    if (key === this.last) return;
    this.last = key;
    this.node.hidden = label === null;
    this.altitude.hidden = altitude === null;
    this.mode.textContent = label ?? '';
    this.speed.textContent = `${mph} mph`;
    this.altitude.textContent = `ALT ${alt}`;
  }
}
