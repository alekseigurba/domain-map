// Headless check for permalinks: the URL carries a readable slug, not a uuid,
// so the slug has to survive titles that collide, wander or contain punctuation.
//   node tests/links.test.mjs

const { store, setMap, slugify, slugFor, findBySlug } = await import('../app/js/store.js');

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

// --- slugify ---
check('spaces become dashes', slugify('Payment authorization') === 'payment-authorization');
check('punctuation is dropped', slugify('Risk & fraud (v2)') === 'risk-fraud-v2', slugify('Risk & fraud (v2)'));
check('accents are folded', slugify('Zahlungsprüfung') === 'zahlungsprufung', slugify('Zahlungsprüfung'));
check('no leading or trailing dash', slugify('  — Dunning —  ') === 'dunning', slugify('  — Dunning —  '));
check('an unnameable title still gets a slug', slugify('...') === 'untitled');
check('an empty title still gets a slug', slugify('') === 'untitled' && slugify(null) === 'untitled');
check('long titles are cut short', slugify('word '.repeat(40)).length <= 64);

// --- slugs over a whole map ---
const cap = (id, title, extra = {}) => ({
  id, title, domainId: null, colorIndex: 1, fontSize: 24, fontWeight: 'bold', x: 0, y: 0, sortIndex: 0, ...extra,
});

setMap({
  title: 'Organization map',
  domains: [{ id: 'd1', title: 'Invoicing', colorIndex: 1, x: 0, y: 0, titlePosition: 'top', fontWeight: 'bold' }],
  capabilities: [
    cap('c1', 'Payment authorization'),
    cap('c2', 'Dunning'),
    cap('c3', 'Dunning'), // a deliberate duplicate
  ],
  connectors: [{
    id: 'x1',
    fromId: 'c1',
    fromKind: 'capability',
    fromPoint: 0,
    toId: 'c2',
    toKind: 'capability',
    toPoint: 6,
  }],
});

check('a capability resolves to its title', slugFor('capability', 'c1') === 'payment-authorization');
check('a domain resolves to its title', slugFor('domain', 'd1') === 'invoicing');
check('a connector names both ends', slugFor('connector', 'x1') === 'payment-authorization-dunning',
  slugFor('connector', 'x1'));

check('the first of two duplicates keeps the plain slug', slugFor('capability', 'c2') === 'dunning');
check('the second duplicate is suffixed', slugFor('capability', 'c3') === 'dunning-2', slugFor('capability', 'c3'));

// --- round trip ---
for (const [type, id] of [['capability', 'c1'], ['capability', 'c3'], ['domain', 'd1'], ['connector', 'x1']]) {
  check(`${type}/${id} survives the round trip`, findBySlug(type, slugFor(type, id))?.id === id);
}

check('an unknown slug resolves to nothing', findBySlug('capability', 'no-such-thing') === null);
check('a slug from the wrong type resolves to nothing', findBySlug('domain', 'dunning') === null);

// A rename moves the link — the id is gone from the URL, so this is the trade.
store.capabilities[0].title = 'Payment capture';
check('renaming moves the permalink', slugFor('capability', 'c1') === 'payment-capture');
check('the old permalink stops resolving', findBySlug('capability', 'payment-authorization') === null);

console.log(failures === 0 ? '\nAll link checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
