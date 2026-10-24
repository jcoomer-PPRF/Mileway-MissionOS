import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mockBackend, ownerId } from './fixtures/backend';

test('switching accounts removes cached personal documents', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/documents');
  await expect(page.getByText('Owner private background check')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in with email' })).toBeVisible();
  await page.locator('input[type=email]').fill('contributor@example.test');
  await page.locator('input[type=password]').fill('test-password');
  await page.getByRole('button', { name: 'Sign in with email' }).click();
  await page.getByRole('link', { name: 'Documents', exact: true }).click();
  await expect(page.getByText('No documents yet.')).toBeVisible();
  await expect(page.getByText('Owner private background check')).toHaveCount(0);
});

test('a failed report read blocks export instead of showing empty totals', async ({ page }) => {
  await mockBackend(page, { failTrips: true });
  await page.goto('/reports');
  await expect(page.getByRole('alert')).toContainText('We couldn’t load this page.');
  await expect(page.getByRole('button', { name: 'Full workbook (Excel)' })).toHaveCount(0);
});

test('CSV contains every row when the API caps pages below the requested size', async ({
  page,
}) => {
  await mockBackend(page, { tripCount: 1207 });
  await page.goto('/reports');
  await expect(
    page.getByText('Showing 25 of 1207 rows. Export for the full report.'),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).first().click();
  const path = await (await downloadPromise).path();
  const csv = await readFile(path!, 'utf8');
  expect(csv.split('\n')).toHaveLength(1208);
});

test('personal file download authenticates each request without a signed URL', async ({ page }) => {
  const requests = await mockBackend(page);
  await page.goto('/documents');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await downloadPromise;
  expect(
    requests.some(
      (request) =>
        request.url.includes('/storage/v1/object/documents/') && request.actor === ownerId,
    ),
  ).toBe(true);
  expect(requests.some((request) => request.url.includes('/object/sign/'))).toBe(false);
  const first = requests.find((request) => request.url.includes('/storage/v1/object/documents/'))!;
  expect(first.url).toContain('cacheNonce=');
  const secondDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await secondDownload;
  const downloads = requests.filter((request) =>
    request.url.includes('/storage/v1/object/documents/'),
  );
  expect(downloads).toHaveLength(2);
  expect(downloads[0].url).not.toBe(downloads[1].url);
});
