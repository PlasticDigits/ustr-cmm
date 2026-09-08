import { expect, test } from '@playwright/test';

test('issuance cards show outstanding, CMM-owned, and available supply', async ({ page }) => {
  await page.goto('/treasury');
  for (const symbol of ['ust1', 'ustr', 'clunc', 'custc']) {
    const card = page.getByTestId(`issuance-${symbol}`);
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card.getByText('+ Outstanding', { exact: true })).toBeVisible();
    await expect(card.getByText('− CMM-owned liquidity', { exact: true })).toBeVisible();
    await expect(card.getByText('Available Supply', { exact: true })).toBeVisible();
  }
  await expect(page.getByText('Available supply is part of CR CMM Liabilities.')).toHaveCount(3);
  await expect(page.getByText(/USTR is equity, not a redeemable liability/)).toBeVisible();
});
