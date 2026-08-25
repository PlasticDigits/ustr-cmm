import { expect, test } from '@playwright/test';

test.describe('no inject', () => {
  test('Keplr and Trust rows are present and disabled; WC rows stay enabled', async ({
    page,
  }) => {
    await page.goto('/treasury');
    await page.getByRole('button', { name: /Connect Wallet/i }).click();

    const keplr = page.getByTestId('wallet-option-keplr');
    const trust = page.getByTestId('wallet-option-trust-wallet');
    await expect(keplr).toBeVisible();
    await expect(trust).toBeVisible();
    await expect(keplr).toBeDisabled();
    await expect(trust).toBeDisabled();
    await expect(page.getByTestId('wallet-option-terra-station')).toBeDisabled();
    await expect(page.getByTestId('wallet-option-leap')).toBeDisabled();
    await expect(page.getByTestId('wallet-option-cosmostation')).toBeDisabled();
    await expect(page.getByTestId('wallet-option-lunc-dash')).toBeEnabled();
    await expect(page.getByTestId('wallet-option-galaxy-station')).toBeEnabled();
    await expect(page.getByRole('link', { name: 'Mobile wallet help' })).toHaveAttribute(
      'href',
      'https://gitlab.com/PlasticDigits2/ustr-cmm/-/blob/master/docs/WALLETS.md'
    );
  });
});

test.describe('Trust cosmos inject only', () => {
  test.use({
    // Playwright applies this before document scripts.
  });

  test('window.trustwallet.cosmos without window.keplr enables both rows', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const cosmos = {
        enable: async () => undefined,
        getOfflineSigner: () => ({}),
      };
      Object.defineProperty(window, 'trustwallet', {
        configurable: true,
        value: { cosmos },
      });
    });
    await page.goto('/treasury');
    await page.getByRole('button', { name: /Connect Wallet/i }).click();
    await expect(page.getByTestId('wallet-option-keplr')).toBeEnabled();
    await expect(page.getByTestId('wallet-option-trust-wallet')).toBeEnabled();
    await expect(page.getByTestId('wallet-option-keplr')).toContainText(
      /Trust Wallet and other Keplr-compatible/i
    );
  });
});
