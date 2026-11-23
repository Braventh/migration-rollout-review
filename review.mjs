import { parse } from 'pgsql-parser';

export class InputError extends Error {}
export const limits = { title: 120, sql: 48000, snapshot: 18000, note: 2000, targets: 12 };
export const contextFields = {
  actors: 'Actors, old versions and jobs',
  deploy: 'Sequence, runner and feature flags',
  recovery: 'Recovery builds and retirement window',
  evidence: 'Owner, evidence and pause thresholds'
};
const patterns = {
  required: ['Required value', 'Stage the value and compatible writes first. Keep required reads and enforcement off until writers and historical data are ready.', 'Rehearse every writer and eligible recovery build; reconcile missing or unmapped rows.', 'A reachable writer can omit the value, or required historical values remain unresolved.'],
  rename: ['Rename', 'Expand first, keep both names usable during mixed versions, reconcile and switch before contract.', 'Verify old readers and writers (including imports and reindex jobs), concurrent-edit sync and the recovery cutoff.', 'Old-only traffic can bypass sync, or rollback still needs the old name.'],
  drop: ['Destructive removal', 'Deploy usage removal before a separate contract release.', 'Check generated-client selections, scheduled exports, retention and expiration of the recovery window.', 'Any reachable job, export or recovery build still needs the old shape.'],
  index: ['Index build', 'Keep dependent flags off until an applicable build and representative plan meet the latency objective.', 'Check the actual runner transaction boundary, lock budget and resulting usable index and query plan.', 'The runner cannot execute the selected build, the index is invalid, or performance evidence is missing.'],
  enum: ['Enum compatibility', 'Separate database acceptance, consumer readiness and first emission of the new value.', 'Replay persisted values through workers, webhooks and eligible recovery builds.', 'A reachable consumer rejects the value; turning a flag off does not remove stored values.'],
  type: ['Type change', 'Keep a compatible representation while copying, reconciling and switching; decide the legacy representability cap.', 'Exercise client/SDK serialization, JSON and boundary values, conversion and recovery.', 'Legacy range, conversion or rollback behavior has not been proven.'],
  fk: ['Foreign key', 'Make writers compatible before any enforcement and reconcile historical data before validation.', 'Replay the importer and recovery version. NOT VALID skips the historical scan, not enforcement on new writes for an enforced foreign key.', 'Child-before-parent writes or unresolved historical orphans remain.'],
  backfill: ['Data backfill candidate', 'Choose source of truth, batching, restart behavior and concurrent edit policy; reconcile before cutover.', 'Race a resumed batch with a live writer; compare stale non-null values as well as missing values.', 'Retries can overwrite newer data or parity and operational limits are not met.'],
  split: ['Possible table split', 'Expand separately, sync and reconcile, switch apps and workers, then retire old storage in a separate release.', 'Rehearse retry replay/drain, verify parity and confirm the recovery window has closed.', 'Retries or eligible recovery builds still require old storage, or data differs.']
};
const names = xs => (xs ?? []).map(x => x.String?.sval).filter(x => x !== undefined);
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const keyOf = r => JSON.stringify([r.schema, r.table]);
const display = r => quote(r.schema) + '.' + quote(r.table);
const fromRange = r => r?.relname ? { schema: r.schemaname ?? 'public', table: r.relname, assumed: !r.schemaname } : null;
const fromNames = xs => xs.length ? { schema: xs.at(-2) ?? 'public', table: xs.at(-1), assumed: xs.length < 2 } : null;
const same = (a, b) => a && b && keyOf(a) === keyOf(b);
const isLiteral = node => Boolean(node?.A_Const);

function topLevelSources(select) {
  const node = select?.SelectStmt;
  return (node?.fromClause ?? []).map(x => fromRange(x.RangeVar)).filter(Boolean);
}

