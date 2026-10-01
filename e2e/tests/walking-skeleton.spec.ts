import { expect, test } from '@playwright/test';

test('shows the tutor shell and connects to the API', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Make every lesson feel personal.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Connected' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  await expect(page.getByText(/Add your Auth0 domain/)).toBeVisible();
});
