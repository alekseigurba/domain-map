// The theme, said before anything is drawn. This is the one script either page
// loads the old way — in the head, ahead of the stylesheets, and not as a
// module. A module waits for the page to be read, and the first paint does not
// wait for a module: left to theme.js, a dark page would open on a flash of
// white, every time.
//
// All it does is put `data-theme` on the root, which is what tokens.css reads.
// Choosing a theme, and following the system as it changes, are theme.js's. The
// key and the rule are written in both files: keep them in step.
(function () {
  var chosen = null;
  try {
    chosen = localStorage.getItem('domain-map:theme');
  } catch (error) {
    // A browser that will keep nothing still has a system to follow.
  }
  var dark = chosen === 'dark'
    || (chosen !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}());