export async function inspect(input) {
  const sql = field(input, 'Migration SQL', limits.sql, true);
  let stmts;
  try { ({ stmts } = await parse(sql)); }
  catch (error) { throw new InputError('PostgreSQL could not parse this SQL: ' + String(error.message).slice(0, 200)); }
  stmts ??= [];
  if (stmts.length > 100) throw new InputError('Review up to 100 statements at a time.');

  const relations = new Map(), findings = [], uncovered = [], notices = [];
  const created = [], removed = [], copies = [];
  let unqualified = false;
  const add = r => {
    if (!r) return;
    if (r.assumed) unqualified = true;
    relations.set(keyOf(r), { schema: r.schema, table: r.table });
  };
  const flag = (kind, index, r, item = '', note = '') => {
    findings.push({ id: kind + '-' + index + '-' + findings.length, kind, statement: index,
      target: [r && display(r), item].filter(Boolean).join(' · '), note });
  };

  for (const [i, { stmt }] of stmts.entries()) {
    const [type, node] = Object.entries(stmt)[0];
    const index = i + 1, r = fromRange(node.relation);
    const unknown = detail => uncovered.push('Statement ' + index + ': ' + detail);
    add(r);
    const fk = (c, name) => {
      add(fromRange(c.pktable));
      flag('fk', index, r, c.conname ?? name ?? '', c.skip_validation ? 'Historical validation is deferred.' : '');
    };
    switch (type) {
      case 'AlterTableStmt':
        for (const { AlterTableCmd: cmd } of node.cmds) {
          const col = cmd.def?.ColumnDef, c = cmd.def?.Constraint, name = cmd.name ?? col?.colname;
          const constraints = (col?.constraints ?? []).map(x => x.Constraint).filter(Boolean);
          if (cmd.subtype === 'AT_AddColumn') {
            if (constraints.some(c => c.contype === 'CONSTR_NOTNULL' || c.contype === 'CONSTR_PRIMARY'))
              flag('required', index, r, name);
            for (const c of constraints.filter(x => x.contype === 'CONSTR_FOREIGN')) fk(c, name);
            if (constraints.some(c => !['CONSTR_NOTNULL', 'CONSTR_NULL', 'CONSTR_FOREIGN'].includes(c.contype)))
              unknown('ADD COLUMN has additional constraints or defaults outside the rules.');
          } else if (cmd.subtype === 'AT_SetNotNull') flag('required', index, r, name);
          else if (cmd.subtype === 'AT_DropColumn') { flag('drop', index, r, name); removed.push(r); }
          else if (cmd.subtype === 'AT_AlterColumnType') flag('type', index, r, name);
          else if (cmd.subtype === 'AT_AddConstraint' && c?.contype === 'CONSTR_FOREIGN') fk(c, name);
          else unknown(cmd.subtype + ' is outside the rules; review manually.');
        }
        break;
      case 'RenameStmt':
        if (r && ['OBJECT_COLUMN', 'OBJECT_TABLE'].includes(node.renameType))
          flag('rename', index, r, [node.subname, node.newname].filter(Boolean).join(' → '));
        else unknown('Unsupported rename; review manually.');
        break;
      case 'DropStmt':
        if (['OBJECT_TABLE', 'OBJECT_VIEW', 'OBJECT_MATVIEW'].includes(node.removeType)) {
          for (const x of node.objects) {
            const victim = fromNames(names(x.List?.items)); add(victim);
            if (node.removeType === 'OBJECT_TABLE') removed.push(victim);
            flag('drop', index, victim, '', node.behavior === 'DROP_CASCADE' ? 'CASCADE may remove dependent objects.' : '');
          }
        } else unknown('Unsupported DROP object; review manually.');
        break;
      case 'IndexStmt':
        flag('index', index, r, node.idxname, node.concurrent
          ? 'CONCURRENTLY is requested; confirm the runner does not wrap it in a transaction.'
          : 'CONCURRENTLY is not requested; review blocked writes with the database owner.');
        break;
      case 'AlterEnumStmt':
        flag('enum', index, null, names(node.typeName).map(quote).join('.') + ' · ' + node.newVal,
          node.oldVal ? 'Renaming an existing value also breaks consumers that still use its old spelling.' : '');
        break;
      case 'UpdateStmt':
        flag('backfill', index, r, '', !node.whereClause ? 'No WHERE clause in the update.' : '');
        if (node.withClause) unknown('Nested CTE effects are not analyzed.');
        break;
      case 'CreateStmt':
        created.push(r);
        unknown('Review new table constraints and dependencies separately.');
        break;
      case 'InsertStmt': {
        const sources = topLevelSources(node.selectStmt);
        sources.forEach(add);
        if (sources.length) {
          flag('backfill', index, r, '', 'INSERT … SELECT copies data; confirm intended scope.');
          copies.push({ target: r, sources, index });
        } else unknown('INSERT effects are outside the rules.');
        if (node.withClause || node.selectStmt?.SelectStmt?.withClause) unknown('Nested CTE effects are not analyzed.');
        break;
      }
      case 'SelectStmt':
        if (Object.keys(node).every(key => ['targetList', 'limitOption', 'op'].includes(key)) &&
            node.targetList?.length && node.targetList.every(t => isLiteral(t.ResTarget?.val))) break;
        unknown('Only simple literal SELECT statements are treated as controls.');
        break;
      default:
        unknown(type + ' is outside the rules; review manually.');
    }
  }
  for (const { target, sources, index } of copies) {
    if (created.some(x => same(x, target)) && sources.some(x => removed.some(y => same(x, y))))
      flag('split', index, target, '', 'New table, copy from old storage, and destructive change to the source occur in one bundle.');
  }
  if (findings.some(f => f.kind === 'index' && f.note.startsWith('CONCURRENTLY')) &&
      stmts.some(({ stmt }) => stmt.TransactionStmt?.kind === 'TRANS_STMT_BEGIN' || stmt.TransactionStmt?.kind === 'TRANS_STMT_START'))
    notices.push('A concurrent index and explicit transaction start both appear in this bundle. Inspect actual statement order; a concurrent build cannot run inside a transaction block.');
  if (unqualified) notices.push('Snapshot lookup uses public for unqualified relations. Verify that matches the migration runner search_path or schema-qualify the migration in this review.');
  if (relations.size > limits.targets) notices.push('Snapshot covers only the first ' + limits.targets + ' distinct relations; split the review for coverage of additional relations.');
  const targets = [...relations.values()].slice(0, limits.targets);
  return { targets, findings, uncovered, notices, control: !findings.length && !uncovered.length, query: captureQuery(targets) };
}

