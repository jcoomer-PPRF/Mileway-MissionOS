import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
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


test('Excel workbook preserves all report rows, numeric cells and literal user text', async ({ page }, testInfo) => {
  const note = '=1+1 <FICTIONAL> & "quoted"';
  await mockBackend(page, { tripCount: 1207, tripNotes: note });
  await page.goto('/reports');
  await expect(page.getByText('Showing 25 of 1207 rows. Export for the full report.')).toBeVisible();
  const ready = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Full workbook (Excel)', exact: true }).click();
  const download = await ready;
  expect(download.suggestedFilename()).toMatch(/^missionos-fleet-export-.*\.xlsx$/);
  const saved = testInfo.outputPath('full-workbook.xlsx');
  await download.saveAs(saved);
  const workbook = XLSX.read(await readFile(saved), { type: 'buffer', cellStyles: true });
  expect(workbook.SheetNames).toEqual(['Trips', 'Vehicles', 'Expenses', 'Maintenance']);
  const trips = workbook.Sheets.Trips;
  expect(trips['!ref']).toBe('A1:M1208');
  expect(trips.I2.t).toBe('n');
  expect(trips.I2.v).toBe(10);
  expect(trips.I1208.v).toBe(10);
  expect(trips.M2.t).toBe('s');
  expect(trips.M2.v).toBe(note);
  expect(trips.M2.f).toBeUndefined();
  expect(trips['!cols']?.[0].width).toBeGreaterThan(0);
  for (const name of ['Vehicles', 'Expenses', 'Maintenance']) {
    expect(workbook.Sheets[name].A1.t).toBe('s');
  }
});
