/*
 * faceted-search
 *
 * Search and filter over a JSON index — the shape an Edge Delivery Services
 * spreadsheet or query index already returns, `{ data: [...] }`.
 *
 * Two decisions worth naming:
 *
 * Filter state lives in the URL. A filtered list that cannot be linked, shared
 * or restored by the back button is a dead end, and putting state in the query
 * string costs nothing beyond writing it down.
 *
 * Facet values are derived from the data rather than configured. A hand-written
 * facet list goes stale the first time someone adds a row, and nobody notices
 * until a category silently stops being filterable.
 *
 * Parameters, passed on the widget URL and read from `dataset`:
 *   src     Required. URL of the JSON index.
 *   facets  Comma-separated field names to build facets from.
 *   fields  Comma-separated field names to search. Defaults to title+description.
 *   limit   Maximum rows to render. Defaults to 60.
 */

const DEBOUNCE_MS = 180;

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Case- and accent-insensitive, so "cafe" finds "Café". */
function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export default async function decorate(widget) {
  const { src } = widget.dataset;
  const countEl = widget.querySelector('.faceted-search-count');
  const emptyEl = widget.querySelector('.faceted-search-empty');
  const resultsEl = widget.querySelector('.faceted-search-results');
  const facetsEl = widget.querySelector('.faceted-search-facets');
  const form = widget.querySelector('.faceted-search-bar');
  const input = widget.querySelector('#fs-q');
  const resetBtn = widget.querySelector('.faceted-search-reset');

  if (!src) {
    countEl.textContent = 'This widget needs a ?src= parameter pointing at a JSON index.';
    return;
  }

  const facetKeys = (widget.dataset.facets || '').split(',').map((s) => s.trim()).filter(Boolean);
  const searchKeys = (widget.dataset.fields || 'title,description')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const limit = Number(widget.dataset.limit) || 60;

  let rows = [];
  try {
    const resp = await fetch(src);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    // Accept both `{ data: [] }` and a bare array, since both are common.
    rows = Array.isArray(json) ? json : (json.data ?? []);
  } catch {
    countEl.textContent = 'The index could not be loaded.';
    return;
  }

  // Precompute one haystack per row so typing does not re-read every field.
  const haystacks = new WeakMap();
  rows.forEach((row) => {
    haystacks.set(row, normalize(searchKeys.map((k) => row[k]).join(' ')));
  });

  /** Distinct values per facet, in the order they first appear. */
  const facetValues = facetKeys.map((key) => ({
    key,
    values: [...new Set(rows.map((r) => r[key]).filter((v) => v != null && v !== ''))],
  })).filter((f) => f.values.length > 1);

  const params = new URLSearchParams(window.location.search);
  const state = {
    q: params.get('q') || '',
    filters: new Map(facetValues.map(({ key }) => [key, new Set(
      (params.get(key) || '').split(',').filter(Boolean),
    )])),
  };

  input.value = state.q;

  /*
   * Only this widget's own keys are touched. Rewriting the whole query string
   * would throw away `?lang=` and anything else the page relies on.
   */
  const syncUrl = () => {
    const next = new URLSearchParams(window.location.search);
    if (state.q) next.set('q', state.q); else next.delete('q');
    state.filters.forEach((set, key) => {
      if (set.size) next.set(key, [...set].join(',')); else next.delete(key);
    });
    const qs = next.toString();
    window.history.replaceState(null, '', qs ? `?${qs}${window.location.hash}` : window.location.pathname);
  };

  const matches = (row) => {
    const q = normalize(state.q);
    if (q && !haystacks.get(row).includes(q)) return false;
    return [...state.filters].every(([key, set]) => !set.size || set.has(row[key]));
  };

  const render = () => {
    const found = rows.filter(matches);
    const shown = found.slice(0, limit);

    resultsEl.replaceChildren(...shown.map((row) => {
      const li = el('li', 'faceted-search-result');
      const title = row.title || row.path || 'Untitled';
      const heading = el('h3', 'faceted-search-result-title');

      if (row.path) {
        const link = el('a', null, title);
        link.href = row.path;
        heading.append(link);
      } else {
        heading.textContent = title;
      }
      li.append(heading);

      if (row.description) li.append(el('p', 'faceted-search-result-text', row.description));

      const tags = facetKeys.map((k) => row[k]).filter(Boolean);
      if (tags.length) {
        const ul = el('ul', 'faceted-search-tags');
        ul.append(...tags.map((t) => el('li', null, t)));
        li.append(ul);
      }
      return li;
    }));

    const active = state.q || [...state.filters.values()].some((s) => s.size);
    resetBtn.hidden = !active;

    if (!found.length) {
      countEl.textContent = 'No matches';
      emptyEl.textContent = active
        ? 'Nothing matches those filters. Try clearing one.'
        : 'There is nothing in this index yet.';
      emptyEl.hidden = false;
    } else {
      emptyEl.hidden = true;
      const of = found.length > shown.length ? ` (showing ${shown.length})` : '';
      countEl.textContent = `${found.length} ${found.length === 1 ? 'result' : 'results'}${of}`;
    }
  };

  // Facets are checkbox groups in a fieldset: multiple values within a facet are
  // OR'd, which is what a checkbox implies, and what people expect.
  facetsEl.replaceChildren(...facetValues.map(({ key, values }) => {
    const group = el('fieldset', 'faceted-search-facet');
    group.append(el('legend', null, key.charAt(0).toUpperCase() + key.slice(1)));

    values.forEach((value) => {
      const label = el('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = value;
      box.checked = state.filters.get(key).has(value);
      box.addEventListener('change', () => {
        const set = state.filters.get(key);
        if (box.checked) set.add(value); else set.delete(value);
        syncUrl();
        render();
      });
      label.append(box, el('span', null, value));
      group.append(label);
    });
    return group;
  }));

  input.addEventListener('input', debounce(() => {
    state.q = input.value.trim();
    syncUrl();
    render();
  }, DEBOUNCE_MS));

  // A search form must not navigate; Enter should just settle the current query.
  form.addEventListener('submit', (event) => event.preventDefault());

  form.addEventListener('reset', () => {
    // Let the browser clear the controls first, then rebuild from empty state.
    window.requestAnimationFrame(() => {
      state.q = '';
      state.filters.forEach((set) => set.clear());
      syncUrl();
      render();
    });
  });

  render();
}
