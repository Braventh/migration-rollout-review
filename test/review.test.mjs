import test from 'node:test';
import assert from 'node:assert/strict';
import { draft, inspect, markdown } from '../review.mjs';

const cases = {
  required: 'ALTER TABLE "Order" ADD COLUMN region text NOT NULL',
  rename: 'ALTER TABLE "Profile" RENAME COLUMN bio TO biography',
  drop: 'ALTER TABLE "User" DROP COLUMN "legacyTier"',
  index: 'CREATE INDEX test_idx ON "Event" ("tenantId", "createdAt")',
  enum: "ALTER TYPE \"OrderStatus\" ADD VALUE 'REFUNDED'",
  type: 'ALTER TABLE "Invoice" ALTER COLUMN total TYPE bigint USING total::bigint',
  fk: 'ALTER TABLE "Invoice" ADD CONSTRAINT account_fk FOREIGN KEY ("accountId") REFERENCES "Account"(id) NOT VALID',
  backfill: 'UPDATE "Invoice" SET "derivedCountry" = "billingCountry" WHERE "derivedCountry" IS NULL',
  split: 'CREATE TABLE "UserPreferences" (id integer); INSERT INTO "UserPreferences" SELECT id FROM "User"; ALTER TABLE "User" DROP COLUMN marketing'
};
for (const [kind, sql] of Object.entries(cases)) {
  test('DEV-03: ' + kind, async () => {
    const plan = await draft({ title: 'Review', sql });
    const gate = plan.gates.find(g => g.kind === kind);
    assert.ok(gate?.order && gate?.verify && gate?.pause);
    assert.equal(plan.control, false);
    assert.equal(gate.decision, '');
    assert.equal(plan.unanswered.length, 4);
  });
}
test('comments and literal controls never produce fabricated gates', async () => {
  const result = await inspect("/* ALTER TABLE r DROP COLUMN foo; */ SELECT 'DROP TABLE r;'; SELECT 1;");
  assert.ok(result.control);
  assert.deepEqual(result.findings, []);
  assert.ok((await inspect('-- nothing')).control);
  assert.ok(!(await inspect("SELECT DISTINCT ON (set_config('a.b','c',false)) 1;")).control);
  assert.ok(!(await inspect('WITH q AS (DELETE FROM t RETURNING 1) SELECT 1;')).control);
});
test('uncovered SQL is reported; affected tables and runner warning are derived', async () => {
  const result = await inspect('BEGIN; CREATE INDEX CONCURRENTLY ix ON billing."Invoice"(id); ALTER TABLE "Invoice" ADD CHECK (id > 0);');
  assert.deepEqual(result.targets, [{ schema: 'billing', table: 'Invoice' }, { schema: 'public', table: 'Invoice' }]);
  assert.match(result.notices[0], /transaction/);
  assert.match(result.notices[1], /search_path/);
  assert.ok(result.uncovered.length);
});

test('a plain index build in a transaction does not get the concurrent runner warning', async () => {
  const result = await inspect('BEGIN; CREATE INDEX idx ON billing.invoices(id); COMMIT;');
  assert.match(result.findings[0].note, /CONCURRENTLY is not requested/);
  assert.doesNotMatch(result.notices.join(' '), /concurrent index and explicit transaction/);
});

test('snapshot skips unqualified CTE references but keeps schema-qualified relations', async () => {
  const cte = 'WITH pending AS (SELECT id FROM billing.invoices)';
  const insert = 'INSERT INTO billing.history';
  for (const prefix of [cte + ' ' + insert, insert + ' ' + cte]) {
    const result = await inspect(prefix + ' SELECT id FROM pending, archive.pending;');
    assert.deepEqual(result.targets, [{ schema: 'billing', table: 'history' }, { schema: 'archive', table: 'pending' }]);
    assert.match(result.uncovered.join(' '), /CTE effects are not analyzed/);
    assert.equal(result.findings[0].kind, 'backfill');
  }
  const split = await inspect('CREATE TABLE billing.history(id int); ' + cte + ' ' + insert +
    ' SELECT id FROM pending; ALTER TABLE public.pending DROP COLUMN id;');
  assert.ok(split.findings.every(finding => finding.kind !== 'split'));
});
test('capture scopes identifiers safely and limits repeated targets', async () => {
  const result = await inspect("ALTER TABLE public.\"a'b\" DROP COLUMN t;");
  assert.equal(result.notices.length, 0);
  assert.match(result.query, /BEGIN READ ONLY;/);
  assert.match(result.query, /612762/);
  assert.ok(!result.query.includes("a'b"));
  assert.match(result.query, /ROLLBACK;$/);
  const many = await inspect(Array.from({ length: 13 }, (_, i) => 'UPDATE t' + i + ' SET value = 1;').join('\n'));
  assert.equal(many.targets.length, 12);
  assert.match(many.notices.join(' '), /first 12/);
});

