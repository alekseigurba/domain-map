// Light or dark, and who decides. The theme follows the system until someone
// chooses one, and the choice is the browser's own: kept in localStorage beside
// which panels are folded, and no part of the map. Two people looking at the
// same version need not be looking at it in the same light.
//
// The stylesheet does the drawing. tokens.css says its semantic tokens again
// under `data-theme="dark"` on the root, and once the page is up this module is
// the only thing that writes that attribute. Before that it is theme-first.js,
// which runs ahead of the first paint; the key and the rule below are repeated
// there.

const KEY = 'domain-map:theme';

const system = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();
const controls = [];

function kept() {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

let choice = kept();

/** What this browser chose: 'light', 'dark', or 'system' when it has left it to the system. */
export const themeChoice = () => choice;

/** The theme the page is drawn in right now: 'light' or 'dark'. */
export const themeShown = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

/** Put the page in the theme the choice comes to, and tell whoever asked to hear of a change. */
function apply() {
  const next = choice === 'system' ? (system.matches ? 'dark' : 'light') : choice;
  for (const control of controls) show(control);
  if (document.documentElement.dataset.theme === next) return;
  document.documentElement.dataset.theme = next;
  for (const listener of listeners) listener(next);
}

/** Choose a theme, or hand the choice back to the system. */
export function chooseTheme(next) {
  choice = next === 'light' || next === 'dark' ? next : 'system';
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Nowhere to keep it. It holds for as long as this page is open.
  }
  apply();
}

/**
 * Hear of every change of theme, as 'light' or 'dark'. The stylesheet needs no
 * telling; this is for what is drawn from script — the map's own colours, and
 * the inks chosen against the paper.
 */
export function onTheme(listener) {
  listeners.add(listener);
}

function show(control) {
  for (const button of control.querySelectorAll('[data-theme-choice]')) {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === choice));
  }
}

/**
 * The three buttons that choose: each names its choice in `data-theme-choice`,
 * and the one in force is the one held down.
 */
export function initThemeChoice(control) {
  controls.push(control);
  control.addEventListener('click', (event) => {
    const button = event.target.closest('[data-theme-choice]');
    if (button) chooseTheme(button.dataset.themeChoice);
  });
  show(control);
}

// Left to the system, the page turns when the system does.
system.addEventListener('change', apply);

// The choice is the browser's, so a tab hears of one made in another.
window.addEventListener('storage', (event) => {
  if (event.key !== KEY && event.key !== null) return;
  choice = kept();
  apply();
});

// A page that did not load theme-first.js gets its theme here, a moment late.
apply();
