const el = id => document.getElementById(id);
const fields = ['actors', 'deploy', 'recovery', 'evidence'];
const inputs = ['title', 'sql', 'snapshot', ...fields];
const fieldLimits = { sql: [48000, 'Migration SQL'], snapshot: [18000, 'Database snapshot'] };
const state = { id: null, updatedAt: null, plan: null, fingerprint: null, busy: false, library: [] };
const controls = ['new', 'example', 'inspect', 'generate', 'save', 'copy', 'more-reviews'];

function node(tag, content, className) {
  const element = document.createElement(tag);
  if (content !== undefined) element.textContent = content;
  if (className) element.className = className;
  return element;
}
function notice(id, message = '') {
  el(id).textContent = message;
  el(id).hidden = !message;
}
function fieldError(id, message = '') {
  const field = el(id);
  const error = el(id + '-field-error');
  if (!field || !error) return false;
  const descriptions = (field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(x => x && x !== error.id);
  if (message) descriptions.push(error.id);
  if (descriptions.length) field.setAttribute('aria-describedby', descriptions.join(' '));
  else field.removeAttribute('aria-describedby');
  notice(error.id, message);
  if (fieldLimits[id] && !message) validateLimit(id);
  else if (message) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
  return true;
}
for (const id of inputs) {
  const error = node('p', undefined, 'error');
  error.id = id + '-field-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  el(id).after(error);
}
function validateLimit(id) {
  const [limit, label] = fieldLimits[id];
  const valid = el(id).value.length <= limit;
  if (valid) el(id).removeAttribute('aria-invalid');
  else el(id).setAttribute('aria-invalid', 'true');
  notice(id + '-size-error', valid ? '' : label + ' exceeds ' + limit.toLocaleString('en-US') + ' characters. Shorten it to continue.');
  return valid;
}
function requireLimits(...ids) {
  const invalid = ids.filter(id => !validateLimit(id));
  if (invalid.length) el(invalid[0]).focus();
  return !invalid.length;
}
async function request(path, input) {
  const response = await fetch('/api/' + path, input === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input)
  });
  if (!response.ok) {
    const payload = await response.json();
    throw Object.assign(new Error(payload.error ?? 'The server could not complete this request.'), { field: payload.field });
  }
  return response;
}
async function api(path, input) {
  return (await request(path, input)).json();
}
function input() {
  return {
    title: el('title').value, sql: el('sql').value, snapshot: el('snapshot').value,
    context: Object.fromEntries(fields.map(id => [id, el(id).value]))
  };
}
const fingerprint = () => JSON.stringify(input());
const decisions = () => Object.fromEntries([...document.querySelectorAll('[data-decision]')].map(e => [e.dataset.decision, e.value]));
const saveInput = () => ({ ...input(), id: state.id ?? undefined, updatedAt: state.updatedAt ?? undefined,
  gateVersion: state.plan?.gateVersion, decisions: decisions() });
