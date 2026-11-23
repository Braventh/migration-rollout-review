import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { draft, inspect, InputError, markdown, refreshSnapshotNotices } from './review.mjs';

const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/styles.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/styles.css', import.meta.url))]],
  ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/app.js', import.meta.url))]]
]);
const maxBytes = 384 * 1024;
const security = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store'
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function reply(res, status, type, body, headers = {}) {
  res.writeHead(status, { ...security, 'Content-Type': type, ...headers });
  res.end(body);
}
function json(res, status, data, headers) {
  reply(res, status, 'application/json; charset=utf-8', JSON.stringify(data), headers);
}
class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readBody(req) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? ''))
    throw new RequestError(415, 'Expected application/json.');
  if (Number(req.headers['content-length']) > maxBytes) throw new RequestError(413, 'Request exceeds 384 KiB.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maxBytes) {
      req.resume();
      throw new RequestError(413, 'Request exceeds 384 KiB.');
    }
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new RequestError(400, 'Invalid JSON request.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError(400, 'Expected a JSON object.');
  return body;
}

export function makeServer(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec('CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, title TEXT NOT NULL, updated_at TEXT NOT NULL, payload TEXT NOT NULL)');
  const list = db.prepare('SELECT id, title, updated_at AS updatedAt FROM reviews ORDER BY updated_at DESC, id LIMIT 100');
  const get = db.prepare('SELECT id, updated_at AS updatedAt, payload FROM reviews WHERE id = ?');
  const insert = db.prepare('INSERT INTO reviews VALUES (?, ?, ?, ?)');
  const update = db.prepare('UPDATE reviews SET title = ?, updated_at = ?, payload = ? WHERE id = ?');
  const server = createServer({ requestTimeout: 15000, headersTimeout: 10000 }, async (req, res) => {
    try {
      const port = server.address().port;
      const allowed = ['localhost:' + port, '127.0.0.1:' + port];
      const host = req.headers.host;
      if (!allowed.includes(host)) throw new RequestError(403, 'Only the local app URL is allowed.');
      if ((req.headers.origin && req.headers.origin !== 'http://' + host) || req.headers['sec-fetch-site'] === 'cross-site')
        throw new RequestError(403, 'Cross-origin requests are not allowed.');
      const path = req.url;
      const asset = assets.get(path);
      if (req.method === 'GET' && asset) return reply(res, 200, ...asset);
      if (req.method === 'GET' && path === '/api/reviews') return json(res, 200, list.all());
      if (req.method === 'POST' && path === '/api/inspect') return json(res, 200, await inspect((await readBody(req)).sql));
      if (req.method === 'POST' && path === '/api/draft') return json(res, 200, await draft(await readBody(req)));
      if (req.method === 'POST' && path === '/api/reviews') {
        const input = await readBody(req);
        if (input.id !== undefined && (typeof input.id !== 'string' || !uuid.test(input.id) || !get.get(input.id)))
          throw new RequestError(404, 'Review not found.');
        const plan = await draft(input);
        const id = input.id ?? randomUUID(), updatedAt = new Date().toISOString();
        const payload = JSON.stringify({ plan, snapshotText: input.snapshot ?? '' });
        if (input.id) update.run(plan.title, updatedAt, payload, id);
        else insert.run(id, plan.title, updatedAt, payload);
        return json(res, input.id ? 200 : 201, { id, updatedAt, plan }, { Location: '/api/reviews/' + id });
      }
      const match = /^\/api\/reviews\/([0-9a-f-]+)(\/markdown)?$/.exec(path);
      if (req.method === 'GET' && match && uuid.test(match[1])) {
        const record = get.get(match[1]);
        if (!record) throw new RequestError(404, 'Review not found.');
        const payload = JSON.parse(record.payload);
        payload.plan = refreshSnapshotNotices(payload.plan);
        if (match[2]) return reply(res, 200, 'text/markdown; charset=utf-8', markdown(payload.plan),
          { 'Content-Disposition': 'attachment; filename="rollout-review.md"' });
        payload.plan.sqlFingerprint ??= (await inspect(payload.plan.sql)).sqlFingerprint;
        return json(res, 200, { id: record.id, updatedAt: record.updatedAt, ...payload });
      }
      throw new RequestError(404, 'Not found.');
    } catch (error) {
      if (res.destroyed) return;
      const expected = error instanceof RequestError || error instanceof InputError;
      json(res, error.status ?? (expected ? 422 : 500), { error: expected ? error.message : 'Unexpected local server error.' },
        error.status === 413 ? { Connection: 'close' } : {});
    }
  });
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.umask(0o077);
  const port = Number(process.env.PORT ?? 3000);
  const server = makeServer(process.env.REVIEW_DB ?? 'data/reviews.sqlite');
  server.listen(port, '127.0.0.1', () => console.log('Rollout Desk: http://127.0.0.1:' + server.address().port));
}
