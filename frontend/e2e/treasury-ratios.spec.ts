import { expect, test } from '@playwright/test';

test('Key Ratios shows Total vs CR CMM assets and liabilities when prices complete', async ({ page }) => {
  await page.goto('/treasury');
  const card = page.getByTestId('key-ratios');
  await expect(card).toBeVisible();

  const gate = page.getByTestId('key-ratios-gate');
  const cr = page.getByTestId('key-ratios-cr');
  await expect(gate.or(cr)).toBeVisible({ timeout: 15_000 });

  await expect(cr).toBeVisible({ timeout: 75_000 });
  await expect(page.getByTestId('key-ratios-total-assets')).toBeVisible();
  await expect(page.getByTestId('key-ratios-cr-assets')).toBeVisible();
  await expect(page.getByTestId('key-ratios-total-liabilities')).toBeVisible();
  await expect(page.getByTestId('key-ratios-cr-liabilities')).toBeVisible();
  await expect(page.getByTestId('key-ratios-tier')).toBeVisible();
  await expect(page.getByText(/Status display for intended swap/)).toBeVisible();
  await expect(card.getByText('prices not loaded, cannot display key ratios')).toHaveCount(0);
});
