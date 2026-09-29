import { PLACES, resolveTeleport } from '../config/places';
import type { GeoPoint } from '../world/geo';
import { el } from './dom';

/** Top-centre search bar: teleport to a named Manhattan place or to "lat, lon". */
export class TeleportBar {
  private readonly form = el('form', 'panel teleport');
  private readonly input = el('input', 'teleport__input');
  private readonly status = el('p', 'teleport__status');

  constructor(parent: HTMLElement, onTeleport: (point: GeoPoint, label: string) => void) {
    const listId = 'teleport-places';
    const list = el('datalist');
    list.id = listId;
    for (const place of PLACES) {
      const option = el('option');
      option.value = place.name;
      list.append(option);
    }
    this.input.type = 'text';
    this.input.placeholder = 'Place, or lat, lon';
    this.input.setAttribute('list', listId);
    this.input.setAttribute('aria-label', 'Teleport to a place or coordinates');
    this.input.autocomplete = 'off';
    this.input.maxLength = 80;
    const go = el('button', 'button', 'Go');
    go.type = 'submit';
    this.status.setAttribute('role', 'status');

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const result = resolveTeleport(this.input.value);
      if (!result.ok) {
        this.status.textContent = result.error;
        return;
      }
      this.status.textContent = '';
      this.input.value = '';
      this.input.blur();
      onTeleport(result.point, result.label);
    });

    this.form.append(this.input, go, list, this.status);
    parent.append(this.form);
  }
}