const encoder = new TextEncoder();
function preventDiscard(event) {
  event.preventDefault();
  event.returnValue = true;
}
function refreshActions() {
  const size = state.plan && state.maxBytes ? encoder.encode(JSON.stringify(saveInput())).length : 0;
  const oversized = size > state.maxBytes;
  notice('request-size', oversized
    ? 'Review exceeds the total save limit of ' + state.maxBytes / 1024 + ' KiB. Shorten the inputs or decisions by at least ' +
      (size - state.maxBytes).toLocaleString('en-US') + ' UTF-8 bytes to save.'
    : size >= state.maxBytes * .75 ? 'This review uses ' + Math.ceil(size / 1024) + ' of ' + state.maxBytes / 1024 + ' KiB for saving.' : '');
  for (const id of controls) el(id).disabled = state.busy || (id === 'save' && (oversized || state.fingerprint !== fingerprint()));
  for (const button of el('library').querySelectorAll('button')) button.disabled = state.busy;
  if (hasChanges()) window.addEventListener('beforeunload', preventDiscard);
  else window.removeEventListener('beforeunload', preventDiscard);
}
async function loadLibrary(append = false) {
  const { reviews, next, maxBytes } = await api('reviews?page=' + encodeURIComponent(append ? state.next : ''));
  state.next = next;
  state.maxBytes = maxBytes;
  const loaded = append ? state.library : [];
  const ids = new Set(loaded.map(r => r.id));
  state.library = loaded.concat(reviews.filter(r => !ids.has(r.id)));
  renderLibrary();
}
function renderLibrary() {
  const library = el('library');
  library.replaceChildren();
  if (!state.library.length) library.textContent = 'No saved reviews yet.';
  el('more-reviews').hidden = !state.next;
  for (const row of state.library) {
    const button = node('button', row.title);
    button.type = 'button';
    if (row.id === state.id) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', () => {
      if (hasChanges() && !window.confirm('Discard unsaved changes and open this review?')) return;
      run('Opening review…', async () => {
        const { id, updatedAt, plan, snapshotText } = await api('reviews/' + row.id);
        fill({ ...plan, snapshot: snapshotText });
        state.id = id;
        state.updatedAt = updatedAt;
        showPlan(plan);
        showExport();
        renderLibrary();
        notice('status', 'Opened saved review.');
        el('review-heading').focus();
      });
    });
    library.append(button);
  }
  refreshActions();
}
function clearInspection() {
  el('capture').hidden = true;
  el('query-details').open = false;
  el('inspection').textContent = 'Inspect your SQL to generate a scoped database capture query.';
  el('inspection-scope')?.remove();
}
function fill(data = { context: {} }) {
  for (const id of inputs) el(id).value = (fields.includes(id) ? data.context[id] : data[id]) ?? '';
  for (const id of inputs) fieldError(id);
  state.id = null;
  state.updatedAt = null;
  state.plan = null;
  state.fingerprint = null;
  state.saved = null;
  clearInspection();
  showPlan();
  renderLibrary();
}
function hasChanges() {
  const current = JSON.stringify([input(), decisions()]);
  return state.saved ? state.saved !== current :
    Boolean(inputs.some(id => el(id).value) || Object.values(decisions()).some(Boolean));
}
function showExport() {
  el('download').href = '/api/reviews/' + state.id + '/markdown?updatedAt=' + encodeURIComponent(state.updatedAt);
  el('download').hidden = false;
  state.saved = JSON.stringify([input(), decisions()]);
}
async function run(label, work) {
  if (state.busy) return;
  state.busy = true;
  for (const id of inputs) el(id).readOnly = true;
  for (const area of document.querySelectorAll('[data-decision]')) area.readOnly = true;
  refreshActions();
  notice('error');
  for (const id of inputs) fieldError(id);
  notice('status', label);
  try { await work(); }
  catch (err) {
    notice('status');
    if (fieldError(err.field, err.message)) el(err.field).focus();
    else {
      notice('error', err.message);
      el('error').scrollIntoView({ block: 'nearest' });
    }
  } finally {
    state.busy = false;
    for (const id of inputs) el(id).readOnly = false;
    for (const area of document.querySelectorAll('[data-decision]')) area.readOnly = false;
    refreshActions();
  }
}
function printable(value) { return value === null ? 'unknown' : value.toLocaleString('en-US'); }
function list(container, items, className) {
  const ul = node('ul', undefined, className);
  for (const value of items) ul.append(node('li', value));
  container.append(ul);
}
function showPlan(plan) {
  state.plan = plan;
  state.fingerprint = plan ? fingerprint() : null;
  const root = el('plan');
  root.replaceChildren();
  el('save-actions').hidden = !plan;
  el('download').hidden = true;
  root.className = plan ? 'no-box' : 'empty';
  if (!plan) {
    root.textContent = 'No draft yet. Add your context and generate a review to see the proposed gates.';
    return;
  }
  const scope = node('div', undefined, 'warning');
  scope.append(node('strong', 'Execution scope: unknown'));
  list(scope, plan.execution);
  root.append(scope);
  if (plan.snapshot) {
    const s = plan.snapshot;
    const block = node('div', undefined, 'info');
    block.append(node('strong', s.synthetic ? 'Synthetic example evidence — not captured from a database' : 'Imported database evidence'),
      node('p', s.role + ' · ' + s.capturedAt + ' · ' + printable(s.longTransactions) + ' visible transactions >60s' +
      (s.role === 'replica' ? ' · last replay age ' + printable(s.lastReplay) + ' s (not replica lag)' : '')));
    list(block, s.tables.map(t => t.schema + '.' + t.table + ' — ' + (t.kind
      ? printable(t.bytes) + ' bytes · ' + printable(t.rows) + ' estimated rows · ' + printable(t.indexes) +
        ' indexes (' + printable(t.invalid) + ' invalid/not ready)'
      : 'unknown (not found in capture)')), 'snapshot-list');
    block.append(node('p', 'Estimated row counts are heuristic; capture does not establish current production state.'));
    root.append(block);
  }
  if (plan.notices.length || plan.unanswered.length || plan.uncovered.length) {
    const block = node('div', undefined, 'warning');
    block.append(node('strong', 'Evidence and coverage to check'));
    list(block, [...plan.notices.map((note, i) => plan.noticeLabels[i] + ': ' + note),
      ...plan.unanswered.map(x => 'Unknown: ' + x), ...plan.uncovered.map(x => 'Manual review: ' + x)]);
    root.append(block);
  }
  if (plan.control) root.append(node('p', 'No material pattern found in these literal controls or comments. Check the complete deploy bundle.', 'info'));
  else if (!plan.gates.length) root.append(node('p', 'No supported pattern found. Manual review is required.', 'info'));
  for (const [i, g] of plan.gates.entries()) {
    const box = node('article', undefined, 'gate');
    box.append(node('h3', g.label + ' · statement ' + g.statement), node('p', g.target, 'target'));
    box.append(node('p', 'Static inference'));
    if (g.note) box.append(node('p', g.note));
    if (g.behavior) box.append(node('p', 'Verified PostgreSQL behavior (not this rollout): ' + g.behavior));
    for (const [label, text] of [['Proposed sequence', g.order], ['Verify', g.verify], ['Pause if', g.pause]]) {
      const line = node('p');
      line.append(node('strong', label + ': '), text);
      box.append(line);
    }
    const label = node('label', 'Team decision');
    label.htmlFor = 'decision-' + i;
    const area = node('textarea');
    area.id = label.htmlFor;
    area.setAttribute('aria-label', 'Team decision: ' + g.label + ', statement ' + g.statement +
      (g.target ? ', ' + g.target : '') + ' (gate ' + (i + 1) + ')');
    area.dataset.decision = g.id;
    area.rows = 2;
    area.maxLength = 2000;
    area.placeholder = 'Record the decision, owner, and what remains open.';
    area.value = g.decision;
    area.addEventListener('input', () => { el('download').hidden = true; refreshActions(); });
    box.append(label, area);
    root.append(box);
  }
}

