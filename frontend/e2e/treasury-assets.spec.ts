import { expect, test } from '@playwright/test';

test('treasury assets include protocol holdings with CR haircut and keep LP rows', async ({ page }) => {
  await page.goto('/treasury');
  await expect(page.getByTestId('treasury-assets')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('treasury-asset-USTC')).toBeVisible({ timeout: 60_000 });

  await expect(page.getByTestId('treasury-asset-UST1')).toBeVisible();
  await expect(page.getByTestId('treasury-asset-USTR')).toBeVisible();
  await expect(page.getByTestId('treasury-asset-cLUNC')).toBeVisible();
  await expect(page.getByTestId('treasury-asset-cUSTC')).toBeVisible();
  await expect(page.getByTestId('treasury-asset-cUSTC').getByTestId('treasury-asset-cr')).toContainText('omitted');

  await expect(page.getByTestId('treasury-asset-UST1-USTR')).toBeVisible();
  await expect(page.getByTestId('treasury-asset-UST1-cUSTC')).toBeVisible();
  await expect(page.getByTestId('treasury-asset-UST1-SpaceUSD')).toBeVisible();
  await expect(page.getByTestId('treasury-asset-CL8Y-cb-cUSTC')).toBeVisible();
  await expect(page.getByTestId('treasury-asset-CL8Y-cb-ALPHA')).toBeVisible();
  await expect(page.getByTestId('treasury-asset-UST1-ALPHA')).toBeVisible();
  await expect(page.getByTestId('treasury-asset-cLUNC-cUSTC')).toBeVisible();
});
