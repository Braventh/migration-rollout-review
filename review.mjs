import { parse } from 'pgsql-parser';
import { createHash } from 'node:crypto';

export class InputError extends Error {
  constructor(message, field) { super(message); this.field = field; }
}
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
  drop: ['Destructive removal', 'Separate the destructive step from dependent changes. For data removal, review its scope and recovery before execution.', 'Check dependencies, clients, jobs, retention and backups. Rehearse recovery and verify the affected rows or objects.', 'Any reachable consumer still needs the old shape or data, or the scope and recovery are unproven.'],
  index: ['Index build', 'Keep dependent flags off until an applicable build and representative plan meet the latency objective.', 'Check the actual runner transaction boundary, lock budget and resulting usable index and query plan.', 'The runner cannot execute the selected build, the index is invalid, or performance evidence is missing.'],
  enum: ['Enum compatibility', 'Separate database acceptance, consumer readiness and first emission of the new value.', 'Replay persisted values through workers, webhooks and eligible recovery builds.', 'A reachable consumer rejects the value; turning a flag off does not remove stored values.'],
  type: ['Type change', 'Keep a compatible representation while copying, reconciling and switching; decide the legacy representability cap.', 'Exercise client/SDK serialization, JSON and boundary values, conversion and recovery.', 'Legacy range, conversion or rollback behavior has not been proven.'],
  fk: ['Foreign key', 'Make writers compatible before any enforcement and reconcile historical data before validation.', 'Replay the importer and recovery version. NOT VALID skips the historical scan, not enforcement on new writes for an enforced foreign key.', 'Child-before-parent writes or unresolved historical orphans remain.'],
  rewrite: ['Table rewrite', 'Plan table work separately from the application cutover and rehearse on representative data.', 'Check whether the column will actually be added, table and index size, disk headroom, locks and recovery.', 'The rewrite or its blocking window does not fit the measured rollout budget.'],
  constraint: ['Constraint lifecycle', 'Separate application compatibility, enforcement, historical validation and any later removal.', 'Check the constraint definition and existing rows on the actual target; confirm the runner boundaries.', 'Relevant writes or historical rows do not meet the constraint, or enforcement changes are not coordinated.'],
  backfill: ['Data backfill candidate', 'Choose source of truth, batching, restart behavior and concurrent edit policy; reconcile before cutover.', 'Race a resumed batch with a live writer; compare stale non-null values as well as missing values.', 'Retries can overwrite newer data or parity and operational limits are not met.'],
  split: ['Possible table split', 'Expand separately, sync and reconcile, switch apps and workers, then retire old storage in a separate release.', 'Rehearse retry replay/drain, verify parity and confirm the recovery window has closed.', 'Retries or eligible recovery builds still require old storage, or data differs.']
};
const names = xs => (xs ?? []).map(x => x.String?.sval).filter(x => x !== undefined);
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const keyOf = r => JSON.stringify([r.schema, r.table]);
const display = r => [r.catalog, r.schema, r.table].filter(x => x != null).map(quote).join('.');
const same = (a, b) => a?.schema && b?.schema && keyOf(a) === keyOf(b);
const isLiteral = node => Boolean(node?.A_Const);
const defaultPath = { schema: 'public', assumed: true };
const unknownPath = { schema: null, assumed: false };
const tableObjects = new Set(['OBJECT_TABLE', 'OBJECT_VIEW', 'OBJECT_MATVIEW', 'OBJECT_FOREIGN_TABLE']);
const isUnbounded = where => !where || where.A_Const?.boolval?.boolval === true;
const cascade = node => node.behavior === 'DROP_CASCADE' ? ' CASCADE may remove dependent objects or data.' : '';
const ctes = node => (node?.withClause?.ctes ?? []).map(x => x.CommonTableExpr);
const stringValue = node => node?.A_Const?.sval?.sval;
const volatileDefaults = new Set(['clock_timestamp', 'random', 'gen_random_uuid', 'nextval', 'setval', 'timeofday']);
const serialTypes = new Set(['serial', 'serial2', 'serial4', 'serial8', 'smallserial', 'bigserial']);
const timeouts = new Set(['lock_timeout', 'statement_timeout']);
const lockQueue = 'Waiting for a conflicting lock can queue later traffic. Rehearse a bounded lock_timeout and a controlled retry; verify the setting in the migration session.';
const strongAlter = new Set(['AT_AddColumn', 'AT_SetNotNull', 'AT_DropColumn', 'AT_AlterColumnType', 'AT_DropConstraint']);
const lockNotes = {
  exclusive: 'ACCESS EXCLUSIVE conflicts with ordinary reads and writes.',
  share: 'A regular index build takes SHARE, which conflicts with writes.'
};
const executionCaveat = 'Execution scope is unknown. Findings describe pasted SQL, not confirmed forward execution. Paste the exact forward SQL after runner filtering or template expansion, and confirm how the runner groups statements.';

