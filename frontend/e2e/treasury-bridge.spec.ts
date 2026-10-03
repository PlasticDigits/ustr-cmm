import { expect, test } from '@playwright/test';

const LOCK = '0xD7b3Bf05987052009c350874E810Df98dA95D258';
const DEBTOR = 'terra16j5u6ey7a84g40sr3gd94nzg5w5fm45046k9s2347qhfpwm5fr6sem3lr2';
const RECEIPT = 'terra1qrxch5xafa077952ds0gep8xm4rq4fuwa30xwc2m3flm4a4swz4qh42xm7';

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

  const debts = page.getByTestId('bridge-debts');
  await expect(debts).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  const usdtDebt = page.getByTestId('bridge-debt-USDT');
  await expect(usdtDebt.getByTestId('bridge-debt-kind')).toContainText(/outstanding borrow/i);
  await expect(usdtDebt.getByTestId('bridge-debt-kind')).toContainText(/not a holding/i);
  await expect(usdtDebt.getByTestId('bridge-debt-amount')).toContainText('10,000');
  await expect(usdtDebt.getByTestId('bridge-debt-debtor')).toHaveText(DEBTOR);
  await expect(usdtDebt.getByTestId('bridge-debt-receipt')).toHaveText(RECEIPT);
  await expect(usdtDebt.getByTestId('bridge-debt-receipt')).toHaveAttribute('href', new RegExp(RECEIPT));
  await expect(usdtDebt.getByTestId('bridge-debt-coverage')).toContainText(/coverage check/i);
  await expect(page.getByTestId('treasury-assets')).not.toContainText('USDT-Bridge-Debt');
});

test('bridge section fits a phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/treasury');
  const bridge = page.getByTestId('bridge-holdings');
  await expect(bridge).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await expect(page.getByTestId('bridge-debts')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await expect(page.getByTestId('bridge-holding-USDT')).toBeVisible();
  await expect(page.getByTestId('bridge-holding-CL8Y')).toBeVisible();
  await expect(page.getByTestId('bridge-debt-USDT')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
});
