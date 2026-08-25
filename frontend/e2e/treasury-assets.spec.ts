import { expect, test } from '@playwright/test';

test('treasury assets omit raw protocol tokens and keep LP rows', async ({ page }) => {
  await page.goto('/treasury');
  await expect(page.getByTestId('treasury-assets')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('treasury-asset-USTC')).toBeVisible({ timeout: 60_000 });

  await expect(page.getByTestId('treasury-asset-UST1')).toHaveCount(0);
  await expect(page.getByTestId('treasury-asset-USTR')).toHaveCount(0);
  await expect(page.getByTestId('treasury-asset-cLUNC')).toHaveCount(0);
  await expect(page.getByTestId('treasury-asset-cUSTC')).toHaveCount(0);

  await expect(page.getByTestId('treasury-asset-UST1-USTR')).toBeVisible();
  await expect(page.getByTestId('treasury-asset-UST1-cUSTC')).toBeVisible();
  await expect(page.getByTestId('treasury-asset-UST1-SpaceUSD')).toBeVisible();
});
