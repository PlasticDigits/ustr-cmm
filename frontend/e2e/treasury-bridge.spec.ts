import { expect, test } from '@playwright/test';

const LOCK = '0xD7b3Bf05987052009c350874E810Df98dA95D258';

test('treasury bridge shows BSC lock holdings outside CMM asset ratios', async ({ page }) => {
  await page.goto('/treasury');

  const bridge = page.getByTestId('bridge-holdings');
  await expect(bridge).toBeVisible({ timeout: 60_000 });
  await expect(bridge).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await expect(page.getByTestId('bridge-holdings-note')).toContainText('not counted in CMM asset ratios');
  await expect(page.getByTestId('bridge-lock-address')).toHaveText(LOCK);
  await expect(page.getByTestId('bridge-holdings-explorer')).toHaveAttribute(
    'href',
    `https://bscscan.com/address/${LOCK}`,
  );

  const usdt = page.getByTestId('bridge-holding-USDT');
  const cl8y = page.getByTestId('bridge-holding-CL8Y');
  await expect(usdt.getByTestId('bridge-holding-amount')).toHaveText(/\d/);
  await expect(cl8y.getByTestId('bridge-holding-amount')).toHaveText(/\d/);
  await expect(usdt.getByTestId('bridge-holding-token')).toHaveAttribute(
    'href',
    new RegExp(`bscscan.com/token/0x55d398326f99059ff775485246999027b3197955\\?a=${LOCK}`),
  );

  await expect(page.getByTestId('treasury-assets')).not.toContainText(LOCK);
  await expect(page.getByTestId('key-ratios')).not.toContainText(LOCK);
});

test('bridge section fits a phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/treasury');
  const bridge = page.getByTestId('bridge-holdings');
  await expect(bridge).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await expect(page.getByTestId('bridge-holding-USDT')).toBeVisible();
  await expect(page.getByTestId('bridge-holding-CL8Y')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
});
