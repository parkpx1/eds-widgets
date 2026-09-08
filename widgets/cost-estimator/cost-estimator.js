/*
 * cost-estimator
 *
 * Sliders in, a formatted figure out. The interesting part is not the arithmetic
 * but the formatting: `Intl.NumberFormat` is given the document's own language, so
 * the same widget prints "$48,000" for an English page and "48 000 $" for a French
 * one without carrying a table of separators and symbol positions.
 *
 * Rates are data, not code. They arrive from cost-estimator.json so a project can
 * change the numbers without touching a script or re-reviewing logic.
 *
 * Parameters, passed on the widget URL and read from `dataset`:
 *   currency  ISO 4217 code. Defaults to the value in the JSON, then USD.
 *   locale    BCP 47 tag for formatting. Defaults to the document language.
 *   rates     URL of an alternative rates file.
 */

const FALLBACK = {
  currency: 'USD',
  perPage: 120,
  perLocale: 2400,
  perBlock: 900,
  base: 6000,
  migration: 8000,
  training: 3500,
  note: 'An order-of-magnitude estimate, not a quote.',
};

export default async function decorate(widget) {
  const form = widget.querySelector('.cost-estimator-form');
  const totalEl = widget.querySelector('.cost-estimator-total');
  const breakdownEl = widget.querySelector('.cost-estimator-breakdown');
  const noteEl = widget.querySelector('.cost-estimator-note');
  if (!form) return;

  let rates = FALLBACK;
  try {
    const url = widget.dataset.rates
      || new URL('cost-estimator.json', import.meta.url).href;
    const resp = await fetch(url);
    if (resp.ok) rates = { ...FALLBACK, ...(await resp.json()) };
  } catch {
    // Keeping the fallback is the correct outcome: a missing rates file should
    // still produce a working estimator rather than an empty box.
  }

  const locale = widget.dataset.locale
    || document.documentElement.lang
    || 'en';
  const currency = widget.dataset.currency || rates.currency;

  const money = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
  const number = new Intl.NumberFormat(locale);

  const controls = [...form.querySelectorAll('input[type="range"]')];

  /** Mirrors each slider's value into its paired output. */
  const syncOutputs = () => {
    controls.forEach((input) => {
      const out = form.querySelector(`output[for="${input.id}"]`);
      if (out) out.textContent = number.format(Number(input.value));
    });
  };

  const compute = () => {
    const data = new FormData(form);
    const pages = Number(data.get('pages'));
    const locales = Number(data.get('locales'));
    const blocks = Number(data.get('blocks'));

    const lines = [
      { label: 'Base engagement', amount: rates.base },
      { label: `Pages (${number.format(pages)})`, amount: pages * rates.perPage },
      { label: `Locales (${number.format(locales)})`, amount: (locales - 1) * rates.perLocale },
      { label: `Custom blocks (${number.format(blocks)})`, amount: blocks * rates.perBlock },
    ];
    if (data.get('migration')) lines.push({ label: 'Content migration', amount: rates.migration });
    if (data.get('training')) lines.push({ label: 'Author training', amount: rates.training });

    return lines.filter((line) => line.amount > 0);
  };

  const render = () => {
    syncOutputs();
    const lines = compute();
    const total = lines.reduce((sum, line) => sum + line.amount, 0);

    totalEl.textContent = money.format(total);

    breakdownEl.replaceChildren(...lines.flatMap(({ label, amount }) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = money.format(amount);
      return [dt, dd];
    }));

    noteEl.textContent = rates.note;
  };

  // `input` rather than `change`, so the figure tracks the slider as it moves.
  form.addEventListener('input', render);
  render();
}
