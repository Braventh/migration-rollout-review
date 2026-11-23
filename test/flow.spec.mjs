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
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download Markdown' }).click();
  const artifact = await download;
  const body = await readFile(await artifact.path(), 'utf8');
  expect(body).toContain('Draft for human review');
  expect(body).toContain('Billing owns the stop');
});

test('invalid snapshot retains inputs, labels missing evidence, and wraps on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Review title').fill('<em>Literal title</em>');
  await page.getByLabel('PostgreSQL migration').fill('ALTER TABLE invoices RENAME COLUMN old TO new;');
  await page.getByLabel('Database snapshot').fill('unstructured text');
  await page.getByRole('button', { name: 'Generate review' }).click();
  await expect(page.getByRole('alert')).toContainText('single JSON cell');
  await expect(page.getByLabel('Database snapshot')).toHaveValue('unstructured text');
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
