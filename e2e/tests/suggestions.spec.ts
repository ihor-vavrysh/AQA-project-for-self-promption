import { expect, test } from '@playwright/test';

test.describe('AI suggestions', () => {
  test('ranks catalogue resources for a learner and explains why', async ({
    page,
  }) => {
    await page.goto('/suggestions');

    await expect(
      page.getByRole('heading', { name: 'What should this learner do next?' }),
    ).toBeVisible();

    await page.getByLabel('Age band').selectOption('14-16');
    await page.getByRole('button', { name: 'Suggest resources' }).click();

    const suggestions = page.locator('.suggestion');
    await expect(suggestions.first()).toBeVisible();
    await expect(suggestions).toHaveCount(6);

    // Every suggestion explains its age-band gate and at least one scoring factor.
    await expect(suggestions.first().locator('.reason-gate')).toBeVisible();
    await expect(suggestions.first().locator('.reason').nth(1)).toBeVisible();
    await expect(page.getByText(/weights v\d+\.\d+\.\d+/)).toBeVisible();
  });

  test('selecting an interest reorders the suggestions', async ({ page }) => {
    await page.goto('/suggestions');
    await page.getByRole('button', { name: 'Suggest resources' }).click();
    await expect(page.locator('.suggestion').first()).toBeVisible();

    const before = await page.locator('.suggestion h2').allTextContents();
    expect(before).not.toContain('Algebra in Football Statistics');

    await page.getByRole('button', { name: 'football', exact: true }).click();
    await page.getByRole('button', { name: 'Suggest resources' }).click();

    // Wait for the new list, not the one already on screen: the previous results stay
    // rendered, so waiting on `.suggestion` would resolve against stale DOM.
    await expect(
      page.getByRole('heading', { name: 'Algebra in Football Statistics' }),
    ).toBeVisible();

    const after = await page.locator('.suggestion h2').allTextContents();
    expect(after).not.toEqual(before);
  });

  test('never asks for the learner gender', async ({ page }) => {
    await page.goto('/suggestions');

    await expect(
      page.locator('[name*="gender" i], [id*="gender" i]'),
    ).toHaveCount(0);
    await expect(page.getByText('Gender is not collected')).toBeVisible();
  });

  test('explains an empty result instead of showing a blank list', async ({
    page,
  }) => {
    await page.goto('/suggestions');

    await page.getByLabel('Language').fill('fr-FR');
    await page.getByRole('button', { name: 'Suggest resources' }).click();

    await expect(page.locator('.results .notice')).toContainText('language');
    await expect(page.locator('.suggestion')).toHaveCount(0);
  });
});
