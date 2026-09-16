// Button icons live as plain .svg files under icons/ instead of inline markup
// in index.html. Each `[data-icon]` placeholder there is swapped for the real
// <svg> once fetched — swapped in, not just displayed, because only a node
// that is actually part of the page can take its stroke from the button's own
// `currentColor` (hover, aria-pressed, the danger state), the way an inline
// <svg> always could and an <img> never can.

const cache = new Map();

function fetchIcon(src) {
  if (!cache.has(src)) {
    cache.set(src, fetch(src)
      .then((response) => response.text())
      .then((markup) => new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement));
  }
  return cache.get(src);
}

export async function loadIcons(root = document) {
  const placeholders = [...root.querySelectorAll('[data-icon]')];
  await Promise.all(placeholders.map(async (placeholder) => {
    const svg = (await fetchIcon(placeholder.dataset.icon)).cloneNode(true);
    svg.classList.add(...placeholder.classList);
    if (placeholder.hasAttribute('aria-hidden')) svg.setAttribute('aria-hidden', 'true');
    placeholder.replaceWith(svg);
  }));
}
