import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('fictional source survives staff edit, return, resubmission and demo acceptance without backend traffic', async ({
  page,
  baseURL,
}) => {
  const unexpected: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (
      /^https?:/.test(url) &&
      (new URL(url).origin !== new URL(baseURL!).origin ||
        /\/(rest|auth|storage|functions)\/v1\//.test(url))
    )
      unexpected.push(url);
  });
  await page.goto('/demo.html#/notes/alpha');
  await expect(page.getByRole('heading', { name: 'TEST PERSON ALPHA', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use supplied sample' }).click();
  const sourcePlan = await page.locator('#note-plan').inputValue();
  await page.getByRole('checkbox').check();
  await page.locator('#note-plan').fill(sourcePlan + ' [TEST EDIT]');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit for simulated review' }).click();
  await expect(page.locator('#note-plan')).toHaveAttribute('readonly', '');
  await expect(page.getByRole('button', { name: 'Accept in demo', exact: true })).toHaveCount(0);
  await page.getByLabel('Demo role').selectOption('reviewer');
  await expect(page.getByRole('button', { name: 'Return for practice revision' })).toBeDisabled();
  await page.getByLabel('Comment for staff').fill('Keep the person’s chosen next step explicit.');
  await page.getByRole('button', { name: 'Return for practice revision' }).click();
  await expect(page.getByRole('region', { name: 'Reviewer feedback' })).toContainText(
    'chosen next step',
  );
  await page.getByLabel('Demo role').selectOption('staff');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.locator('#note-plan')).toHaveValue(sourcePlan + ' [TEST EDIT]');
  await page.locator('#note-plan').fill(sourcePlan + ' [TEST REVISION]');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit for simulated review' }).click();
  await page.getByLabel('Demo role').selectOption('reviewer');
  await page.goto('/demo.html#/review');
  await page.getByRole('link', { name: 'Review encounter' }).click();
  await page.getByRole('button', { name: 'Accept in demo', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(
    'not final, signed, sealed or a service record',
  );
  await expect(
    page.getByRole('region', { name: 'Simulated review history' }).getByRole('listitem'),
  ).toHaveCount(4);
  await page.getByRole('button', { name: 'Preview note' }).click();
  const preview = page.getByRole('dialog', { name: 'Fictional note preview' });
  await expect(preview).toContainText('MD01-0.1 (demonstration)');
  await expect(preview).toContainText('[TEST REVISION]');
  await expect(preview).toContainText('submitted revision: 2');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download demonstration text' }).click();
  const downloaded = await download;
  const text = await readFile((await downloaded.path())!, 'utf8');
  expect(text).toContain('NOT A SERVICE RECORD. NOT SIGNED.');
  expect(text).toContain('Keep the person’s chosen next step explicit.');
  expect(text).toContain(sourcePlan);
  expect(downloaded.suggestedFilename()).toContain('demo.txt');
  expect(unexpected).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('an incomplete source leaves gaps empty and cannot be submitted', async ({ page }) => {
  await page.goto('/demo.html#/notes/beta');
  await page.getByRole('button', { name: 'Use supplied sample' }).click();
  await expect(page.getByRole('region', { name: 'Missing facts' })).toContainText(
    '1 of 7 fields supplied',
  );
  await expect(page.locator('#note-objective')).toHaveValue('');
  await expect(page.locator('#note-plan')).toHaveValue('');
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: 'Submit for simulated review' })).toBeDisabled();
  await page.getByRole('button', { name: 'Preview note' }).click();
  const text = await page.getByTestId('note-preview').innerText();
  expect(text.match(/\[Not supplied — do not infer\]/g)).toHaveLength(6);
  await expect(page.getByRole('region', { name: 'Fictional source facts' })).toContainText(
    'do not invent',
  );
});

test('route changes retain drafts; canceled reset preserves them; confirmed reset and reload clear them', async ({
  page,
}) => {
  await page.goto('/demo.html#/notes/alpha');
  await page.locator('#note-subjective').fill('TEST DRAFT TO CLEAR');
  await page.getByRole('link', { name: 'All notes', exact: true }).click();
  await page.getByRole('link', { name: 'Open encounter' }).first().click();
  await expect(page.locator('#note-subjective')).toHaveValue('TEST DRAFT TO CLEAR');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(page.locator('#note-subjective')).toHaveValue('TEST DRAFT TO CLEAR');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(page.locator('#note-subjective')).toHaveValue('');
  await page.locator('#note-subjective').fill('ANOTHER TEST DRAFT');
  await page.reload();
  await expect(page.locator('#note-subjective')).toHaveValue('');
  await expect(page.getByLabel('Demo role')).toHaveValue('staff');
});

test('observer and reviewer roles cannot edit or submit; queue is a reviewer-only demonstration', async ({
  page,
}) => {
  await page.goto('/demo.html#/notes/alpha');
  for (const role of ['observer', 'reviewer']) {
    await page.getByLabel('Demo role').selectOption(role);
    await expect(page.locator('#note-subjective')).toHaveAttribute('readonly', '');
    await expect(page.getByRole('button', { name: 'Use supplied sample' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Submit for simulated review' })).toHaveCount(0);
  }
  await page.getByLabel('Demo role').selectOption('observer');
  await page.goto('/demo.html#/review');
  await expect(page.getByRole('heading', { name: 'Reviewer view' })).toBeVisible();
});

test('mobile navigation and preview fit the viewport, with keyboard dismissal and restored focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo.html');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('link', { name: 'Notes', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).not.toBeVisible();
  await page.getByRole('link', { name: 'Open encounter' }).first().click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const trigger = page.getByRole('button', { name: 'Preview note' });
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Fictional note preview' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('link', { name: 'Fleet & operations', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Fleet & operations', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open current application (new tab)' }),
  ).toHaveAttribute('href', 'https://missionos.peerpoint.org/');
});

test('typed markup remains text in the note preview', async ({ page }) => {
  await page.goto('/demo.html#/notes/alpha');
  const text = '<script>window.md01Injected = true</script> TEST ONLY';
  await page.locator('#note-subjective').fill(text);
  await page.getByRole('button', { name: 'Preview note' }).click();
  await expect(page.getByTestId('note-preview')).toContainText(text);
  expect(await page.evaluate(() => 'md01Injected' in window)).toBe(false);
});