export function field(input, label, max, required = false) {
  if (typeof input !== 'string' || input.length > max || input.includes('\0'))
    throw new InputError(label + ' must be text of at most ' + max + ' characters, with no null bytes.');
  const value = input.trim();
  if (required && !value) throw new InputError(label + ' is required.');
  return value;
}

function captureQuery(targets) {
  const literal = value => "pg_catalog.convert_from(pg_catalog.decode('" + Buffer.from(value).toString('hex') + "', 'hex'), 'UTF8')";
  const targetSQL = targets.length
    ? 'VALUES\n    ' + targets.map(x => '(' + literal(x.schema) + ', ' + literal(x.table) + ')').join(',\n    ')
    : 'SELECT NULL::text, NULL::text WHERE false';
  return [
    '-- Rollout Desk v1. Run in a fresh session with a read-only role.',
    '-- In psql use -Atq (or copy the JSON cell from a GUI client).',
    'BEGIN READ ONLY;',
    "SET LOCAL statement_timeout = '3s';",
    "SET LOCAL lock_timeout = '500ms';",
    'SET LOCAL search_path = pg_catalog;',
    'WITH target(schema_name, table_name) AS (',
    '    ' + targetSQL,
    '), observed AS (',
    "    SELECT t.schema_name AS schema, t.table_name AS table, c.relkind::text AS kind,",
    '           CASE WHEN c.oid IS NOT NULL THEN pg_total_relation_size(c.oid) END AS bytes,',
    '           CASE WHEN c.reltuples >= 0 THEN c.reltuples::bigint END AS rows_estimate,',
    '           CASE WHEN c.oid IS NOT NULL THEN count(i.indexrelid) END AS indexes,',
    '           CASE WHEN c.oid IS NOT NULL THEN count(i.indexrelid) FILTER (WHERE NOT i.indisvalid OR NOT i.indisready) END AS invalid_indexes',
    '    FROM target t',
    '    LEFT JOIN pg_namespace n ON n.nspname::text = t.schema_name',
    "    LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname::text = t.table_name AND c.relkind IN ('r','p','m','f','v')",
    '    LEFT JOIN pg_index i ON i.indrelid = c.oid',
    '    GROUP BY t.schema_name, t.table_name, c.oid, c.relkind, c.reltuples',
    ')',
    'SELECT json_build_object(',
    "    'version', 1, 'captured_at', statement_timestamp(),",
    "    'role', CASE WHEN pg_is_in_recovery() THEN 'replica' ELSE 'primary' END,",
    "    'last_replay_age_seconds', CASE WHEN pg_is_in_recovery() THEN",
    '        CASE WHEN pg_last_xact_replay_timestamp() IS NOT NULL THEN',
    '            greatest(0, EXTRACT(EPOCH FROM statement_timestamp() - pg_last_xact_replay_timestamp()))::bigint END END,',
    "    'visible_long_transactions', (SELECT count(*) FROM pg_stat_activity",
    '         WHERE datname = current_database() AND pid <> pg_backend_pid()',
    "           AND xact_start < statement_timestamp() - interval '60 seconds'),",
    "    'tables', coalesce((SELECT json_agg(observed ORDER BY schema, \"table\") FROM observed), '[]'::json)",
    ');',
    'ROLLBACK;'
  ].join('\n');
}

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
function count(value, label) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) throw new InputError('Snapshot: invalid ' + label + '.');
  return value;
}