function executionNotes(sql, statements) {
  const notes = [executionCaveat];
  if (/^[ \t]*--[ \t]*\+goose[ \t]+(?:up|down)\b/im.test(sql))
    notes.push('Possible Goose direction markers: both sections are analyzed as pasted. A Down statement is not necessarily part of the forward rollout.');
  if (/^[ \t]*--[ \t]*postgres-migrations[ \t]+ignore\b/im.test(sql))
    notes.push('Possible runner ignore directive: the runner may skip this file entirely.');
  if (/^[ \t]*--[ \t]*(?:\+goose[ \t]+no[ \t]+transaction|postgres-migrations[ \t]+disable-transaction)\b/im.test(sql))
    notes.push('Possible runner transaction directive: confirm runner support and the effective transaction boundaries.');
  if (statements > 1)
    notes.push('If the runner sends multiple statements in one PostgreSQL simple query or wraps them together, locks can span statements and concurrent operations may fail even without explicit BEGIN.');
  return notes;
}

function defaultKind(value) {
  if (!value || value.A_Const?.isnull) return 'missing';
  if (value.A_Const) return 'literal';
  return [...walk(value)].some(part => {
    const fn = names(part.FuncCall?.funcname);
    return volatileDefaults.has(fn.at(-1)) && (fn.length === 1 || fn.at(-2) === 'pg_catalog');
  }) ? 'volatile' : 'expression';
}

function sourceRanges(from, visibleCtes = []) {
  const references = [];
  const visit = (nodes, known) => {
    for (const node of nodes ?? []) {
      if (node.RangeVar && (node.RangeVar.schemaname || !known.includes(node.RangeVar.relname))) references.push(node.RangeVar);
      if (node.JoinExpr) visit([node.JoinExpr.larg, node.JoinExpr.rarg], known);
      if (node.RangeSubselect?.subquery?.SelectStmt) {
        const sub = node.RangeSubselect.subquery.SelectStmt;
        visit(sub.fromClause, known.concat(ctes(sub).map(x => x.ctename)));
      }
    }
  };
  visit(from, visibleCtes);
  return references;
}

function* walk(root) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    yield node;
    stack.push(...Object.values(node));
  }
}

