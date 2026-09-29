import { el } from './dom';

const KEY_STEPS = [
  'Create a Google Cloud project and enable the Map Tiles API.',
  'Create an API key restricted to the Map Tiles API and to http://localhost:* referrers.',
  'Set a daily quota cap and a billing budget alert.',
  'Copy .env.example to .env, paste the key, and restart the dev server.',
] as const;

/** Shows the "no API key" panel explaining the demo city and how to enable real Manhattan. */
export function showSetupScreen(parent: HTMLElement): void {
  const panel = el('section', 'panel setup');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'setup-title');

  const title = el('h1', 'setup__title', 'Demo city');
  title.id = 'setup-title';
  const intro = el(
    'p',
    'setup__text',
    'No Google Maps API key found. You are exploring a procedurally generated stand-in city, not real map data.',
  );
  const label = el('p', 'label', 'To load photoreal Manhattan');
  const steps = el('ol', 'setup__steps');
  for (const step of KEY_STEPS) steps.append(el('li', undefined, step));
  const note = el(
    'p',
    'setup__note',
    'Map Tiles API usage is billed. Browser keys are visible to anyone running the app.',
  );
  const button = el('button', 'button', 'Continue with demo city');
  button.type = 'button';
  button.addEventListener('click', () => {
    panel.remove();
  });

  panel.append(title, intro, label, steps, note, button);
  parent.append(panel);
  button.focus();
}
