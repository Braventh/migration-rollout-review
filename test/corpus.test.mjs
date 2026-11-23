import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const corpus = new URL('../corpus/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', corpus), 'utf8'));

function verifyFrom(root) {
  return spawnSync(process.execPath, [join(root, 'fetch.mjs')], { encoding: 'utf8' });
}

test('verifies the checked-in corpus and licenses without network access', () => {
  const run = verifyFrom(fileURLToPath(corpus));
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Verified \d+ migrations and \d+ licenses \(local SHA-256\)/);
});

test('rejects altered SQL bytes', t => {
  const dir = mkdtempSync(join(tmpdir(), 'rollout-corpus-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(corpus, dir, { recursive: true });
  const path = manifest.files[0].path;
  writeFileSync(join(dir, path), 'SELECT 1;');
  const run = verifyFrom(dir);
  assert.equal(run.status, 1);
  assert.ok(run.stderr.includes(`${path}: SHA-256 mismatch`), run.stderr);
});
