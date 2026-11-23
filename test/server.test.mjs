import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request } from 'node:http';
import { makeServer } from '../server.mjs';

async function start(db) {
  const server = makeServer(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, url: 'http://127.0.0.1:' + server.address().port };
}
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
  const { id } = await create.json();
  const path = '/api/reviews/' + id;
  assert.equal(create.headers.get('location'), path);
  const change = await post(service.url + '/api/reviews', { ...input, id, title: 'Billing region – revision',
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
