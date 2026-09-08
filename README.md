# Widgets for AEM Edge Delivery Services

A library of self-contained widgets for [AEM Edge Delivery Services](https://www.aem.live/),
each one running live in the gallery, documented, and downloadable as source.

- **Gallery:** https://main--eds-widgets--parkpx1.aem.live/gallery/
- **Preview:** https://main--eds-widgets--parkpx1.aem.page/gallery/

## Blocks and widgets are not the same thing

A **block** gives form and function to content an author writes in a document. The
author fills in a table, and the block decorates whatever arrives — including the
cells they left out.

A **widget** is the application part of a site: a form, a search, a calculator, a
locator, an account screen. There is no content to author. The author pastes a
single link on its own line and the widget brings its own markup, styling and
behaviour.

```
https://main--eds-widgets--parkpx1.aem.live/widgets/cost-estimator/cost-estimator.html
```

Parameters go on the query string and arrive as `data-` attributes:

```
…/widgets/faceted-search/faceted-search.html?src=/query-index.json&facets=category,level
```

See [aem.live/docs/widgets](https://www.aem.live/docs/widgets) for the platform
behaviour this library builds on.

## The widgets

| Widget | What it is for |
| --- | --- |
| [`stepped-form`](widgets/stepped-form) | Multi-step form with native validation, an error summary that links to fields, and managed focus. |
| [`faceted-search`](widgets/faceted-search) | Search and checkbox facets over a JSON index, with filter state kept in the URL. |
| [`cost-estimator`](widgets/cost-estimator) | Range inputs driving a live figure, formatted per locale and currency through `Intl`. |

## Using one

Two ways, and the right one depends on whether you want updates.

**Copy the files in.** Download the widget from the gallery, or copy its folder
into your own `/widgets/`. You own it from then on: no external request at runtime,
and no surprise when this repository changes. This is the recommended route for
production.

**Reference this deployment.** Point an author's link straight at the URLs above.
Fine for a prototype or a demo, but it makes your page depend on a host you do not
control, so do not ship it that way.

## The contract every widget here follows

This is the shape the platform expects, and the part worth getting right once:

```
widgets/<name>/<name>.html    markup, injected into the block element
widgets/<name>/<name>.css     styles, scoped to .<name>
widgets/<name>/<name>.js      default-exported decorate(element)
widgets/<name>/<name>.json    optional configuration or data
```

- The block element receives the class `<name>`, **not** `widget`. Scope CSS to
  `.<name>` and nothing else — a widget that needs a host page's CSS to look right
  is broken in every project that adopts it.
- Query parameters land on `element.dataset`. Read them there; do not re-parse
  `window.location`.
- `decorate(element)` runs after the HTML is injected. It may be `async`; the
  platform awaits it.
- `<name>.html` is a fragment. No `<html>`, no `<head>`, and no `<script>` — it is
  injected with `innerHTML`, so inline scripts would not run anyway.

## Standards these widgets are held to

The point of a library is that consumers do not have to re-audit each piece. Every
widget in this repository:

- **Has zero runtime dependencies** and needs no build step. What is in the folder
  is what runs.
- **Declares behaviour in markup first.** Constraints live in HTML attributes and
  are read back through the platform's own APIs, so the rules survive a script
  that fails to load.
- **Passes axe with no WCAG 2.1 A or AA violations**, in its error and empty states
  as well as its happy path, at mobile and desktop widths.
- **Manages focus deliberately.** Anything that changes what is on screen says so
  through a live region and puts focus somewhere a keyboard user expects.
- **Degrades instead of disappearing.** A missing parameter or an unreachable data
  source produces a plain message, never a blank element or a console trace.
- **Keeps shareable state in the URL** where a view is worth linking to.
- **Delegates formatting to `Intl`** rather than shipping tables of separators and
  currency symbols.

## Adding a widget

1. Create `widgets/<name>/` with the four files above.
2. Add one entry to [`gallery/widgets.json`](gallery/widgets.json) — `name`,
   `title`, `summary`, `why`, `files`, `params`, optional `demo` query string and
   preview `height`.
3. Run `npm run lint`.

The gallery builds itself from that manifest: the card, the live preview, the
parameter table and the download all read the same entry, so there is nowhere for
them to drift apart. There is no gallery code to edit.

## Local development

```sh
npm i
npm run lint
```

For the gallery and the widget demos, any static server rooted at the repository
works, because they are committed files and depend on no content source:

```sh
python3 -m http.server 8899   # then open http://localhost:8899/gallery/
```

To work on the site the way the platform serves it, with previewed content:

```sh
npx -y @adobe/aem-cli up      # opens http://localhost:3000
```

## How the gallery works without any authored content

Edge Delivery Services normally serves pages from a content source. The gallery
does not use one: `gallery/index.html` and `gallery/demo.html` are committed files,
and every committed file is served.

`gallery/demo.js` reproduces what `blocks/widget/widget.js` does when the pipeline
turns an authored link into a widget — set the class, copy query parameters onto
`dataset`, inject the HTML, load the CSS, call `decorate`. That gives every widget
a real demo URL that needs no document, which is why the cards can embed a running
widget rather than a screenshot of one.

It is a deliberate copy rather than an import. The demo host must keep working if
the block changes, and the block must not grow a dependency on the gallery.

## Licence

Apache 2.0, inherited from [`aem-boilerplate`](https://github.com/adobe/aem-boilerplate).
