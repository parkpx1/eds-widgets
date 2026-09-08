/*
 * stepped-form
 *
 * A multi-step form that stays usable when things go wrong.
 *
 * The form carries `novalidate` so the browser does not pop its own bubbles,
 * which are unstyleable, vanish on blur and are announced inconsistently. The
 * constraints themselves are still declared in HTML (`required`, `type="email"`)
 * and read back through the Constraint Validation API, so the rules live in one
 * place and keep working if this script never loads.
 *
 * Parameters, passed on the widget URL and read from `dataset`:
 *   action   Where to POST on submit. Omit to resolve locally and show a summary.
 *   endLabel Text shown after a successful submit.
 */

/** Fields a step owns, ignoring anything a browser would not submit. */
function fieldsOf(step) {
  return [...step.querySelectorAll('input, select, textarea')].filter(
    (el) => !el.disabled && el.type !== 'button',
  );
}

/**
 * Wording matters more than correctness here: "Enter an email address" tells a
 * person what to do, where "Please match the requested format" does not.
 */
function messageFor(field) {
  const label = field.labels?.[0]?.textContent.trim().replace(/[?:]$/, '') ?? field.name;
  if (field.validity.valueMissing) {
    if (field.type === 'checkbox') return 'Confirm the details before sending';
    if (field.tagName === 'SELECT') return `Choose ${label.toLowerCase()}`;
    return `Enter ${label.toLowerCase()}`;
  }
  if (field.validity.typeMismatch && field.type === 'email') {
    return 'Enter an email address, like name@example.com';
  }
  return field.validationMessage;
}

function showError(field, message) {
  const error = field.closest('.stepped-form-field')?.querySelector('.stepped-form-error');
  field.setAttribute('aria-invalid', 'true');
  if (!error) return;
  error.textContent = message;
  error.hidden = false;
  // Tie the message to the field so it is read as part of the field, not adrift.
  const ids = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  if (!ids.includes(error.id)) {
    field.setAttribute('aria-describedby', [...ids, error.id].join(' '));
  }
}

function clearError(field) {
  const error = field.closest('.stepped-form-field')?.querySelector('.stepped-form-error');
  field.removeAttribute('aria-invalid');
  if (!error) return;
  error.hidden = true;
  error.textContent = '';
}

export default function decorate(widget) {
  const form = widget.querySelector('.stepped-form-form');
  if (!form) return;

  const steps = [...widget.querySelectorAll('.stepped-form-step')];
  if (!steps.length) return;

  const progress = widget.querySelector('.stepped-form-progress');
  const summary = widget.querySelector('.stepped-form-summary');
  const summaryTitle = widget.querySelector('.stepped-form-summary-title');
  const summaryList = widget.querySelector('.stepped-form-summary-list');
  const review = widget.querySelector('.stepped-form-review');
  const done = widget.querySelector('.stepped-form-done');
  const backBtn = widget.querySelector('.stepped-form-back');
  const nextBtn = widget.querySelector('.stepped-form-next');
  const submitBtn = widget.querySelector('.stepped-form-submit');

  let index = 0;

  const hideSummary = () => {
    summary.hidden = true;
    summaryList.replaceChildren();
  };

  /** Rebuilds the review step from whatever has actually been entered. */
  const renderReview = () => {
    const entries = steps.slice(0, -1).flatMap((step) => fieldsOf(step)
      .filter((f) => f.type !== 'checkbox' && f.value.trim())
      .map((f) => {
        const label = f.labels?.[0]?.textContent.trim() ?? f.name;
        const value = f.tagName === 'SELECT' ? f.selectedOptions[0].textContent : f.value;
        return { label, value };
      }));

    review.replaceChildren(
      ...entries.flatMap(({ label, value }) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        return [dt, dd];
      }),
    );
  };

  const render = () => {
    steps.forEach((step, i) => {
      step.hidden = i !== index;
    });

    const last = index === steps.length - 1;
    if (last) renderReview();

    backBtn.hidden = index === 0;
    nextBtn.hidden = last;
    submitBtn.hidden = !last;

    progress.textContent = `Step ${index + 1} of ${steps.length}: ${steps[index].dataset.step}`;
  };

  /**
   * Validates one step and, when it fails, builds the summary and moves focus.
   * Returns true when the step is clear.
   */
  const validateStep = () => {
    const invalid = fieldsOf(steps[index]).filter((field) => {
      clearError(field);
      if (field.checkValidity()) return false;
      showError(field, messageFor(field));
      return true;
    });

    if (!invalid.length) {
      hideSummary();
      return true;
    }

    summaryTitle.textContent = invalid.length === 1
      ? 'There is one thing to fix'
      : `There are ${invalid.length} things to fix`;

    summaryList.replaceChildren(
      ...invalid.map((field) => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = `#${field.id}`;
        link.textContent = messageFor(field);
        link.addEventListener('click', (event) => {
          event.preventDefault();
          field.focus();
        });
        li.append(link);
        return li;
      }),
    );

    summary.hidden = false;
    // Focus the summary rather than the field: the person hears how many
    // problems there are before being dropped into the first one.
    summary.focus();
    return false;
  };

  nextBtn.addEventListener('click', () => {
    if (!validateStep()) return;
    index = Math.min(index + 1, steps.length - 1);
    render();
    steps[index].querySelector('legend')?.scrollIntoView({ block: 'nearest' });
    fieldsOf(steps[index])[0]?.focus();
  });

  backBtn.addEventListener('click', () => {
    hideSummary();
    index = Math.max(index - 1, 0);
    render();
    fieldsOf(steps[index])[0]?.focus();
  });

  // Clear a field's error as soon as it becomes valid, so the message does not
  // sit there contradicting what the person just typed.
  form.addEventListener('input', (event) => {
    const field = event.target;
    if (field.getAttribute('aria-invalid') && field.checkValidity()) clearError(field);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateStep()) return;

    const data = new FormData(form);
    const { action, endLabel } = widget.dataset;

    if (action) {
      submitBtn.disabled = true;
      try {
        const resp = await fetch(action, { method: 'POST', body: data });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      } catch {
        submitBtn.disabled = false;
        summaryTitle.textContent = 'That did not send';
        summaryList.replaceChildren(
          Object.assign(document.createElement('li'), {
            textContent: 'Something went wrong on the way. Try again in a moment.',
          }),
        );
        summary.hidden = false;
        summary.focus();
        return;
      }
    }

    form.querySelectorAll('.stepped-form-step, .stepped-form-actions').forEach((el) => {
      el.hidden = true;
    });
    progress.textContent = '';
    hideSummary();
    done.textContent = endLabel || 'Thank you — that has been sent.';
    done.hidden = false;
    done.focus?.();
  });

  render();
}
