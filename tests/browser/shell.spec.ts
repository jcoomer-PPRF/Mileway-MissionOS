import { test, expect } from '@playwright/test';
import { mockBackend } from './fixtures/backend';

for (const role of ['owner', 'manager', 'contributor', 'accountant', 'auditor']) {
  test(`MissionOS landing and fleet dashboard retain access for ${role}`, async ({ page }) => {
    await mockBackend(page, { role });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'My Day', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Fleet dashboard', exact: true }).click();
    await expect(page).toHaveURL(/\/operations$/);
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings', exact: true })).toHaveCount(
      role === 'owner' ? 1 : 0,
    );
    await expect(page.getByRole('link', { name: 'Audit Log', exact: true })).toHaveCount(
      ['owner', 'accountant', 'auditor'].includes(role) ? 1 : 0,
    );
  });
}

test('existing fleet and shared-platform deep links still render', async ({ page }) => {
  await mockBackend(page);
  for (const [path, heading] of [
    ['trips', 'Trips'],
    ['vehicles', 'Vehicles'],
    ['maintenance', 'Maintenance'],
    ['expenses', 'Expenses'],
    ['locations', 'Locations'],
    ['reports', 'Reports & export'],
    ['documents', 'Documents'],
    ['audit', 'Audit log'],
    ['settings', 'Settings'],
  ]) {
    await page.goto('/' + path);
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
  }
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/operations$/);
});

test('signed-out deep links still require normal sign-in', async ({ page }) => {
  await mockBackend(page, { signedIn: false });
  for (const path of [
    '/',
    '/operations',
    '/trips',
    '/reports',
    '/documents',
    '/audit',
    '/settings',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole('button', { name: 'Sign in with email', exact: true }),
    ).toBeVisible();
  }
});

test('contributor cannot enter owner settings or oversight audit routes', async ({ page }) => {
  await mockBackend(page, { role: 'contributor' });
  for (const path of ['/settings', '/audit']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'My Day', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  }
});

test('an inactive account cannot enter the Mission Delivery landing', async ({ page }) => {
  await mockBackend(page, { active: false });
  await page.goto('/');
  await expect(
    page.getByText('This account has been deactivated.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My Day', exact: true })).toHaveCount(0);
});