export function readSnapshot(raw, targets) {
  if (!raw) return null;
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new InputError('Snapshot must be the single JSON cell from the capture query, without psql headers.'); }
  if (!isObject(data) || data.version !== 1 || !Array.isArray(data.tables) ||
      data.tables.length > limits.targets || !['primary', 'replica'].includes(data.role) ||
      typeof data.captured_at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(data.captured_at) ||
      !Number.isFinite(Date.parse(data.captured_at)))
    throw new InputError('Snapshot schema is invalid. Use JSON produced by the capture query.');
  const expected = new Set(targets.map(keyOf)), seen = new Set();
  const tables = data.tables.map(row => {
    if (!isObject(row) || typeof row.schema !== 'string' || typeof row.table !== 'string')
      throw new InputError('Snapshot contains an invalid relation.');
    const { schema, table, kind } = row, key = keyOf(row);
    if (!expected.has(key) || seen.has(key)) throw new InputError('Snapshot relations do not match this migration. Regenerate the capture query.');
    seen.add(key);
    if (![null, 'r', 'p', 'm', 'f', 'v'].includes(kind)) throw new InputError('Snapshot contains an unknown relation kind.');
    const bytes = count(row.bytes, 'size'), rows = count(row.rows_estimate, 'row estimate');
    const indexes = count(row.indexes, 'index count'), invalid = count(row.invalid_indexes, 'invalid index count');
    if ((kind === null && [bytes, rows, indexes, invalid].some(value => value !== null)) ||
        (kind !== null && (indexes === null || invalid === null || invalid > indexes)))
      throw new InputError('Snapshot contains inconsistent relation statistics.');
    return { schema, table, kind, bytes, rows, indexes, invalid };
  });
  const lastReplay = count(data.last_replay_age_seconds, 'last replay age');
  const longTransactions = count(data.visible_long_transactions, 'visible transaction count');
  if (data.role === 'primary' && lastReplay !== null) throw new InputError('Snapshot: primary cannot have standby replay age.');
  return { role: data.role, capturedAt: new Date(data.captured_at).toISOString(), lastReplay, longTransactions, tables };
}

