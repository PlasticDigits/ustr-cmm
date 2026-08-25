import { expect, test } from '@playwright/test';

const routes = ['/', '/treasury', '/dashboard', '/swap', '/referral'] as const;

for (const route of routes) {
  test(`footer Wallets on ${route} points at docs/WALLETS.md`, async ({ page }) => {
    await page.goto(route);
    const wallets = page.getByRole('contentinfo').getByRole('link', { name: 'Wallets' });
    await expect(wallets).toBeVisible();
    await expect(wallets).toHaveAttribute(
      'href',
      'https://gitlab.com/PlasticDigits2/ustr-cmm/-/blob/master/docs/WALLETS.md'
    );
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('button', { name: /Connect/i })).toBeVisible();
  });
}