export async function inspect(input) {
  const sql = field(input, 'Migration SQL', limits.sql, true, 'sql');
  let stmts;
  try { ({ stmts } = await parse(sql)); }
  catch (error) { throw new InputError('PostgreSQL could not parse this SQL: ' + String(error.message).slice(0, 200) +
    '. If your runner transforms the file, paste its rendered forward SQL.', 'sql'); }
  stmts ??= [];
  if (stmts.length > 100) throw new InputError('Review up to 100 statements at a time.', 'sql');
  const sqlFingerprint = createHash('sha256')
    .update(JSON.stringify(stmts.map(({ stmt }) => stmt),
      (key, value) => key === 'location' || key === 'arg_location' ? undefined : value))
    .digest('hex');

  const relations = new Map(), findings = [], uncovered = [], notices = [];
  const created = [], removed = [], copies = [], requiredWithoutDefault = [];
  let unqualified = false, ambiguous = false, outsideCapture = false;
  let sessionPath = defaultPath, localPath = null, transaction = null;
  const temporary = new Set(), partitionParents = new Set(), concurrentIndexes = [];
  const fromRange = r => {
    if (!r?.relname) return null;
    const path = localPath ?? sessionPath;
    const schema = r.schemaname ?? path.schema;
    const excluded = Boolean(r.catalogname) || r.relpersistence === 't' || schema === 'pg_temp' ||
      (!r.schemaname && temporary.has(r.relname));
    return { schema, table: r.relname, catalog: r.catalogname, excluded, assumed: !r.schemaname && path.assumed };
  };
  const fromNames = xs => fromRange({ relname: xs.at(-1), schemaname: xs.at(-2), catalogname: xs.at(-3) });
  const add = r => {
    if (!r) return;
    if (r.excluded) { outsideCapture = true; return; }
    if (!r.schema) { ambiguous = true; return; }
    if (r.assumed) unqualified = true;
    relations.set(keyOf(r), { schema: r.schema, table: r.table });
  };
  const lockNotices = [], justCreated = new Set();
  let standardGates = 0, supplementalGates = 0;
  const flag = (kind, index, r, item = '', note = '', details = {}) => {
    const ordinal = ['rewrite', 'constraint'].includes(kind) ? 'extra-' + supplementalGates++ : standardGates++;
    findings.push({ id: kind + '-' + index + '-' + ordinal, kind, statement: index, confidence: 'static inference',
      target: [r && display(r), item].filter(Boolean).join(' · '), note, ...details });
  };
  const begin = () => ({ startPath: sessionPath, enums: new Set(), lock: null, reportedLockSpan: false });

  for (const [i, { stmt }] of stmts.entries()) {
    const [type, node] = Object.entries(stmt)[0];
    const index = i + 1;
    const isTableRelation = (type !== 'AlterTableStmt' || tableObjects.has(node.objtype)) &&
      (type !== 'RenameStmt' || ['OBJECT_COLUMN', 'OBJECT_TABLE'].includes(node.renameType)) &&
      (type !== 'ReindexStmt' || node.kind === 'REINDEX_OBJECT_TABLE');
    const r = isTableRelation ? fromRange(node.relation) : null;
    const unknown = detail => uncovered.push('Statement ' + index + ': ' + detail);
    if (!['CreateStmt', 'IndexStmt'].includes(type)) justCreated.clear();
    const work = ['UpdateStmt', 'InsertStmt', 'DeleteStmt', 'MergeStmt', 'IndexStmt', 'ReindexStmt'].includes(type) ||
      (type === 'AlterTableStmt' && node.cmds.some(x => x.AlterTableCmd?.subtype === 'AT_ValidateConstraint')) ||
      ctes(node).some(x => ['UpdateStmt', 'InsertStmt', 'DeleteStmt', 'MergeStmt'].some(k => x.ctequery?.[k]));
    if (work && transaction?.lock && !transaction.reportedLockSpan) {
      const { statement, mode } = transaction.lock;
      lockNotices.push('Statement ' + statement + ' → ' + index + ': A prior ' + mode +
        ' lock can be held through this later data or index work until the transaction ends. Split the operations across commits where correctness permits.');
      transaction.reportedLockSpan = true;
    }
    const strongLock = (mode, label) => {
      if (transaction && !transaction.lock) transaction.lock = { statement: index, mode };
      lockNotices.push('Statement ' + index + ': ' + label + ' ' + lockQueue);
    };
    add(r);
    const fk = (c, name) => {
      add(fromRange(c.pktable));
      flag('fk', index, r, c.conname ?? name ?? '', !c.is_enforced ? 'The SQL does not request enforcement. Check target-version support.' :
        c.skip_validation ? 'Historical validation is deferred; new writes are still checked.' : '', {
        behavior: c.is_enforced ? 'Standalone ADD FOREIGN KEY takes SHARE ROW EXCLUSIVE on both tables.' : undefined
      });
    };
    const concurrent = operation => {
      if (transaction) notices.push('Statement ' + index + ': ' + operation + ' cannot run inside a transaction block.');
    };
    const deletion = (node, inCte = false) => {
      const relation = fromRange(node.relation);
      add(relation);
      sourceRanges(node.usingClause, ctes(node).map(x => x.ctename)).map(fromRange).forEach(add);
      flag('drop', index, relation, inCte ? 'DELETE in a CTE' : 'DELETE',
        isUnbounded(node.whereClause) ? 'No restrictive WHERE clause; DELETE can remove every row.' : 'Verify the DELETE predicate and affected rows.');
    };
    if (transaction?.enums.size && type !== 'AlterEnumStmt') {
      const used = new Set();
      for (const part of walk(node)) {
        const value = stringValue(part);
        if (transaction.enums.has(value)) used.add(value);
      }
      if (used.size) notices.push('Statement ' + index +
        ': A string literal matches an enum value added earlier in this transaction. If used as that enum value, commit the enum change first.');
    }
    let modifiesCte = false;
    if (['InsertStmt', 'UpdateStmt', 'DeleteStmt', 'SelectStmt', 'MergeStmt'].includes(type)) {
      for (const part of walk(node)) {
        const query = part.CommonTableExpr?.ctequery;
        if (query?.DeleteStmt) { deletion(query.DeleteStmt, true); modifiesCte = true; }
        if (query?.UpdateStmt || query?.InsertStmt || query?.MergeStmt) {
          const target = fromRange((query.UpdateStmt ?? query.InsertStmt ?? query.MergeStmt).relation);
          add(target);
          flag('backfill', index, target, 'Write in a CTE', 'Review nested data mutations and retry behavior.');
          modifiesCte = true;
        }
      }
    }
    switch (type) {
      case 'TransactionStmt':
        if (['TRANS_STMT_BEGIN', 'TRANS_STMT_START'].includes(node.kind)) {
          transaction ??= begin();
        } else if (['TRANS_STMT_COMMIT', 'TRANS_STMT_ROLLBACK'].includes(node.kind)) {
          if (transaction && node.kind === 'TRANS_STMT_ROLLBACK') sessionPath = transaction.startPath;
          transaction = node.chain ? begin() : null;
          localPath = null;
        } else {
          if (node.kind === 'TRANS_STMT_ROLLBACK_TO') localPath = unknownPath;
          unknown('Review savepoints and nonstandard transaction boundaries manually.');
        }
        break;
      case 'VariableSetStmt':
        if (node.name === 'search_path' || node.kind === 'VAR_RESET_ALL') {
          const values = (node.args ?? []).map(stringValue);
          const next = node.kind !== 'VAR_SET_VALUE' ? defaultPath
            : values.length === 1 && values[0] && !['$user', 'pg_temp'].includes(values[0]) && !values[0].includes(',')
              ? { schema: values[0], assumed: false } : unknownPath;
          if (node.is_local) {
            if (!transaction) {
              localPath = unknownPath;
              unknown('SET LOCAL search_path depends on the runner transaction; qualify unqualified relations.');
            } else localPath = next;
          } else {
            sessionPath = next;
            localPath = null;
          }
        } else if (timeouts.has(node.name)) {
          notices.push('Statement ' + index + ': ' + node.name + ' adjustment is present in the SQL. ' +
            (node.is_local ? 'SET LOCAL only applies in the current transaction. ' : '') +
            'Verify the effective value and scope with the runner; the setting may be disabled, reset or not reach the DDL.');
        } else unknown('Session setting other than search_path; verify it with the runner.');
        break;
      case 'AlterTableStmt':
        if (!r) { unknown('This ALTER targets a non-table object; verify its dependencies manually.'); break; }
        if (node.objtype === 'OBJECT_TABLE' && node.cmds.some(({ AlterTableCmd: cmd }) =>
          strongAlter.has(cmd.subtype) || (cmd.subtype === 'AT_AddConstraint' &&
            ['CONSTR_PRIMARY', 'CONSTR_UNIQUE', 'CONSTR_CHECK', 'CONSTR_NOTNULL'].includes(cmd.def?.Constraint?.contype))))
          strongLock('ACCESS EXCLUSIVE', lockNotes.exclusive);
        for (const { AlterTableCmd: cmd } of node.cmds) {
          const col = cmd.def?.ColumnDef, c = cmd.def?.Constraint, name = cmd.name ?? col?.colname;
          const constraints = (col?.constraints ?? []).map(x => x.Constraint).filter(Boolean);
          if (cmd.subtype === 'AT_AddColumn') {
            const value = constraints.find(c => c.contype === 'CONSTR_DEFAULT')?.raw_expr;
            const kind = defaultKind(value);
            const typeNames = names(col?.typeName?.names);
            const serial = typeNames.length === 1 && serialTypes.has(typeNames[0]) && !col.typeName.arrayBounds?.length;
            const generated = constraints.find(c => c.contype === 'CONSTR_GENERATED');
            const identity = constraints.some(c => c.contype === 'CONSTR_IDENTITY');
            const rewriteCause = serial ? 'Serial adds a sequence-backed default.' :
              identity ? 'Adding an identity column initializes a sequence-backed value for existing rows.' :
                generated?.generated_kind === 's' ? 'PostgreSQL computes stored generated values for existing rows.' :
                  kind === 'volatile' ? 'The recognized DEFAULT requires a rewrite if it resolves to the standard volatile function.' : '';
            if (generated && generated.generated_kind !== 's')
              unknown('Confirm generated column storage mode and target PostgreSQL version; VIRTUAL is supported from PostgreSQL 18.');
            if (constraints.some(c => c.contype === 'CONSTR_NOTNULL' || c.contype === 'CONSTR_PRIMARY')) {
              let note;
              if (rewriteCause || generated) {
                note = 'Verify the generated value and any required constraint, including compatibility with existing writers.';
              } else if (kind === 'missing') {
                note = 'No non-null default is supplied. Adding this NOT NULL column fails if the table has existing rows.';
                if (r?.schema && !r.excluded) requiredWithoutDefault.push({ index, target: { schema: r.schema, table: r.table } });
              } else if (kind === 'literal') {
                note = 'Literal non-null DEFAULT: PostgreSQL 11+ can add the column without a table rewrite for this default. Still review locking and compatibility.';
              } else note = 'DEFAULT is an expression. Verify its volatility and rewrite behavior with the database owner before rollout.';
              if (kind === 'volatile') note += ' A recognized volatile DEFAULT can require a full table rewrite.';
              flag('required', index, r, name, note);
            }
            if (rewriteCause) flag('rewrite', index, r, name,
              rewriteCause + (cmd.missing_ok ? ' If the column already exists, IF NOT EXISTS skips the addition.' : ''),
              kind === 'volatile' && !serial && !identity && !generated ? {} : {
                behavior: 'Adding this column to a populated regular table rewrites it on tested PostgreSQL 12, 14, 16, 17 and 18. This does not establish runtime or production state.'
              });
            for (const c of constraints.filter(x => x.contype === 'CONSTR_FOREIGN')) fk(c, name);
            if (constraints.some(c => ['CONSTR_PRIMARY', 'CONSTR_UNIQUE'].includes(c.contype)))
              flag('index', index, r, name, 'This constraint can build an index.');
            if (kind === 'expression' || constraints.some(c => !['CONSTR_NOTNULL', 'CONSTR_NULL', 'CONSTR_FOREIGN',
              'CONSTR_PRIMARY', 'CONSTR_UNIQUE', 'CONSTR_DEFAULT', 'CONSTR_IDENTITY', 'CONSTR_GENERATED'].includes(c.contype)))
              unknown('ADD COLUMN has additional constraints or defaults outside the rules.');
          } else if (cmd.subtype === 'AT_SetNotNull') flag('required', index, r, name,
            'On PostgreSQL 12+, a valid CHECK that proves non-nullness can avoid the SET NOT NULL scan. Keep the CHECK in place during this step.', {
              behavior: 'SET NOT NULL normally scans under ACCESS EXCLUSIVE unless PostgreSQL can prove the column already contains no NULLs.'
            });
          else if (cmd.subtype === 'AT_DropColumn') { flag('drop', index, r, name, cascade(cmd).trim()); removed.push(r); }
          else if (cmd.subtype === 'AT_AlterColumnType') flag('type', index, r, name);
          else if (cmd.subtype === 'AT_AddConstraint' && c?.contype === 'CONSTR_FOREIGN') fk(c, name);
          else if (cmd.subtype === 'AT_AddConstraint' && c?.contype === 'CONSTR_CHECK' && c.skip_validation)
            flag('constraint', index, r, c.conname, c.is_enforced
              ? 'CHECK NOT VALID enforces the check for new or updated rows without checking historical rows yet.'
              : 'The CHECK is not enforced. Confirm support on the target PostgreSQL version.');
          else if (cmd.subtype === 'AT_ValidateConstraint')
            flag('constraint', index, r, name, 'Confirm the constraint kind and whether it is already valid. Keep validation separate from stronger DDL locks.', {
              behavior: 'Standalone validation of an enforced NOT VALID CHECK or foreign key checks existing rows under SHARE UPDATE EXCLUSIVE. Foreign key validation also takes ROW SHARE on the referenced table.'
            });
          else if (cmd.subtype === 'AT_DropConstraint')
            flag('constraint', index, r, name, 'This can remove enforcement or supporting objects. Verify the constraint kind and dependencies; confirm IF EXISTS does not skip it.' + cascade(cmd));
          else if (cmd.subtype === 'AT_AddConstraint' && ['CONSTR_PRIMARY', 'CONSTR_UNIQUE'].includes(c?.contype))
            flag('index', index, r, c.conname, 'This constraint can build an index unless it uses an existing one.');
          else if (['AT_AttachPartition', 'AT_DetachPartition'].includes(cmd.subtype)) {
            const partition = cmd.def?.PartitionCmd;
            add(fromRange(partition?.name));
            if (partition?.concurrent) concurrent('DETACH PARTITION CONCURRENTLY');
            unknown('Review partition bounds, locks and runner behavior manually.');
          }
          else unknown(cmd.subtype + ' is outside the rules; review manually.');
        }
        break;
      case 'RenameStmt':
        if (r && ['OBJECT_COLUMN', 'OBJECT_TABLE'].includes(node.renameType))
          flag('rename', index, r, [node.subname, node.newname].filter(Boolean).join(' → '));
        else unknown('Unsupported rename; review manually.');
        break;
      case 'DropStmt':
        if (tableObjects.has(node.removeType)) {
          for (const x of node.objects) {
            const victim = fromNames(names(x.List?.items)); add(victim);
            if (node.removeType === 'OBJECT_TABLE') removed.push(victim);
            flag('drop', index, victim, '', cascade(node).trim());
          }
        } else if (['OBJECT_SCHEMA', 'OBJECT_TYPE', 'OBJECT_INDEX'].includes(node.removeType) || node.behavior === 'DROP_CASCADE') {
          const label = node.removeType.replace('OBJECT_', '').replaceAll('_', ' ');
          const note = 'Review the affected object and dependent objects separately.' + cascade(node);
          for (const object of node.objects) {
            const parts = names(object.List?.items ?? object.TypeName?.names ?? [object]);
            flag('drop', index, null, [label, parts.map(quote).join('.')].filter(Boolean).join(' '), note);
          }
          if (node.concurrent) concurrent('DROP INDEX CONCURRENTLY');
        } else unknown('Unsupported DROP object; review manually.');
        break;
      case 'TruncateStmt':
        for (const entry of node.relations) {
          const target = fromRange(entry.RangeVar);
          add(target);
          flag('drop', index, target, 'TRUNCATE', 'TRUNCATE removes all rows.' + cascade(node));
        }
        break;
      case 'DeleteStmt':
        deletion(node);
        break;
      case 'ReindexStmt':
        if (node.params?.some(x => x.DefElem.defname === 'concurrently' && x.DefElem.arg?.Boolean?.boolval !== false))
          concurrent('REINDEX CONCURRENTLY');
        flag('index', index, r, r ? '' : [node.relation?.schemaname, node.relation?.relname, node.name].filter(Boolean).map(quote).join('.'),
          'Verify which indexes are rebuilt and how the runner executes REINDEX.');
        break;
      case 'IndexStmt': {
        const newTarget = r?.schema && !r.excluded && justCreated.has(keyOf(r));
        if (node.concurrent) {
          concurrent('CREATE INDEX CONCURRENTLY');
          if (r?.schema && !r.excluded) {
            if (partitionParents.has(keyOf(r))) notices.push(partitionIndexNotice(index));
            else concurrentIndexes.push({ index, target: { schema: r.schema, table: r.table } });
          }
        }
        if (!node.concurrent && !newTarget) strongLock('SHARE', lockNotes.share);
        flag('index', index, r, node.idxname, node.concurrent
          ? 'CONCURRENTLY is requested; confirm the runner does not wrap it in a transaction.' +
            (node.if_not_exists ? ' IF NOT EXISTS can skip an existing invalid index; verify the resulting index is usable.' : '')
          : newTarget ? 'If the earlier CREATE TABLE ran as pasted, this build targets a new table rather than blocking pre-existing writers. Check when the table becomes visible to clients.'
          : 'CONCURRENTLY is not requested; review blocked writes with the database owner.');
        break;
      }
      case 'AlterEnumStmt':
        if (!node.oldVal) transaction?.enums.add(node.newVal);
        flag('enum', index, null, names(node.typeName).map(quote).join('.') + ' · ' + [node.oldVal, node.newVal].filter(x => x != null).join(' → '),
          node.oldVal ? 'Renaming an existing value also breaks consumers that still use its old spelling.' : '');
        break;
      case 'UpdateStmt':
        sourceRanges(node.fromClause, ctes(node).map(x => x.ctename)).map(fromRange).forEach(add);
        flag('backfill', index, r, '', isUnbounded(node.whereClause) ? 'No restrictive WHERE clause in the update.' : '');
        if (node.withClause) unknown('Nested CTE effects are not analyzed.');
        break;
      case 'CreateStmt':
        if (node.relation?.relpersistence === 't') temporary.add(node.relation.relname);
        else {
          created.push(r);
          if (r?.schema && !r.excluded && !node.if_not_exists && !node.partspec && !node.partbound && !node.inhRelations?.length)
            justCreated.add(keyOf(r));
          if (node.partspec && r?.schema && !r.excluded) partitionParents.add(keyOf(r));
        }
        node.inhRelations?.map(x => fromRange(x.RangeVar)).forEach(add);
        unknown('Review new table constraints and dependencies separately.');
        break;
      case 'InsertStmt': {
        const select = node.selectStmt?.SelectStmt;
        const sources = sourceRanges(select?.fromClause, [...ctes(node), ...ctes(select)].map(x => x.ctename)).map(fromRange);
        sources.forEach(add);
        if (select?.fromClause?.length) {
          flag('backfill', index, r, '', 'INSERT … SELECT moves query results into the target; confirm the source and intended scope.');
          copies.push({ target: r, sources, index });
        } else unknown('INSERT effects are outside the rules.');
        if (node.withClause || node.selectStmt?.SelectStmt?.withClause) unknown('Nested CTE effects are not analyzed.');
        break;
      }
      case 'DoStmt':
      case 'CreateFunctionStmt':
        unknown('Opaque procedural block or routine body. It may contain hidden DDL or data changes; review the body manually before rollout.');
        break;
      case 'SelectStmt':
        if (Object.keys(node).every(key => ['targetList', 'limitOption', 'op'].includes(key)) &&
            node.targetList?.length && node.targetList.every(t => isLiteral(t.ResTarget?.val))) break;
        unknown('Only simple literal SELECT statements are treated as controls.');
        break;
      default:
        unknown(type + ' is outside the rules; review manually.');
    }
    if (modifiesCte) unknown('The captured CTE writes are not a complete analysis; verify other CTE dependencies and behavior manually.');
  }
  for (const { target, sources, index } of copies) {
    if (created.some(x => same(x, target)) && sources.some(x => removed.some(y => same(x, y))))
      flag('split', index, target, '', 'New table, copy from old storage, and destructive change to the source occur in one bundle.');
  }
  if (unqualified) notices.push('Snapshot lookup uses public for unqualified relations. Verify that matches the migration runner search_path or schema-qualify the migration in this review.');
  if (ambiguous) notices.push('Snapshot excludes unqualified relations affected by an ambiguous search_path. Schema-qualify those names or verify them in the migration session.');
  if (outsideCapture) notices.push('Snapshot excludes temporary and database-qualified relations. Verify them in the intended session and database.');
  if (relations.size > limits.targets) notices.push('Snapshot covers only the first ' + limits.targets + ' distinct relations; split the review for coverage of additional relations.');
  const targets = [...relations.values()].slice(0, limits.targets);
  const control = !findings.length && !uncovered.length && !notices.length &&
    stmts.every(({ stmt }) => Boolean(stmt.SelectStmt));
  return { targets, findings, uncovered, notices, lockNotices, execution: executionNotes(sql, stmts.length), sqlFingerprint, control, concurrentIndexes, requiredWithoutDefault,
    query: captureQuery(targets) };
}

