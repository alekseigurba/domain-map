// The sign-in screen. It asks the server which ways in exist and shows those;
// the sign-in itself happens on the server and lands in a cookie.

const note = document.getElementById('note');
const params = new URLSearchParams(location.search);

/** The server sends a reason, never free text, so a link cannot put words here. */
const REASONS = {
  unconfigured: 'Microsoft sign-in is not configured on this server.',
  unreachable: 'Could not reach Microsoft sign-in. Try again in a moment.',
  expired: 'The sign-in took too long, or was started in another tab. Try again.',
  refused: 'Microsoft sign-in did not let you in.',
  failed: 'The sign-in could not be completed. Try again.',
};

const CODES = {
  AADSTS50105: 'Your account has not been given access to this map. Ask for it.',
};

function say(message, tone = '') {
  note.textContent = message;
  if (tone) note.dataset.tone = tone;
  else delete note.dataset.tone;
}

/** Only ever return somewhere inside this app. */
function returnUrl() {
  const wanted = params.get('returnUrl');
  const path = wanted && wanted.startsWith('/') && !wanted.startsWith('//') && !wanted.includes('\\')
    ? wanted
    : '/';
  // A link to a shape keeps it in the hash, which never reaches the server.
  return path.includes('#') ? path : `${path}${location.hash}`;
}

/** The logo, title and footer come from the same stored settings the map uses. */
async function applyBranding() {
  let settings = {};
  try {
    const response = await fetch('api/files/data/settings.json', { cache: 'no-store' });
    if (response.ok) settings = await response.json();
  } catch {
    /* branding is a nicety; the way in matters more */
  }

  const logo = document.getElementById('logo');
  const glyph = () => { logo.textContent = settings.logo ?? '◈'; };
  if (settings.logoSrc) {
    const image = document.createElement('img');
    image.src = settings.logoSrc;
    image.alt = settings.logoAlt ?? '';
    image.addEventListener('error', glyph, { once: true });
    logo.replaceChildren(image);
  } else {
    glyph();
  }

  if (settings.title) {
    document.getElementById('title').textContent = settings.title;
    document.title = `Sign in — ${settings.title}`;
  }
  document.getElementById('footer-text').textContent = settings.footer ?? '';
}

async function start() {
  applyBranding();

  let state;
  try {
    const response = await fetch('auth/me', { cache: 'no-store', headers: { accept: 'application/json' } });
    state = await response.json();
  } catch (error) {
    say(`Could not reach the server: ${error.message}`, 'error');
    return;
  }

  // Already in, or the server has no gate at all.
  if (state.authenticated) {
    location.replace(returnUrl());
    return;
  }

  const microsoft = document.getElementById('sign-in-microsoft');
  const bypass = document.getElementById('sign-in-dev');
  microsoft.hidden = !state.options?.microsoft;
  bypass.hidden = !state.options?.bypass;

  const code = params.get('code');
  const reason = REASONS[params.get('error')];
  if (microsoft.hidden && bypass.hidden) {
    say('No sign-in method is configured on this server.', 'error');
    return;
  } else if (reason) {
    const known = /^AADSTS\d+$/.test(code ?? '') ? code : null;
    say(known ? `${reason} ${CODES[known] ?? ''} (${known})` : reason, 'error');
  } else if (params.has('signedOut')) {
    say('Signed out.');
  } else if (!bypass.hidden) {
    say('The development bypass is on: this server is not protecting anything.', 'warn');
  }

  microsoft.addEventListener('click', () => {
    say('Taking you to Microsoft…');
    const query = new URLSearchParams({ returnUrl: returnUrl() });
    // Someone who just signed out may be handing the browser to someone else.
    if (params.has('signedOut')) query.set('prompt', 'select_account');
    location.href = `auth/login/microsoft?${query}`;
  });

  bypass.addEventListener('click', async () => {
    bypass.disabled = true;
    say('Signing in…');
    try {
      const response = await fetch(`auth/login/dev?returnUrl=${encodeURIComponent(returnUrl())}`, {
        method: 'POST',
        headers: { accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? `The server answered ${response.status}.`);
      // The server only knows the path; the hash is this page's to add back.
      location.replace(returnUrl());
    } catch (error) {
      bypass.disabled = false;
      say(`Could not sign in: ${error.message}`, 'error');
    }
  });
}

start();
