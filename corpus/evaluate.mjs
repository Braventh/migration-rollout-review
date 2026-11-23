import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { draft, inspect, InputError } from '../review.mjs';

const manifest = JSON.parse(readFileSync(new URL('manifest.json', import.meta.url), 'utf8'));
const inputs = manifest.files.map(file => ({
  title: file.id, sql: readFileSync(new URL(file.path, import.meta.url), 'utf8')
}));

async function evaluate({ draft, inspect, InputError }) {
  const metrics = {
    total: inputs.length, analyzed: 0, parseRejected: [], filesWithFindings: 0, findingEntries: 0,
    findingsByKind: {}, filesWithManualReview: 0, filesWithManualReviewOnly: 0, manualEntries: 0,
    originalInspectNotices: 0, lockNotices: 0, filesWithScopeDisclosure: 0
  };
  for (const input of inputs) {
    let analysis;
    try {
      analysis = await inspect(input.sql);
    } catch (error) {
      if (!(error instanceof InputError) || !error.message.startsWith('PostgreSQL could not parse')) throw error;
      metrics.parseRejected.push(input.title);
      continue;
    }
    const plan = await draft(input);
    metrics.analyzed++;
    if (plan.gates.length) metrics.filesWithFindings++;
    if (plan.uncovered.length) {
      metrics.filesWithManualReview++;
      if (!plan.gates.length) metrics.filesWithManualReviewOnly++;
    }
    metrics.findingEntries += plan.gates.length;
    for (const { kind } of plan.gates)
      metrics.findingsByKind[kind] = (metrics.findingsByKind[kind] ?? 0) + 1;
    metrics.manualEntries += plan.uncovered.length;
    metrics.originalInspectNotices += analysis.notices.length;
    metrics.lockNotices += analysis.lockNotices?.length ?? 0;
    if (plan.execution?.length) metrics.filesWithScopeDisclosure++;
  }
  return metrics;
}

const [base] = process.argv.slice(2);
let before;
if (base) {
  const source = execFileSync('git', ['show', base + ':review.mjs'], { encoding: 'utf8' });
  const moduleSource = source.replace("'pgsql-parser'", JSON.stringify(import.meta.resolve('pgsql-parser')));
  before = await evaluate(await import('data:text/javascript;base64,' + Buffer.from(moduleSource).toString('base64')));
}
console.log(JSON.stringify({ before, after: await evaluate({ draft, inspect, InputError }) }, null, 2));