el('toggle-library').addEventListener('click', () => {
  const button = el('toggle-library');
  button.setAttribute('aria-expanded', String(button.getAttribute('aria-expanded') !== 'true'));
});
el('more-reviews').addEventListener('click', () => run('Loading older reviews…', async () => {
  const newest = state.library.length;
  await loadLibrary(true);
  el('library').children[newest]?.focus();
  notice('status');
}));
el('download').addEventListener('click', event => {
  event.preventDefault();
  run('Preparing Markdown…', async () => {
    const response = await request(el('download').getAttribute('href').slice('/api/'.length));
    const url = URL.createObjectURL(await response.blob());
    const link = node('a');
    link.href = url;
    link.download = 'rollout-review.md';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice('status');
  });
});
el('new').addEventListener('click', () => {
  if (hasChanges() && !window.confirm('Discard unsaved changes and start a new review?')) return;
  fill();
  notice('error');
  notice('status');
  el('title').focus();
});
el('example').addEventListener('click', () => {
  if (hasChanges() && !window.confirm('Replace your current inputs with the example?')) return;
  fill({
    title: 'Require billing region on invoices',
    sql: 'ALTER TABLE billing.invoices ADD COLUMN region text NOT NULL;',
    snapshot: JSON.stringify({
      version: 1, synthetic: true, captured_at: new Date().toISOString(), role: 'primary',
      last_replay_age_seconds: null, visible_long_transactions: 2,
      tables: [{ schema: 'billing', table: 'invoices', kind: 'r', bytes: 1342177280,
        rows_estimate: 2450000, indexes: 5, invalid_indexes: 0 }]
    }),
    context: {
      actors: 'Invoice API v1 and the nightly connector still write invoices; connector v1 omits region.',
      deploy: 'Keep the region-dependent read flag off until connector v2 is out and the region map reconciles.',
      recovery: 'API v1 recovery allowed for seven days. Check connector recovery compatibility separately.',
      evidence: 'Billing release owner: pause on any unresolved region mapping or writer error.'
    }
  });
  notice('error');
  notice('status', 'Synthetic example loaded, including a sample snapshot. Inspect or generate to try it.');
});
el('inspect').addEventListener('click', () => requireLimits('sql') && run('Inspecting SQL…', async () => {
  const a = await api('inspect', { sql: el('sql').value });
  el('capture').hidden = false;
  el('inspection').textContent = a.targets.length ? 'Scoped to ' + a.targets.map(r => r.schema + '.' + r.table).join(', ') + '.'
    : 'No table targets found. An optional snapshot can still capture connection-level evidence.';
  if (a.notices.length) el('inspection').append(' ', a.notices.join(' '));
  const scope = node('div', undefined, 'warning');
  scope.id = 'inspection-scope';
  list(scope, [...a.execution.map(note => 'Unknown: ' + note), ...a.lockNotices.map(note => 'Static inference: ' + note)]);
  el(scope.id)?.remove();
  el('inspection').after(scope);
  el('query').textContent = a.query;
  notice('status', 'Capture query is ready.');
  el('context').scrollIntoView();
}));
el('copy').addEventListener('click', () => run('Copying capture SQL…', async () => {
  if (!navigator.clipboard) throw new Error('Clipboard unavailable. Select and copy the query manually.');
  await navigator.clipboard.writeText(el('query').textContent);
  notice('status', 'Capture SQL copied.');
}));
el('generate').addEventListener('click', () => requireLimits('sql', 'snapshot') && run('Generating review…', async () => {
  const notes = decisions();
  const plan = await api('draft', input());
  if (state.plan?.sqlFingerprint === plan.sqlFingerprint) {
    if (state.plan.gateVersion === plan.gateVersion) {
      for (const gate of plan.gates) gate.decision = notes[gate.id] ?? '';
    } else {
      for (const previous of state.plan.gates) {
        if (!notes[previous.id]) continue;
        const matches = plan.gates.filter(gate => gate.kind === previous.kind && gate.statement === previous.statement &&
          gate.target === previous.target);
        if (matches.length !== 1)
          throw new Error('The rollout rules changed for a gate with a decision. Copy and clear that decision before regenerating the review.');
        matches[0].decision = notes[previous.id];
      }
    }
  }
  showPlan(plan);
  notice('status', 'Draft ready. Review the evidence and record your decisions.');
  el('review').scrollIntoView();
}));
el('save').addEventListener('click', () => run('Saving review…', async () => {
  const { id, updatedAt, plan } = await api('reviews', saveInput());
  state.id = id;
  state.updatedAt = updatedAt;
  showPlan(plan);
  showExport();
  await loadLibrary();
  notice('status', document.body.dataset.workspace === 'org'
    ? 'Review saved to the shared library. Markdown is ready to download.'
    : 'Review saved locally. Markdown is ready to download.');
}));
for (const id of inputs) el(id).addEventListener('input', () => {
  fieldError(id);
  if (id === 'sql') clearInspection();
  el('download').hidden = true;
  if (state.plan) notice('status', 'Inputs changed. Generate the review again before saving.');
  refreshActions();
});
run('Loading workspace…', async () => {
  try {
    await loadLibrary();
    notice('status');
  } catch (error) {
    el('library').textContent = 'Could not load local reviews.';
    throw error;
  }
});
