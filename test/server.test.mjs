import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { makeServer } from '../server.mjs';

async function start(db, options) {
  const server = makeServer(db, options).listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, url: 'http://127.0.0.1:' + server.address().port };
}

test('organization workspace is explicitly selected by the server', async t => {
  const { server, url } = await start(':memory:', { sharedWorkspace: true });
  t.after(() => stop(server));
  const html = await (await fetch(url)).text();
  assert.match(html, /<body data-workspace="org">/);
  assert.match(html, /Shared with everyone in your org who can open this app/);
});
async function stop(server) {
  await new Promise(resolve => server.close(resolve));
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function rawStatus(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = request(url, options, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end(body);
  });
}

test('API + SQLite: inspect, draft, create, update, restart, list, and export', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'rollout-test-'));
  const db = join(dir, 'reviews.sqlite');
  let service = await start(db);
  t.after(async () => { if (service.server.listening) await stop(service.server); rmSync(dir, { recursive: true }); });
  const input = { title: 'Ship invoice region', sql: 'ALTER TABLE billing.invoices ADD COLUMN region text NOT NULL' };
  const inspection = await post(service.url + '/api/inspect', { sql: input.sql });
  assert.equal(inspection.status, 200);
  assert.match((await inspection.json()).query, /BEGIN READ ONLY/);
  const draft = await post(service.url + '/api/draft', input);
  assert.equal(draft.status, 200);
  assert.equal((await draft.json()).gates[0].kind, 'required');
  const create = await post(service.url + '/api/reviews', input);
  assert.equal(create.status, 201);
  const { id, updatedAt } = await create.json();
  const path = '/api/reviews/' + id;
  assert.equal(create.headers.get('location'), path);
  const change = await post(service.url + '/api/reviews', { ...input, id, updatedAt, title: 'Billing region – revision',
    decisions: { 'required-1-0': 'Billing owns reconciliation.' } });
  assert.equal(change.status, 200);
  await stop(service.server);
  service = await start(db);
  const index = await (await fetch(service.url + '/api/reviews')).json();
  assert.equal(index.length, 1);
  assert.equal(index[0].title, 'Billing region – revision');
  const saved = await (await fetch(service.url + path)).json();
  assert.equal(saved.plan.gates[0].decision, 'Billing owns reconciliation.');
  const exported = await fetch(service.url + path + '/markdown');
  assert.match(exported.headers.get('content-disposition'), /attachment/);
  assert.match(await exported.text(), /Billing owns reconciliation/);
});

test('two saves of the same revision cannot overwrite each other even in the same millisecond', async t => {
  const { server, url } = await start(':memory:');
  t.after(() => stop(server));
  const now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const root = url + '/api/reviews';
  const input = { title: 'Concurrent review', sql: 'UPDATE billing.invoices SET amount = 0;' };
  const { id, updatedAt } = await (await post(root, input)).json();
  const request = decision => post(root, { ...input, id, updatedAt, decisions: { 'backfill-1-0': decision } });
  const responses = await Promise.all([request('First decision'), request('Second decision')]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const saved = await responses.find(r => r.status === 200).json();
  assert.notEqual(saved.updatedAt, updatedAt);
  assert.match((await responses.find(r => r.status === 409).json()).error, /Reopen it from the library/);
  assert.equal((await post(root, { ...input, id })).status, 409);
  assert.equal((await fetch(root + '/' + id + '/markdown?updatedAt=' + encodeURIComponent(updatedAt))).status, 409);
  assert.equal((await (await fetch(root + '/' + id)).json()).plan.gates[0].decision, saved.plan.gates[0].decision);
});

test('draft rejects non-object context/decisions and non-text supplied fields', async t => {
  const { server, url } = await start(':memory:');
  t.after(() => stop(server));
  const base = { title: 'Validation', sql: 'ALTER TABLE accounts DROP COLUMN old;' };
  for (const [extra, message, field] of [
    [{ context: [] }, /Context must be a JSON object/],
    [{ context: null }, /Context must be a JSON object/],
    [{ context: 'legacy job' }, /Context must be a JSON object/],
    [{ context: { actors: null } }, /must be text/, 'actors'],
    [{ decisions: [] }, /Decisions must be a JSON object/],
    [{ decisions: null }, /Decisions must be a JSON object/],
    [{ decisions: { 'drop-1-0': [] } }, /Team decision must be text/],
    [{ snapshot: null }, /Snapshot must be text/, 'snapshot']
  ]) {
    const response = await post(url + '/api/draft', { ...base, ...extra });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.match(body.error, message);
    assert.equal(body.field, field);
  }
});

test('a type-confused revision fails without clearing existing notes', async t => {
  const { server, url } = await start(':memory:');
  t.after(() => stop(server));
  const root = url + '/api/reviews';
  const input = { title: 'Validation', sql: 'ALTER TABLE public.orders RENAME COLUMN code TO reference;', context: { actors: 'Legacy jobs still use code.' } };
  const { id, updatedAt } = await (await post(root, input)).json();
  assert.equal((await post(root, { ...input, id, updatedAt, context: 'wrong' })).status, 422);
  const saved = await (await fetch(root + '/' + id)).json();
  assert.equal(saved.plan.context.actors, input.context.actors);
  assert.equal(saved.updatedAt, updatedAt);
});

test('saving a pre-audit review preserves its notes when newly recognized gates shift IDs', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'rollout-test-'));
  const db = join(dir, 'reviews.sqlite');
  const { server, url } = await start(db);
  t.after(async () => { await stop(server); rmSync(dir, { recursive: true, force: true }); });
  const root = url + '/api/reviews';
  const input = { title: 'Old rules', sql: 'TRUNCATE app.logs; ALTER TABLE app.orders ADD COLUMN region text NOT NULL;' };
  const { id, updatedAt, plan } = await (await post(root, input)).json();
  const legacy = { ...plan, gateVersion: undefined, gates: [{ ...plan.gates[1], id: 'required-2-0' }] };
  const connection = new DatabaseSync(db);
  connection.prepare('UPDATE reviews SET payload = ? WHERE id = ?').run(JSON.stringify({ plan: legacy, snapshotText: '' }), id);
  connection.close();
  const result = await post(root, { ...input, id, updatedAt, decisions: { 'required-2-0': 'Wait for backfill.' } });
  assert.equal(result.status, 200);
  const saved = (await result.json()).plan;
  assert.equal(saved.gates[0].decision, '');
  assert.equal(saved.gates[1].decision, 'Wait for backfill.');
});

