import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const screenshot = async (page, basename) => {
  if (process.env.CAPTURE_SCREENSHOTS) await page.screenshot({ path: 'docs/screenshots/' + basename + '.png' });
};

test('inspect SQL, import a snapshot, edit a gate, save, reopen and download', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('No saved reviews yet.')).toBeVisible();
  await screenshot(page, '01-migration');
  await page.getByRole('button', { name: 'Load example' }).click();
  await page.getByRole('button', { name: 'Inspect SQL' }).click();
  await expect(page.getByText('Scoped to billing.invoices.')).toBeVisible();
  await page.getByText('Read-only capture query').click();
  await expect(page.locator('#query')).toContainText('BEGIN READ ONLY;');
  await screenshot(page, '02-context');
  await page.getByRole('button', { name: 'Generate review' }).click();
  await expect(page.getByText('2,450,000 estimated rows', { exact: false })).toBeVisible();
  await expect(page.getByText('Long transactions were visible', { exact: false })).toBeVisible();
  await page.getByLabel('Team decision').fill('Hold required reads until connector v2 and region map reconciliation. Billing owns the stop.');
  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(page.getByRole('link', { name: 'Download Markdown' })).toBeVisible();
  await page.locator('#review').evaluate(el => el.scrollIntoView());
  await screenshot(page, '03-saved-review');
  await page.reload();
  await page.getByRole('button', { name: 'Require billing region on invoices' }).click();
  await expect(page.getByLabel('Team decision')).toHaveValue(/Billing owns the stop/);
  await expect(page.getByRole('heading', { name: 'Review the rollout' })).toBeFocused();
  await expect(page.getByText('Synthetic example evidence', { exact: false })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download Markdown' }).click();
  const artifact = await download;
  const body = await readFile(await artifact.path(), 'utf8');
  expect(body).toContain('Draft for human review');
  expect(body).toContain('Billing owns the stop');
  expect(body).toContain('Synthetic example evidence');
});

test('long identifiers and titles stay in bounds and decisions have separate names', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const title = 'X'.repeat(120);
  await page.getByLabel('Review title').fill(title);
  const schema = 's'.repeat(63), table = 't'.repeat(63);
  await page.getByLabel('PostgreSQL migration').fill(
    'ALTER TABLE "' + schema + '"."' + table + '" DROP COLUMN first, DROP COLUMN second;');
  await page.getByRole('button', { name: 'Inspect SQL' }).click();
  await expect(page.locator('#inspection')).toContainText(schema + '.' + table);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: 'Generate review' }).click();
  await expect(page.getByRole('textbox', { name: /Team decision:.*first/ })).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: /Team decision:.*second/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Save review' }).click();
  await page.getByRole('button', { name: 'Saved reviews' }).click();
  await expect(page.getByRole('button', { name: title })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('labels pasted execution scope and verified PostgreSQL behavior separately from a gate', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Review title').fill('Serial rollout');
  await page.getByLabel('PostgreSQL migration').fill('-- +goose Up\nALTER TABLE app.t ADD COLUMN b bigserial;\n-- +goose Down\nALTER TABLE app.t DROP COLUMN b;');
  const inspect = page.getByRole('button', { name: 'Inspect SQL' });
  await inspect.click();
  await expect(page.locator('#inspection-scope')).toContainText('A Down statement is not necessarily part of the forward rollout.');
  await inspect.click();
  await expect(page.locator('#inspection-scope')).toHaveCount(1);
  await page.getByRole('button', { name: 'Generate review' }).click();
  await expect(page.getByText('Execution scope: unknown', { exact: true })).toBeVisible();
  const gate = page.locator('article.gate').filter({ hasText: 'Table rewrite' });
  await expect(gate.getByText('Static inference', { exact: true })).toBeVisible();
  await expect(gate.getByText('Verified PostgreSQL behavior (not this rollout):', { exact: false })).toBeVisible();
});

test('unsaved edits warn on reload and cumulative UTF-8 decision bytes block saves', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Review title').fill('Byte budget');
  await page.getByLabel('PostgreSQL migration').fill(
    Array.from({ length: 66 }, (_, i) => 'ALTER TABLE billing.invoices ADD COLUMN c' + i + ' text NOT NULL;').join('\n'));
  await page.getByRole('button', { name: 'Generate review' }).click();
  const notes = page.getByLabel('Team decision');
  await expect(notes).toHaveCount(66);
  await notes.first().fill('unsaved choice');
  const prompted = page.waitForEvent('dialog');
  await page.evaluate(() => { setTimeout(() => location.reload(), 0); });
  const dialog = await prompted;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  await expect(notes.first()).toHaveValue('unsaved choice');
  await notes.evaluateAll(areas => {
    for (const area of areas) { area.value = '界'.repeat(2000); area.dispatchEvent(new Event('input')); }
  });
  await expect(page.locator('#request-size')).toContainText(/exceeds the total save limit.*UTF-8 bytes/);
  await expect(page.getByRole('button', { name: 'Save review' })).toBeDisabled();
  await notes.first().clear();
  await notes.nth(1).clear();
  await expect(page.getByRole('button', { name: 'Save review' })).toBeEnabled();
});