export function sample(overrides = {}) {
  return JSON.stringify({
    version: 1, role: 'replica', captured_at: new Date().toISOString(),
    last_replay_age_seconds: 18, visible_long_transactions: 2,
    tables: [{ schema: 'public', table: 'Invoice', kind: 'r', bytes: 25000, rows_estimate: 1_200_000, indexes: 3, invalid_indexes: 1 }],
    ...overrides
  });
}

test('snapshot produces operational evidence and stops short of inferring lag or readiness', async () => {
  const plan = await draft({ title: 'Invoice type', sql: cases.type, snapshot: sample() });
  assert.equal(plan.snapshot.tables[0].rows, 1_200_000);
  assert.match(plan.notices.join('\n'), /invalid or not-ready/);
  assert.match(plan.notices.join('\n'), /1M rows/);
  assert.match(plan.notices.join('\n'), /Long transactions/);
  assert.match(plan.notices.join('\n'), /not transport or apply lag/);
  assert.equal(plan.unanswered.length, 4);
});

test('snapshot timestamps require real calendar dates and accept PostgreSQL offset timestamps', async () => {
  const input = { title: 'Type', sql: cases.type };
  for (const captured_at of ['2026-02-30T09:00:00Z', '2026-02-29T09:00:00+03:00',
    '2028-02-29T24:00:00Z', '2028-02-29T09:00:00', '2028-02-29T09:00:00+25:00']) {
    await assert.rejects(draft({ ...input, snapshot: sample({ captured_at }) }), /captured_at.*valid calendar date/);
  }
  const captured_at = '2028-02-29T09:00:00.123456-03:30';
  const plan = await draft({ ...input, snapshot: sample({ captured_at }) });
  assert.equal(plan.snapshot.capturedAt, '2028-02-29T12:30:00.123Z');
});
test('reject mismatched relation, inconsistent counts and malformed or oversized inputs', async () => {
  const input = { title: 'Type', sql: cases.type };
  await assert.rejects(draft({ ...input, snapshot: sample({ tables: [{ schema: 'x', table: 'Invoice' }] }) }), /do not match/);
  await assert.rejects(draft({ ...input, snapshot: sample({ last_replay_age_seconds: -1 }) }), /invalid last replay age/);
  await assert.rejects(draft({ ...input, snapshot: sample({ role: 'primary' }) }), /primary cannot/);
  await assert.rejects(draft({ ...input, snapshot: '{wrong' }), /single JSON cell/);
  await assert.rejects(inspect('ALTER TABLE'), /could not parse/);
  await assert.rejects(inspect('x'.repeat(48_001)), /48000/);
  await assert.rejects(inspect('SELECT 1;'.repeat(101)), /100 statements/);
});
test('markdown preserves user decisions as inert text', async () => {
  const hostileText = '<script>example</script>\n# Not a generated section';
  const input = { title: hostileText, sql: cases.drop, context: { actors: hostileText }, decisions: { 'drop-1-0': hostileText } };
  const output = markdown(await draft(input));
  assert.ok(output.includes('\n    &lt;script&gt;example&lt;/script&gt;\n    # Not a generated section\n'));
  assert.doesNotMatch(output, /<script>/);
  assert.match(output, /Team decision:\*\* recorded below/);
  assert.match(output, /Draft for human review/);
});

test('migration search_path scopes captures and does not guess among multiple schemas', async () => {
  const plan = await inspect('SET search_path TO app; ALTER TABLE orders DROP COLUMN old; ' +
    'BEGIN; SET LOCAL search_path TO tenant; TRUNCATE orders; COMMIT; DELETE FROM orders; ' +
    'SET search_path TO app, public; DELETE FROM audit; DELETE FROM public.audit;');
  assert.deepEqual(plan.targets, [{ schema: 'app', table: 'orders' }, { schema: 'tenant', table: 'orders' },
    { schema: 'public', table: 'audit' }]);
  assert.match(plan.notices.join('\n'), /ambiguous search_path/);
  assert.match(plan.findings[0].target, /"app"\."orders"/);
});

test('audit destructive statements capture affected tables and flag cascade and opaque code', async () => {
  const plan = await inspect('TRUNCATE app.orders CASCADE; DELETE FROM public.orders WHERE true; ' +
    'DROP SCHEMA app CASCADE; DROP TYPE app.status CASCADE; DROP INDEX app.ix CASCADE; ' +
    'WITH d AS (DELETE FROM archive.orders USING archive.audit RETURNING archive.orders.*) INSERT INTO public.orders SELECT * FROM d; ' +
    'DO $$ BEGIN ALTER TABLE app.orders DROP COLUMN x; END $$; ' +
    'CREATE FUNCTION app.f() RETURNS void LANGUAGE sql AS $$ DELETE FROM app.orders $$;');
  assert.deepEqual(plan.targets, [...['app', 'public', 'archive'].map(schema => ({ schema, table: 'orders' })),
    { schema: 'archive', table: 'audit' }]);
  const drops = plan.findings.filter(g => g.kind === 'drop');
  assert.equal(drops.length, 6);
  assert.match(drops[0].note, /CASCADE/);
  assert.match(drops[1].note, /every row/);
  assert.match(drops.at(-1).target, /archive/);
  assert.equal(plan.uncovered.filter(x => x.includes('Opaque')).length, 2);
});