test('a write lock produces a retryable error and the same revision can be retried', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'rollout-test-'));
  const db = join(dir, 'reviews.sqlite');
  const { server, url } = await start(db);
  const lock = new DatabaseSync(db);
  t.after(async () => { lock.close(); await stop(server); rmSync(dir, { recursive: true, force: true }); });
  const root = url + '/api/reviews';
  const input = { title: 'Locked', sql: 'SELECT 1;' };
  const { id, updatedAt } = await (await post(root, input)).json();
  lock.exec('BEGIN IMMEDIATE');
  const response = await post(root, { ...input, id, updatedAt });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /temporarily busy/);
  lock.exec('ROLLBACK');
  assert.equal((await post(root, { ...input, id, updatedAt })).status, 200);
});

test('HTTP boundary rejects hostile origins, non-JSON, invalid values and oversized bodies', async t => {
  const { server, url } = await start(':memory:');
  t.after(() => stop(server));
  const health = await fetch(url);
  assert.equal(health.status, 200);
  assert.match(health.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(await rawStatus(url, { headers: { Host: 'elsewhere.test:123' } }), 403);
  assert.equal(await rawStatus(url + '/api/reviews', { headers: { Origin: 'https://elsewhere.test' } }), 403);
  assert.equal(await rawStatus(url + '/api/reviews', { headers: { 'Sec-Fetch-Site': 'cross-site' } }), 403);
  assert.equal((await fetch(url + '/api/draft', { method: 'POST', body: 'hello' })).status, 415);
  assert.equal((await post(url + '/api/draft', { sql: 7 })).status, 422);
  assert.equal((await post(url + '/api/draft', { sql: 'x'.repeat(400_000) })).status, 413);
  const status = await rawStatus(url + '/api/draft', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' }
  }, 'x'.repeat(400_000));
  assert.equal(status, 413);
  assert.deepEqual(await (await fetch(url + '/api/reviews')).json(), []);
});

test('saved review and Markdown refresh snapshot age without another save', async t => {
  const { server, url } = await start(':memory:');
  t.after(() => stop(server));
  const captured = Date.parse('2026-07-12T12:00:00Z');
  let now = captured;
  t.mock.method(Date, 'now', () => now);
  const snapshot = JSON.stringify({
    version: 1, captured_at: new Date(captured).toISOString(), role: 'primary',
    last_replay_age_seconds: null, visible_long_transactions: 0, tables: []
  });
  const created = await post(url + '/api/reviews', { title: 'Age check', sql: 'SELECT 1;', snapshot });
  assert.equal(created.status, 201);
  const { id, updatedAt, plan } = await created.json();
  assert.doesNotMatch(plan.notices.join(' '), /timestamp is stale/);
  now = captured + 25 * 60 * 60 * 1000;
  const path = url + '/api/reviews/' + id;
  const opened = await (await fetch(path)).json();
  assert.equal(opened.updatedAt, updatedAt);
  assert.match(opened.plan.notices.join(' '), /timestamp is stale/);
  assert.match(await (await fetch(path + '/markdown')).text(), /timestamp is stale/);
  now = captured;
  assert.doesNotMatch(await (await fetch(path + '/markdown')).text(), /timestamp is stale/);
});