test('older reviews can be loaded and reopened', async ({ page, request }) => {
  for (let i = 0; i < 101; i++) {
    const response = await request.post('/api/reviews', { data: { title: 'Paged review ' + i, sql: 'SELECT 1;' } });
    expect(response.status()).toBe(201);
  }
  await page.goto('/');
  const older = page.getByRole('button', { name: 'Paged review 0', exact: true });
  const more = page.getByRole('button', { name: 'Load older reviews' });
  await expect(more).toBeVisible();
  await expect(older).toHaveCount(0);
  while (await more.isVisible() && await older.count() === 0) {
    const response = page.waitForResponse(res => res.url().includes('/api/reviews?page='));
    await more.click();
    await response;
    await expect(page.locator('#status')).toBeHidden();
  }
  await older.click();
  await expect(page.getByLabel('Review title')).toHaveValue('Paged review 0');
});

test('invalid snapshot retains inputs, labels missing evidence, and wraps on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Saved reviews' }).click();
  await page.getByLabel('Review title').fill('<em>Literal title</em>');
  await page.getByLabel('PostgreSQL migration').fill('ALTER TABLE invoices RENAME COLUMN old TO new;');
  await page.getByLabel('Database snapshot').fill('unstructured text');
  await page.getByRole('button', { name: 'Generate review' }).click();
  await expect(page.getByRole('alert')).toContainText('single JSON cell');
  await expect(page.getByLabel('Database snapshot')).toHaveValue('unstructured text');
  await expect(page.getByLabel('Database snapshot')).toBeFocused();
  await expect(page.getByLabel('Database snapshot')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Database snapshot')).toHaveAttribute('aria-describedby', /snapshot-field-error/);
  await page.getByLabel('Database snapshot').clear();
  await page.getByRole('button', { name: 'Generate review' }).click();
  await expect(page.getByRole('heading', { name: 'Rename · statement 1' })).toBeVisible();
  await expect(page.getByText('No database snapshot supplied.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(page.getByRole('button', { name: '<em>Literal title</em>' })).toBeVisible();
  await expect(page.locator('.library em')).toHaveCount(0);
});

test('oversized SQL and snapshots stay intact with explicit size errors', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load example' }).click();
  const sql = page.getByLabel('PostgreSQL migration');
  const original = await sql.inputValue();
  const longSql = 'x'.repeat(48_001);
  await sql.clear();
  await sql.focus();
  await page.keyboard.insertText(longSql);
  await expect(sql).toHaveValue(longSql);
  await page.getByRole('button', { name: 'Inspect SQL' }).click();
  await expect(page.getByRole('alert')).toHaveText(/Migration SQL exceeds 48,000 characters/);
  await sql.fill(original);
  const snapshot = page.getByLabel('Database snapshot');
  const longSnapshot = 'x'.repeat(18_001);
  await snapshot.clear();
  await snapshot.focus();
  await page.keyboard.insertText(longSnapshot);
  await expect(snapshot).toHaveValue(longSnapshot);
  await page.getByRole('button', { name: 'Generate review' }).click();
  await expect(page.getByRole('alert')).toHaveText(/Database snapshot exceeds 18,000 characters/);
  await expect(page.getByLabel('Team decision')).toHaveCount(0);
});

test('SQL comments preserve saved decisions, but changed statements clear them', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load example' }).click();
  await page.getByLabel('Review title').fill('Comment-only revision');
  const generate = page.getByRole('button', { name: 'Generate review' });
  const decision = page.getByLabel('Team decision');
  await generate.click();
  await decision.fill('Billing owns the decision.');
  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(page.getByRole('link', { name: 'Download Markdown' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Comment-only revision' }).click();
  await expect(decision).toHaveValue('Billing owns the decision.');
  const sql = page.getByLabel('PostgreSQL migration');
  const changed = '-- Reviewed by Billing\n' + (await sql.inputValue()).replace('ADD COLUMN', 'ADD /* note */ COLUMN');
  await sql.fill(changed);
  await generate.click();
  await expect(page.getByRole('status')).toHaveText(/Draft ready/);
  await expect(decision).toHaveValue('Billing owns the decision.');
  await sql.fill(changed.replace('region text', 'region integer'));
  await generate.click();
  await expect(page.getByRole('status')).toHaveText(/Draft ready/);
  await expect(decision).toHaveValue('');
});
