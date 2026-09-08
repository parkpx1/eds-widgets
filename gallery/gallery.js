/*
 * Builds the gallery from gallery/widgets.json.
 *
 * Nothing about a widget is written twice: the cards, the live previews, the
 * parameter tables and the downloads all read the same manifest, so adding a
 * widget is one entry and no edits here.
 *
 * The live preview is an iframe pointing at the shared demo host. That buys real
 * isolation — one widget's CSS cannot reach another's, and a widget that throws
 * takes down its own frame rather than the page listing it. It is also honest:
 * what a visitor sees is the widget as a consuming page would load it.
 */

import zip from './zip.js';

const MANIFEST = '/gallery/widgets.json';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * @param {object} widget Manifest entry.
 * @param {boolean} embed True for the in-card frame, which drops the demo page's
 *   own heading so the height goes to the widget instead.
 */
function demoUrl(widget, embed = false) {
  const params = new URLSearchParams(`widget=${widget.name}`);
  if (widget.demo) {
    new URLSearchParams(widget.demo).forEach((value, key) => params.set(key, value));
  }
  if (embed) params.set('embed', '1');
  return `/gallery/demo.html?${params}`;
}

/** The snippet an author actually pastes, including the demo's own parameters. */
function snippetFor(widget, origin) {
  const base = `${origin}/widgets/${widget.name}/${widget.name}.html`;
  return widget.demo ? `${base}?${widget.demo}` : base;
}

function paramTable(widget) {
  if (!widget.params?.length) return null;

  const table = el('table', 'card-params');
  const caption = el('caption', null, 'Parameters');
  const head = el('thead');
  const headRow = el('tr');
  ['Name', 'Required', 'Description'].forEach((h) => headRow.append(el('th', null, h)));
  head.append(headRow);

  const body = el('tbody');
  widget.params.forEach((param) => {
    const row = el('tr');
    const name = el('th', null, param.name);
    name.scope = 'row';
    row.append(
      name,
      el('td', null, param.required ? 'Yes' : 'No'),
      el('td', null, param.description),
    );
    body.append(row);
  });

  table.append(caption, head, body);
  return table;
}

/**
 * Fetches a widget's files and hands them over as one archive.
 * Files are read from the deployed paths, so a download always matches what the
 * demo above it just ran.
 */
async function download(widget, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Packaging…';

  try {
    const files = await Promise.all(
      widget.files.map(async (file) => {
        const resp = await fetch(`/widgets/${widget.name}/${file}`);
        if (!resp.ok) throw new Error(`${file}: HTTP ${resp.status}`);
        return { name: `${widget.name}/${file}`, text: await resp.text() };
      }),
    );

    const url = URL.createObjectURL(zip(files));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${widget.name}.zip`;
    link.click();
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    button.textContent = original;
  } catch (error) {
    button.textContent = 'Download failed';
    // eslint-disable-next-line no-console
    console.error(`could not package ${widget.name}`, error);
  } finally {
    button.disabled = false;
  }
}

function card(widget, origin) {
  const li = el('li', 'card');

  const header = el('div', 'card-header');
  header.append(
    el('h2', 'card-title', widget.title),
    el('p', 'card-name', `/widgets/${widget.name}/`),
    el('p', 'card-summary', widget.summary),
  );
  li.append(header);

  const frame = el('div', 'card-preview');
  const iframe = document.createElement('iframe');
  iframe.src = demoUrl(widget, true);
  iframe.title = `${widget.title} — live demo`;
  iframe.loading = 'lazy';
  // Widgets differ a lot in natural height, so the manifest can say. Guessing one
  // height for all of them either clips the tall ones or pads the short ones.
  if (widget.height) iframe.style.height = widget.height;
  // The demo host is same-origin and committed alongside this page, but the
  // sandbox still states what a widget is allowed to do.
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-downloads');
  frame.append(iframe);
  li.append(frame);

  if (widget.why) {
    const why = el('div', 'card-why');
    why.append(el('h3', null, 'Why it is built this way'), el('p', null, widget.why));
    li.append(why);
  }

  const table = paramTable(widget);
  if (table) li.append(table);

  const snippet = el('pre', 'card-code');
  snippet.append(el('code', null, snippetFor(widget, origin)));
  li.append(snippet);

  const actions = el('div', 'card-actions');

  const open = el('a', 'card-button', 'Open demo');
  open.href = demoUrl(widget);
  open.target = '_blank';
  open.rel = 'noreferrer noopener';

  const dl = el('button', 'card-button card-button-solid', 'Download source');
  dl.type = 'button';
  dl.addEventListener('click', () => download(widget, dl));

  const source = el('a', 'card-button', 'View on GitHub');
  source.href = `https://github.com/parkpx1/eds-widgets/tree/main/widgets/${widget.name}`;
  source.target = '_blank';
  source.rel = 'noreferrer noopener';

  actions.append(open, dl, source);
  li.append(actions);

  return li;
}

async function build() {
  const list = document.querySelector('#cards');
  try {
    const resp = await fetch(MANIFEST);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const { widgets } = await resp.json();
    // The snippet should show the host a visitor is actually on, so copying it
    // from a preview deployment does not paste a production URL.
    list.replaceChildren(...widgets.map((w) => card(w, window.location.origin)));
  } catch (error) {
    list.replaceChildren(
      el('li', 'cards-error', 'The widget manifest could not be loaded.'),
    );
    // eslint-disable-next-line no-console
    console.error('failed to build gallery', error);
  }
}

build();
