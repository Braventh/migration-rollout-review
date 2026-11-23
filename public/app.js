const el = id => document.getElementById(id);
const fields = ['actors', 'deploy', 'recovery', 'evidence'];
const inputs = ['title', 'sql', 'snapshot', ...fields];
const state = { id: null, plan: null, fingerprint: null, busy: false, library: [] };
const controls = ['new', 'example', 'inspect', 'generate', 'save', 'copy'];

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
async function api(path, input) {
  const response = await fetch('/api/' + path, input === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'The local server could not complete this request.');
  return payload;
}
function input() {
  return {
    title: el('title').value, sql: el('sql').value, snapshot: el('snapshot').value,
    context: Object.fromEntries(fields.map(id => [id, el(id).value]))
  };
}
const fingerprint = () => JSON.stringify(input());
const decisions = () => Object.fromEntries([...document.querySelectorAll('[data-decision]')].map(e => [e.dataset.decision, e.value]));
function refreshActions() {
  for (const id of controls) el(id).disabled = state.busy || (id === 'save' && state.fingerprint !== fingerprint());
  for (const button of el('library').querySelectorAll('button')) button.disabled = state.busy;
}
function renderLibrary() {
  const library = el('library');
  library.replaceChildren();
  if (!state.library.length) library.textContent = 'No saved reviews yet.';
  for (const row of state.library) {
    const button = node('button', row.title);
    button.type = 'button';
    if (row.id === state.id) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', () => {
      if (hasChanges() && !window.confirm('Discard unsaved changes and open this review?')) return;
      run('Opening review…', async () => {
        const { id, plan, snapshotText } = await api('reviews/' + row.id);
        fill({ ...plan, snapshot: snapshotText });
        state.id = id;
        showPlan(plan);
        showExport();
        renderLibrary();
        notice('status', 'Opened saved review.');
        el('review').scrollIntoView();
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
}
function fill(data = { context: {} }) {
  for (const id of inputs) el(id).value = (fields.includes(id) ? data.context[id] : data[id]) ?? '';
  state.id = null;
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
  el('download').href = '/api/reviews/' + state.id + '/markdown';
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
  notice('status', label);
  try { await work(); }
  catch (err) {
    notice('status');
    notice('error', err.message);
    el('error').scrollIntoView({ block: 'nearest' });
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
  if (plan.snapshot) {
    const s = plan.snapshot;
    const block = node('div', undefined, 'info');
    block.append(node('strong', 'Imported database evidence'),
      node('p', s.role + ' · ' + s.capturedAt + ' · ' + printable(s.longTransactions) + ' visible transactions >60s' +
      (s.role === 'replica' ? ' · last replay age ' + printable(s.lastReplay) + ' s (not replica lag)' : '')));
    list(block, s.tables.map(t => t.schema + '.' + t.table + ' — ' + (t.kind
      ? printable(t.bytes) + ' bytes · ' + printable(t.rows) + ' estimated rows · ' + printable(t.indexes) +
        ' indexes (' + printable(t.invalid) + ' invalid/not ready)'
      : 'not found')), 'snapshot-list');
    root.append(block);
  }
  if (plan.notices.length || plan.unanswered.length || plan.uncovered.length) {
    const block = node('div', undefined, 'warning');
    block.append(node('strong', 'Evidence and coverage to check'));
    list(block, [...plan.notices, ...plan.unanswered.map(x => 'Unanswered: ' + x), ...plan.uncovered]);
    root.append(block);
  }
  if (plan.control) root.append(node('p', 'No material pattern found in these literal controls or comments. Check the complete deploy bundle.', 'info'));
  else if (!plan.gates.length) root.append(node('p', 'No supported pattern found. Manual review is required.', 'info'));
  for (const [i, g] of plan.gates.entries()) {
    const box = node('article', undefined, 'gate');
    box.append(node('h3', g.label + ' · statement ' + g.statement), node('p', g.target, 'target'));
    if (g.note) box.append(node('p', g.note));
    for (const [label, text] of [['Proposed sequence', g.order], ['Verify', g.verify], ['Pause if', g.pause]]) {
      const line = node('p');
      line.append(node('strong', label + ': '), text);
      box.append(line);
    }
    const label = node('label', 'Team decision');
    label.htmlFor = 'decision-' + i;
    const area = node('textarea');
    area.id = label.htmlFor;
    area.dataset.decision = g.id;
    area.rows = 2;
    area.maxLength = 2000;
    area.placeholder = 'Record the decision, owner, and what remains open.';
    area.value = g.decision;
    area.addEventListener('input', () => { el('download').hidden = true; });
    box.append(label, area);
    root.append(box);
  }
}

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
      version: 1, captured_at: new Date().toISOString(), role: 'primary',
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
el('inspect').addEventListener('click', () => run('Inspecting SQL…', async () => {
  const a = await api('inspect', { sql: el('sql').value });
  el('capture').hidden = false;
  el('inspection').textContent = a.targets.length ? 'Scoped to ' + a.targets.map(r => r.schema + '.' + r.table).join(', ') + '.'
    : 'No table targets found. An optional snapshot can still capture connection-level evidence.';
  if (a.notices.length) el('inspection').append(' ', a.notices.join(' '));
  el('query').textContent = a.query;
  notice('status', 'Capture query is ready.');
  el('context').scrollIntoView();
}));
el('copy').addEventListener('click', () => run('Copying capture SQL…', async () => {
  if (!navigator.clipboard) throw new Error('Clipboard unavailable. Select and copy the query manually.');
  await navigator.clipboard.writeText(el('query').textContent);
  notice('status', 'Capture SQL copied.');
}));
el('generate').addEventListener('click', () => run('Generating review…', async () => {
  const sameSql = state.plan?.sql === el('sql').value.trim();
  showPlan(await api('draft', { ...input(), decisions: sameSql ? decisions() : {} }));
  notice('status', 'Draft ready. Review the evidence and record your decisions.');
  el('review').scrollIntoView();
}));
el('save').addEventListener('click', () => run('Saving review…', async () => {
  const { id, plan } = await api('reviews', { ...input(), id: state.id ?? undefined, decisions: decisions() });
  state.id = id;
  showPlan(plan);
  showExport();
  state.library = await api('reviews');
  renderLibrary();
  notice('status', 'Review saved locally. Markdown is ready to download.');
}));
for (const id of inputs) el(id).addEventListener('input', () => {
  if (id === 'sql') clearInspection();
  el('download').hidden = true;
  if (state.plan) notice('status', 'Inputs changed. Generate the review again before saving.');
  refreshActions();
});
run('Loading workspace…', async () => {
  try {
    state.library = await api('reviews');
    renderLibrary();
    notice('status');
  } catch (error) {
    el('library').textContent = 'Could not load local reviews.';
    throw error;
  }
});
