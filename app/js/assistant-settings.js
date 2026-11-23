// The Assistant's model, as an administrator sets it from the page: switched
// on or off, and given a key of the app's own. Where the model is — its address
// and its name — is the deployment's to say, and is only shown here.
//
// The key goes one way. It is typed into a box that shows dots, sent once, and
// the box is emptied; the server seals it and never sends it back, so there is
// nothing here to read it from and nothing to show but that there is one. What
// stands in for it is a fixed row of dots, which says nothing of how long it is.
//
// The dialog's frame is in index.html; this fills it afresh each time it
// opens, and after every change, from what the server says stands.

import { call } from './api.js';
import { ADMINISTRATOR } from './identity.js';

const read = () => call('GET', 'api/assistant/settings');
const change = (fields) => call('PUT', 'api/assistant/settings', fields);
const tryIt = () => call('POST', 'api/assistant/settings/check');

/** What stands for a key wherever one is spoken of. Always this many dots, whatever the key. */
const MASK = '••••••••';

const el = (id) => document.getElementById(id);

/** Told how the model stands after a change, so the Assistant's column can follow it without a reload. */
let onChange = () => {};

function say(text, isError = false) {
  const note = el('model-note');
  note.textContent = text ?? '';
  note.hidden = !text;
  note.dataset.error = String(isError);
}

/** "23 Nov, 14:02" — when a key was set. */
const when = (iso) => new Date(iso)
  .toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Where the model is and whether messages reach it, in a sentence. */
function standing(view) {
  if (!view.reachable) {
    return 'No model is set up for this map. ASSISTANT_API_URL, in the server\'s environment, says where one is; '
      + 'until it does the Assistant writes prompts to copy out by hand.';
  }
  const where = `${view.host}${view.model ? ` (${view.model})` : ''}`;
  if (!view.enabled) return `Switched off. Nothing is sent to the model at ${where}, and the Assistant writes prompts to copy out by hand.`;
  if (view.key === 'none') return `The model at ${where} has no key, so nothing can be sent to it yet.`;
  return `On. Contributors' messages go to the model at ${where}.`;
}

/** Which key the model runs on, without the key. */
function keyLine(view) {
  // A model built into the server brings whatever key it needs: there is none here to speak of.
  if (!view.keyChangeable) return view.connected || !view.enabled ? 'This model is built into the server, and brings its own.' : 'None.';
  const lost = view.keyUnreadable
    ? ' A key was set here that the server can no longer open — its secret has changed since. Set it again.'
    : '';
  if (view.key === 'app') return `${MASK}  set here${view.keySetAt ? ` on ${when(view.keySetAt)}` : ''}${view.keySetBy ? ` by ${view.keySetBy}` : ''}.`;
  if (view.key === 'deployment') return `${MASK}  the deployment's own, from ASSISTANT_API_KEY.${lost}`;
  return `None.${lost}`;
}

function show(view) {
  el('model-says').textContent = standing(view);
  for (const chip of el('model-switch').querySelectorAll('[data-enabled]')) {
    chip.setAttribute('aria-pressed', String((chip.dataset.enabled === 'true') === view.enabled));
    chip.disabled = !view.reachable;
  }
  el('model-key').textContent = keyLine(view);

  // A key is taken only where it could be used and could be kept sealed.
  const form = el('model-key-form');
  form.hidden = !view.keyChangeable;
  const sealed = el('model-unsealed');
  sealed.hidden = !view.keyChangeable || view.sealable;
  for (const control of form.querySelectorAll('input, button')) control.disabled = !view.sealable;

  el('model-check').hidden = !view.reachable;
  el('model-check').disabled = view.key === 'none';
  // Going back to the deployment's key is only a way back where there is one to go back to, or one to let go of.
  el('model-forget').hidden = view.key !== 'app' && !view.keyUnreadable;
  el('model-forget').textContent = view.key === 'app' ? 'Forget this key' : 'Forget the unreadable key';
}

/** Everything but Close is held down while a change is on its way. */
async function act(work, done) {
  const held = [...el('assistant-model-dialog').querySelectorAll('button:not(#assistant-model-close), input')];
  for (const control of held) control.disabled = true;
  say('Saving…');
  try {
    const view = await work();
    for (const control of held) control.disabled = false;
    show(view);
    onChange(view);
    say(done(view));
  } catch (error) {
    for (const control of held) control.disabled = false;
    say(error.message, true);
    // What stands is whatever the server says, whether or not the change took.
    await read().then(show).catch(() => {});
  }
}

/**
 * Wire the dialog to who is looking. main.js opens it from the button in
 * Settings, which only an administrator is shown.
 */
export function initAssistantSettings(who, { onChange: changed } = {}) {
  if (changed) onChange = changed;

  const opener = el('assistant-model');
  opener.hidden = who.role !== ADMINISTRATOR;
  opener.addEventListener('click', async () => {
    el('settings-dialog').close();
    el('model-new-key').value = '';
    say('Reading the settings…');
    try {
      show(await read());
      say(null);
    } catch (error) {
      say(`Could not read the settings: ${error.message}`, true);
    }
  });

  for (const chip of el('model-switch').querySelectorAll('[data-enabled]')) {
    chip.addEventListener('click', () => {
      if (chip.getAttribute('aria-pressed') === 'true') return;
      const enabled = chip.dataset.enabled === 'true';
      act(() => change({ enabled }), (view) => (view.enabled
        ? (view.connected ? 'Switched on.' : 'Switched on. It still wants a key before anything can be sent.')
        : 'Switched off.'));
    });
  }

  el('model-key-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const box = el('model-new-key');
    const key = box.value;
    // Out of the page the moment it is on its way: nothing here needs it again.
    box.value = '';
    act(() => change({ key }), () => 'The new key is kept. Try it, to see that the model takes it.');
  });

  el('model-forget').addEventListener('click', () => {
    if (!confirm('Forget the key set here?\n\nThe model goes back to the key the deployment was given, if it has one.')) return;
    act(() => change({ key: null }), (view) => (view.key === 'deployment'
      ? 'Forgotten. The model is on the deployment\'s key again.'
      : 'Forgotten. The model has no key now.'));
  });

  el('model-check').addEventListener('click', async () => {
    const button = el('model-check');
    button.disabled = true;
    say('Asking the model for one word…');
    try {
      const { ok, reason } = await tryIt();
      say(ok ? 'The model answered: the key works.' : reason, !ok);
    } catch (error) {
      say(error.message, true);
    }
    button.disabled = false;
  });
}
