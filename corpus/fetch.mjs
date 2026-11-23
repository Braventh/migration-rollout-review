import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [mode = '--local', ...extra] = process.argv.slice(2);
const root = new URL('./', import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function verify(bytes, expected, label) {
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new Error(`${label}: SHA-256 mismatch (expected ${expected}, got ${actual})`);
  }
}

function pinnedRawUrl({ sourceRepo, commit, upstreamPath }) {
  const repo = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)$/.exec(sourceRepo)?.[1];
  if (!repo || !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error(`Invalid pinned GitHub source: ${sourceRepo} at ${commit}`);
  }
  const path = upstreamPath.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${repo}/${commit}/${path}`;
}

async function check(entry) {
  const { path, sha256: expected, rawUrl } = entry;
  const local = fileURLToPath(new URL(path, root));
  let missing = false;
  try {
    verify(await readFile(local), expected, path);
  } catch (error) {
    if (mode !== '--restore' || error.code !== 'ENOENT') throw error;
    missing = true;
  }
  if (mode === '--local') return false;

  const response = await fetch(rawUrl, {
    redirect: 'error',
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`${rawUrl}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  verify(bytes, expected, rawUrl);
  if (missing) {
    await mkdir(dirname(local), { recursive: true });
    await writeFile(local, bytes, { flag: 'wx' });
  }
  return missing;
}

try {
  if (extra.length || !['--local', '--upstream', '--restore'].includes(mode)) {
    throw new Error('Usage: node corpus/fetch.mjs [--local | --upstream | --restore]');
  }
  const { schemaVersion, files, projects } = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  if (schemaVersion !== 1 || !files.length || !projects.length) {
    throw new Error('Expected a nonempty version 1 corpus manifest');
  }
  const entries = [
    ...files,
    ...projects.map(({ licenseFile, sourceRepo, commit }) => ({ ...licenseFile, sourceRepo, commit }))
  ];
  const paths = new Set();
  for (const entry of entries) {
    const { path, sha256: digest, rawUrl } = entry;
    if (!/^(files|THIRD_PARTY)\/[\w.-]+\/[\w.-]+$/.test(path) ||
        path.split('/').some(segment => segment === '.' || segment === '..') ||
        paths.has(path) || !/^[a-f0-9]{64}$/.test(digest) || rawUrl !== pinnedRawUrl(entry)) {
      throw new Error(`Invalid or duplicate manifest entry: ${path}`);
    }
    paths.add(path);
  }

  let restored = 0;
  for (let start = 0; start < entries.length; start += 8) {
    const results = await Promise.all(entries.slice(start, start + 8).map(check));
    restored += results.filter(Boolean).length;
  }
  const scope = mode === '--local' ? 'local SHA-256' : 'local and pinned upstream SHA-256';
  console.log(`Verified ${files.length} migrations and ${projects.length} licenses (${scope}).`);
  if (mode === '--restore') console.log(`Restored ${restored} missing files.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
