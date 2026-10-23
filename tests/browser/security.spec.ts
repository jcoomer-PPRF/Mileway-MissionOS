import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const ownerId = '00000000-0000-0000-0000-000000000001';
const contributorId = '00000000-0000-0000-0000-000000000003';
function session(id: string) {
  const user = {
    id,
    email: id === ownerId ? 'owner@example.test' : 'contributor@example.test',
    role: 'authenticated',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  const token = Buffer.from(JSON.stringify({ sub: id, exp: expires_at })).toString('base64url');
  return {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${token}.test-signature`,
    refresh_token: 'test-refresh',
    expires_at,
    expires_in: 3600,
    token_type: 'bearer',
    user,
  };
}
function actor(authorization: string) {
  try {
    return JSON.parse(Buffer.from(authorization.split('.')[1], 'base64url').toString()).sub;
  } catch {
    return '';
  }
}
async function mockBackend(page: Page, options: { failTrips?: boolean; tripCount?: number } = {}) {
  const requests: { url: string; actor: string }[] = [];
  await page.addInitScript(
    (value) => localStorage.setItem('sb-127-auth-token', JSON.stringify(value)),
    session(ownerId),
  );
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({
      url: url.pathname + url.search,
      actor: actor(request.headers().authorization ?? ''),
    });
    if (request.method() === 'OPTIONS')
      return route.fulfill({
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET,POST,DELETE,PATCH,OPTIONS',
        },
      });
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
      'Access-Control-Expose-Headers': 'Content-Range',
    };
    const id = actor(request.headers().authorization ?? '');
    if (url.pathname.includes('/auth/v1/token')) {
      const body = request.postDataJSON();
      return route.fulfill({
        headers,
        body: JSON.stringify(
          session(body.email === 'owner@example.test' ? ownerId : contributorId),
        ),
      });
    }
    if (url.pathname.includes('/auth/v1/logout')) return route.fulfill({ headers, body: '{}' });
    if (url.pathname.includes('/storage/'))
      return route.fulfill({
        headers: { ...headers, 'Content-Type': 'application/pdf' },
        body: 'fictional PDF attachment',
      });
    const table = url.pathname.split('/').pop();
    let rows: Record<string, unknown>[] = [];
    if (table === 'profiles')
      rows = [
        {
          id,
          email: session(id).user.email,
          full_name: id === ownerId ? 'Owner' : 'Contributor',
          role: id === ownerId ? 'owner' : 'contributor',
          is_active: true,
          job_title_id: null,
          default_entity_id: null,
        },
      ];
    if (table === 'documents' && id === ownerId)
      rows = [
        {
          id: 'private-document',
          title: 'Owner private background check',
          profile_id: ownerId,
          created_by: ownerId,
          entity_id: 'entity',
          document_type_id: 'type',
          file_path: 'personal/owner/credential.pdf',
          expiration_date: null,
          tags: [],
        },
      ];
    if (table === 'entities')
      rows = [
        { id: 'entity', name: 'Foundation', is_primary: true, entity_type: 'nonprofit_501c3' },
      ];
    if (table === 'document_types')
      rows = [{ id: 'type', name: 'Background check', is_active: true }];
    if (table === 'v_trip_details') {
      if (options.failTrips)
        return route.fulfill({
          status: 500,
          headers,
          body: JSON.stringify({ code: 'XX000', message: 'Unavailable' }),
        });
      rows = Array.from({ length: options.tripCount ?? 0 }, (_, n) => ({
        id: `trip-${n}`,
        trip_date: '2026-07-01',
        entity_id: 'entity',
        entity_name: 'Foundation',
        entity_is_primary: true,
        vehicle_label: 'Test vehicle',
        license_plate: 'TEST',
        category_name: 'Business',
        irs_rate_type: 'business',
        odometer_start: null,
        odometer_end: null,
        distance_miles: 10,
        applied_rate: 0.7,
        deduction_amount: 7,
        destination: 'Test location',
        notes: null,
      }));
    }
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Math.min(137, Number(url.searchParams.get('limit') ?? 500));
    const batch = rows.slice(offset, offset + limit);
    return route.fulfill({
      headers: {
        ...headers,
        'Content-Range': `${offset}-${offset + batch.length - 1}/${rows.length}`,
      },
      body: JSON.stringify(batch),
    });
  });
  return requests;
}

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
});