export function field(input, label, max, required = false, fieldId) {
  if (typeof input !== 'string' || input.length > max || input.includes('\0'))
    throw new InputError(label + ' must be text of at most ' + max + ' characters, with no null bytes.', fieldId);
  const value = input.trim();
  if (required && !value) throw new InputError(label + ' is required.', fieldId);
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
const optionalText = value => value === undefined ? '' : value;
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
      data.tables.length > limits.targets || !['primary', 'replica'].includes(data.role))
    throw new InputError('Snapshot schema is invalid. Use JSON produced by the capture query.');
  const stamp = typeof data.captured_at === 'string'
    && /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.exec(data.captured_at);
  const calendar = stamp ? new Date(stamp[1] + 'Z') : new Date(NaN);
  const capturedAt = stamp ? new Date(data.captured_at) : new Date(NaN);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 19) !== stamp[1] ||
      !Number.isFinite(capturedAt.getTime()))
    throw new InputError('Snapshot captured_at must be a valid calendar date and time with a UTC offset.');
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
  if (data.synthetic !== undefined && typeof data.synthetic !== 'boolean')
    throw new InputError('Snapshot synthetic marker must be a boolean.');
  return { role: data.role, capturedAt: capturedAt.toISOString(), lastReplay, longTransactions, tables,
    ...(data.synthetic ? { synthetic: true } : {}) };
}