test('concurrent operations and new enum literals respect explicit transaction order', async () => {
  const sql = "BEGIN; CREATE INDEX CONCURRENTLY ix ON app.events(id); ALTER TABLE app.events DETACH PARTITION app.old CONCURRENTLY; " +
    "REINDEX TABLE CONCURRENTLY app.events; DROP INDEX CONCURRENTLY app.ix; ALTER TYPE status ADD VALUE 'paused'; " +
    "UPDATE app.jobs SET s='paused' WHERE id=1; COMMIT; CREATE INDEX CONCURRENTLY ix ON app.events(id);";
  const plan = await inspect(sql);
  assert.deepEqual(plan.notices.filter(x => x.includes('transaction block')).map(x => Number(/Statement (\d+)/.exec(x)[1])), [2, 3, 4, 5]);
  assert.match(plan.notices.join('\n'), /Statement 7:.*enum value/);
});

test('partitioned parents and required-column defaults get distinct operational warnings', async () => {
  const evidence = (kind, rows_estimate) => sample({ tables: [
    { schema: 'public', table: 'orders', kind, bytes: 0, rows_estimate, indexes: 0, invalid_indexes: 0 }
  ] });
  const partition = await draft({ title: 'Index', sql: 'CREATE INDEX CONCURRENTLY ix ON public.orders(id);', snapshot: evidence('p', null) });
  assert.match(partition.notices.join('\n'), /does not support CREATE INDEX CONCURRENTLY on a partitioned parent/);
  const created = await inspect('CREATE TABLE m (id int, d date) PARTITION BY RANGE (d); CREATE INDEX CONCURRENTLY im ON m(id);');
  assert.match(created.notices.join('\n'), /does not support CREATE INDEX CONCURRENTLY on a partitioned parent/);
  for (const [column, expected] of [
    ['source text NOT NULL', /fails if the table has existing rows/],
    ["source text NOT NULL DEFAULT 'legacy'", /11\+.*without a table rewrite/],
    ['inserted_at timestamptz NOT NULL DEFAULT clock_timestamp()', /volatile DEFAULT.*full table rewrite/]
  ]) {
    const plan = await draft({ title: 'Required', sql: 'ALTER TABLE public.orders ADD COLUMN ' + column, snapshot: evidence('r', 82000000) });
    assert.match(plan.gates[0].note, expected);
    assert.equal(plan.notices.some(x => /82000000 rows/.test(x)), !column.includes('DEFAULT'));
  }
});

test('audit secondary cases distinguish table dependencies from objects outside capture', async () => {
  const sql = 'ALTER TYPE app.addr ALTER ATTRIBUTE zip TYPE text; ALTER INDEX app.orders_idx SET (fillfactor=70); ' +
    "CREATE TABLE app.events_2027 PARTITION OF app.events FOR VALUES FROM ('2027-01-01') TO ('2028-01-01'); " +
    'INSERT INTO b SELECT a.* FROM a JOIN c ON a.id=c.id; UPDATE b SET id=a.id FROM a WHERE true; ' +
    'ALTER TABLE orders ADD CONSTRAINT u UNIQUE (email), DROP COLUMN old CASCADE; ' +
    "ALTER TYPE app.status RENAME VALUE 'was' TO 'now'; CREATE TEMP TABLE t (x int); DELETE FROM db.app.t;";
  const plan = await inspect(sql);
  assert.deepEqual(plan.targets.map(x => x.schema + '.' + x.table),
    ['app.events_2027', 'app.events', 'public.b', 'public.a', 'public.c', 'public.orders']);
  assert.match(plan.findings.find(x => x.statement === 5).note, /No restrictive WHERE/);
  assert.ok(plan.findings.some(x => x.kind === 'index'));
  assert.ok(plan.findings.some(x => x.kind === 'drop' && /CASCADE/.test(x.note)));
  assert.match(plan.findings.find(x => x.kind === 'enum').target, /was → now/);
});

test('markdown indents each logical line of pasted text and quoted SQL identifiers', async () => {
  const sql = 'ALTER TABLE billing."invoice\rhistory" DROP COLUMN previous;';
  const actors = 'first\rsecond\r\nthird\u000bfourth\u000cfifth\u0085sixth\u2028seventh\u2029eighth';
  const output = markdown(await draft({ title: 'Review', sql, context: { actors } }));
  assert.doesNotMatch(output, /[\r\u000b\u000c\u0085\u2028\u2029]/u);
  assert.ok(output.includes('    "billing"."invoice\n    history" · previous'));
  assert.ok(output.includes('    ALTER TABLE billing."invoice\n    history" DROP COLUMN previous;'));
  assert.ok(output.includes('    first\n    second\n    third\n    fourth\n    fifth\n    sixth\n    seventh\n    eighth'));
});
