/*
 * Standalone widget host.
 *
 * This mirrors what `blocks/widget/widget.js` does when the pipeline turns an
 * authored link into a widget: put the widget's name on the element, copy the
 * query parameters onto `dataset`, inject the HTML, load the CSS, then hand the
 * element to the module's default export.
 *
 * It exists so every widget has a demo URL that depends on nothing but committed
 * files — no content source, no authored document, no pipeline. That keeps the
 * gallery honest the moment the repository is deployed, and it is also the reason
 * the cards can embed a real running widget rather than a screenshot.
 *
 * Deliberately a copy rather than an import: this file must keep working if the
 * block is edited, and the block must not grow a dependency on the gallery.
 */

function fail(mount, message) {
  const p = document.createElement('p');
  p.className = 'demo-error';
  p.textContent = message;
  mount.replaceChildren(p);
}

async function mountWidget() {
  const mount = document.querySelector('#widget');
  const params = new URLSearchParams(window.location.search);
  const name = params.get('widget');

  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    fail(mount, 'Add ?widget=<name> to this URL.');
    return;
  }

  document.title = `${name} — widget demo`;
  const heading = document.querySelector('#demo-title');
  if (heading) heading.textContent = name;

  /*
   * `embed` strips this page's own heading and footer. The gallery frames these
   * demos inside cards that already say what each widget is, so repeating the
   * title inside the frame wastes the height the widget needs.
   */
  if (params.get('embed')) document.body.classList.add('demo-embed');

  mount.classList.add(name);

  // Everything except the host's own parameters is the widget's configuration,
  // matching how the block treats the query string on an authored link.
  const hostParams = ['widget', 'embed'];
  params.forEach((value, key) => {
    if (!hostParams.includes(key)) mount.dataset[key] = value;
  });

  const base = `/widgets/${name}/${name}`;
  try {
    const resp = await fetch(`${base}.html`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    mount.innerHTML = await resp.text();

    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${base}.css`;
    document.head.append(css);

    const mod = await import(`${base}.js`);
    if (mod.default) await mod.default(mount);
  } catch (error) {
    fail(mount, `That widget could not be loaded: ${error.message}`);
  }
}

mountWidget();