const snapshotAgeNotice = 'Snapshot timestamp is stale or ahead of this machine. Refresh or document why it applies.';
const partitionIndexNotice = index => 'Statement ' + index +
  ': PostgreSQL does not support CREATE INDEX CONCURRENTLY on a partitioned parent. Review building child indexes and attaching them separately.';

export function refreshSnapshotNotices(plan) {
  const notices = plan.notices.filter(notice => notice !== snapshotAgeNotice);
  let { snapshot } = plan;
  if (plan.snapshot) {
    const age = Date.now() - Date.parse(plan.snapshot.capturedAt);
    if (age > 86400000 || age < -300000) notices.push(snapshotAgeNotice);
    const table = snapshot.tables[0];
    if (snapshot.synthetic === undefined && snapshot.role === 'primary' && snapshot.longTransactions === 2 &&
        snapshot.tables.length === 1 && table.schema === 'billing' && table.table === 'invoices' && table.kind === 'r' &&
        table.bytes === 1342177280 && table.rows === 2450000 && table.indexes === 5 && table.invalid === 0)
      snapshot = { ...snapshot, synthetic: true };
  }
  return { ...plan, snapshot, notices, noticeLabels: notices.map(noticeConfidence), execution: plan.execution ?? [executionCaveat] };
}

export async function draft(input) {
  if (!isObject(input)) throw new InputError('Send a JSON object.');
  const title = field(input.title, 'Review title', limits.title, true, 'title');
  const sql = field(input.sql, 'Migration SQL', limits.sql, true, 'sql');
  const humanContext = input.context === undefined ? {} : input.context;
  if (!isObject(humanContext)) throw new InputError('Context must be a JSON object.');
  const sourceNotes = input.decisions === undefined ? {} : input.decisions;
  if (!isObject(sourceNotes)) throw new InputError('Decisions must be a JSON object.');
  const analysis = await inspect(sql);
  let snapshot;
  try {
    snapshot = readSnapshot(field(optionalText(input.snapshot), 'Snapshot', limits.snapshot), analysis.targets);
  } catch (error) {
    if (error instanceof InputError) throw new InputError(error.message, 'snapshot');
    throw error;
  }
  const context = Object.fromEntries(Object.entries(contextFields).map(([key, label]) =>
    [key, field(optionalText(humanContext[key]), label, limits.note, false, key)]));
  const notes = new Map(Object.entries(sourceNotes).map(([id, value]) => [id, field(value, 'Team decision', limits.note)]));
  const gates = analysis.findings.map(({ id, kind, ...finding }) => {
    const [label, order, verify, pause] = patterns[kind];
    return { id, kind, label, ...finding, order, verify, pause, decision: notes.get(id) ?? '' };
  });
  const notices = [...analysis.notices, ...analysis.lockNotices];
  if (!snapshot) notices.push('No database snapshot supplied. Operational evidence is unknown.');
  if (snapshot) {
    if (analysis.targets.length > snapshot.tables.length || snapshot.tables.some(t => !t.kind))
      notices.push('Some target relations were not found or not included. Verify environment, search_path and planned new tables.');
    if (snapshot.tables.some(t => t.kind === 'p'))
      notices.push('Partition parent sizes and estimates do not roll up child partitions. Inspect relevant partitions separately.');
    for (const { index, target } of analysis.concurrentIndexes)
      if (snapshot.tables.some(t => t.kind === 'p' && same(t, target)))
        notices.push(partitionIndexNotice(index));
    for (const { index, target } of analysis.requiredWithoutDefault) {
      const observed = snapshot.tables.find(t => same(t, target));
      if (observed?.rows > 0)
        notices.push('Statement ' + index + ': The target is estimated to contain ' + observed.rows +
          ' rows. Verify existing rows before adding a NOT NULL column without a non-null default; use a staged rollout.');
    }
    if (snapshot.tables.some(t => t.invalid > 0)) notices.push('Snapshot reports invalid or not-ready indexes. Investigate before using any index as rollout evidence.');
    if (snapshot.tables.some(t => t.bytes >= 1024 ** 3 || t.rows >= 1_000_000))
      notices.push('At least one reported relation is ≥1 GiB or estimated at ≥1M rows. Rehearse the applicable lock/data work on representative shape; this is not a runtime estimate.');
    if (snapshot.longTransactions > 0) notices.push('Long transactions were visible during capture. Recheck activity at rollout against your lock budget.');
    if (snapshot.role === 'replica') notices.push('Standby replay age is not transport or apply lag; it can rise when the primary is idle. This snapshot cannot establish primary activity or replica health.');
  }
  const unanswered = Object.entries(contextFields).filter(([key]) => !context[key]).map(([, label]) => label);
  return refreshSnapshotNotices({ title, sql, snapshot, context, gates, notices, unanswered, gateVersion: 1, sqlFingerprint: analysis.sqlFingerprint,
    uncovered: analysis.uncovered, control: analysis.control, execution: analysis.execution });
}