export async function draft(input) {
  if (!isObject(input)) throw new InputError('Send a JSON object.');
  const title = field(input.title, 'Review title', limits.title, true);
  const sql = field(input.sql, 'Migration SQL', limits.sql, true);
  const analysis = await inspect(sql);
  const snapshot = readSnapshot(field(input.snapshot ?? '', 'Snapshot', limits.snapshot), analysis.targets);
  const context = Object.fromEntries(Object.entries(contextFields).map(([key, label]) =>
    [key, field(input.context?.[key] ?? '', label, limits.note)]));
  const sourceNotes = input.decisions ?? {};
  if (!isObject(sourceNotes)) throw new InputError('Decisions must be a JSON object.');
  const gates = analysis.findings.map(({ id, kind, ...finding }) => {
    const [label, order, verify, pause] = patterns[kind];
    return { id, kind, label, ...finding, order, verify, pause, decision: field(sourceNotes[id] ?? '', 'Team decision', limits.note) };
  });
  const notices = [...analysis.notices];
  if (!snapshot) notices.push('No database snapshot supplied. Operational evidence is unknown.');
  if (snapshot) {
    const age = Date.now() - Date.parse(snapshot.capturedAt);
    if (age > 86400000 || age < -300000) notices.push('Snapshot timestamp is stale or ahead of this machine. Refresh or document why it applies.');
    if (analysis.targets.length > snapshot.tables.length || snapshot.tables.some(t => !t.kind))
      notices.push('Some target relations were not found or not included. Verify environment, search_path and planned new tables.');
    if (snapshot.tables.some(t => t.kind === 'p'))
      notices.push('Partition parent sizes and estimates do not roll up child partitions. Inspect relevant partitions separately.');
    if (snapshot.tables.some(t => t.invalid > 0)) notices.push('Snapshot reports invalid or not-ready indexes. Investigate before using any index as rollout evidence.');
    if (snapshot.tables.some(t => t.bytes >= 1024 ** 3 || t.rows >= 1_000_000))
      notices.push('At least one reported relation is ≥1 GiB or estimated at ≥1M rows. Rehearse the applicable lock/data work on representative shape; this is not a runtime estimate.');
    if (snapshot.longTransactions > 0) notices.push('Long transactions were visible during capture. Recheck activity at rollout against your lock budget.');
    if (snapshot.role === 'replica') notices.push('Standby replay age is not transport or apply lag; it can rise when the primary is idle. This snapshot cannot establish primary activity or replica health.');
  }
  const unanswered = Object.entries(contextFields).filter(([key]) => !context[key]).map(([, label]) => label);
  return { title, sql, snapshot, context, gates, notices, unanswered, uncovered: analysis.uncovered, control: analysis.control };
}

const literalText = text => String(text).split(/\r\n|[\n\r\u000b\u000c\u0085\u2028\u2029]/u).map(line => '    ' + line).join('\n');
const displayValue = n => n === null ? 'unknown' : String(n);

export function markdown(plan) {
  const lines = ['# PostgreSQL rollout review', '', literalText(plan.title), '',
    '**Draft for human review — not deployment approval.**', '', '## Release context', ''];
  for (const [key, label] of Object.entries(contextFields)) {
    lines.push('### ' + label, '', plan.context[key] ? literalText(plan.context[key]) : '_Unanswered_', '');
  }
  lines.push('## Database evidence', '');
  if (plan.snapshot) {
    const { role, capturedAt, lastReplay, longTransactions, tables } = plan.snapshot;
    lines.push('- Capture: ' + capturedAt + ' (' + role + ')',
      '- Last replay age (seconds; not lag): ' + displayValue(lastReplay),
      '- Visible transactions older than 60s: ' + displayValue(longTransactions) + ' (role visibility limited)', '');
    for (const t of tables) lines.push(literalText(display(t) + ': ' +
      (t.kind ? 'kind ' + t.kind + '; size ' + displayValue(t.bytes) + ' bytes; estimated rows ' + displayValue(t.rows) +
        '; indexes ' + displayValue(t.indexes) + '; invalid/not ready ' + displayValue(t.invalid) : 'not found')), '');
  } else lines.push('_No snapshot supplied._', '');
  for (const note of plan.notices) lines.push('- ' + note);
  lines.push('', '## Rollout decisions', '');
  if (plan.control) lines.push('No material rollout pattern identified in these literal controls or comments. Verify the complete deploy bundle.', '');
  else if (!plan.gates.length) lines.push('No supported pattern identified. Manual review is required.', '');
  for (const g of plan.gates) {
    lines.push('### ' + g.label + ' · statement ' + g.statement, '');
    if (g.target) lines.push(literalText(g.target), '');
    if (g.note) lines.push(g.note, '');
    lines.push('- **Proposed sequence:** ' + g.order, '- **Verify:** ' + g.verify, '- **Pause if:** ' + g.pause,
      '- **Team decision:** ' + (g.decision ? 'recorded below' : '_Unanswered_'), '');
    if (g.decision) lines.push(literalText(g.decision), '');
  }
  if (plan.uncovered.length) lines.push('## Manual review', '', ...plan.uncovered.map(x => '- ' + x), '');
  lines.push('## Migration SQL', '', literalText(plan.sql), '');
  return lines.join('\n');
}
