import { el } from './dom';

/** Shows a dismissible error/status panel at the top of the screen. */
export function showNotice(parent: HTMLElement, title: string, message: string): void {
  const panel = el('section', 'panel notice');
  panel.setAttribute('role', 'alert');
  panel.append(el('p', 'notice__title', title), el('p', 'notice__text', message));
  const close = el('button', 'button', 'Dismiss');
  close.type = 'button';
  close.addEventListener('click', () => {
    panel.remove();
  });
  panel.append(close);
  parent.append(panel);
}