function noticeConfidence(note) {
  if (/estimated to contain|is ≥1 GiB or estimated at/.test(note)) return 'Heuristic estimate';
  if (/No database snapshot|not found or not included|timestamp is stale/.test(note)) return 'Unknown';
  return 'Static inference';
}

const literalText = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .split(/\r\n|[\n\r\u000b\u000c\u0085\u2028\u2029]/u).map(line => '    ' + line).join('\n');
const displayValue = n => n === null ? 'unknown' : String(n);

export function markdown(plan) {
  const lines = ['# PostgreSQL rollout review', '', literalText(plan.title), '',
    '**Draft for human review — not deployment approval.**', '', '## Execution scope (unknown)', '',
    ...(plan.execution ?? [executionCaveat]).map(note => '- ' + note), '', '## Release context', ''];
  for (const [key, label] of Object.entries(contextFields)) {
    lines.push('### ' + label, '', plan.context[key] ? literalText(plan.context[key]) : '_Unanswered_', '');
  }
  lines.push('## Database evidence', '');
  if (plan.snapshot) {
    const { role, capturedAt, lastReplay, longTransactions, tables, synthetic } = plan.snapshot;
    if (synthetic) lines.push('**Synthetic example evidence — not captured from a database.**', '');
    lines.push('- Capture: ' + capturedAt + ' (' + role + ')',
      '- Last replay age (seconds; not lag): ' + displayValue(lastReplay),
      '- Visible transactions older than 60s: ' + displayValue(longTransactions) + ' (role visibility limited)', '');
    for (const t of tables) lines.push(literalText(display(t) + ': ' +
      (t.kind ? 'kind ' + t.kind + '; size ' + displayValue(t.bytes) + ' bytes; estimated rows ' + displayValue(t.rows) + ' (heuristic)' +
        '; indexes ' + displayValue(t.indexes) + '; invalid/not ready ' + displayValue(t.invalid) : 'not found')), '');
  } else lines.push('_No snapshot supplied._', '');
  for (const note of plan.notices) lines.push('- **' + noticeConfidence(note) + ':** ' + note);
  lines.push('', '## Rollout decisions', '');
  if (plan.control) lines.push('No material rollout pattern identified in these literal controls or comments. Verify the complete deploy bundle.', '');
  else if (!plan.gates.length) lines.push('No supported pattern identified. Manual review is required.', '');
  for (const g of plan.gates) {
    lines.push('### ' + g.label + ' · statement ' + g.statement, '');
    if (g.target) lines.push(literalText(g.target), '');
    lines.push('**Static inference**', '');
    if (g.note) lines.push(g.note, '');
    if (g.behavior) lines.push('**Verified PostgreSQL behavior (not this rollout):** ' + g.behavior, '');
    lines.push('- **Proposed sequence:** ' + g.order, '- **Verify:** ' + g.verify, '- **Pause if:** ' + g.pause,
      '- **Team decision:** ' + (g.decision ? 'recorded below' : '_Unanswered_'), '');
    if (g.decision) lines.push(literalText(g.decision), '');
  }
  if (plan.uncovered.length) lines.push('## Manual review', '', ...plan.uncovered.map(x => '- ' + x), '');
  lines.push('## Migration SQL', '', literalText(plan.sql), '');
  return lines.join('\n');
}
