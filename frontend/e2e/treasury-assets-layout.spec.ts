import { expect, test, type Locator, type Page } from '@playwright/test';

const SCANNER = 'https://finder.terraclassic.community/columbus-5';
const TREASURY = 'terra16j5u6ey7a84g40sr3gd94nzg5w5fm45046k9s2347qhfpwm5fr6sem3lr2';
const SPACEUSD_PAIR = 'terra1xx5t5em3aza3lst0s5yc7rjgx9psapa3345v2vzfqkrprhw3vv6q3hahxy';

const VIEWPORTS = [
  { name: 'phone-375', width: 375, height: 812, columns: 1 },
  { name: 'tablet-768', width: 768, height: 1024, columns: 2 },
  { name: 'ipad-air-834', width: 834, height: 1112, columns: 2 },
  { name: 'ipad-1024', width: 1024, height: 768, columns: 2 },
  { name: 'desktop-1280', width: 1280, height: 800, columns: 3 },
] as const;

async function waitForAssets(page: Page) {
  await page.goto('/treasury');
  await expect(page.getByTestId('treasury-assets')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('treasury-asset-USTC')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('treasury-asset-UST1-SpaceUSD')).toBeVisible();
}

async function gridColumnCount(page: Page): Promise<number> {
  return page.getByTestId('treasury-assets-grid').evaluate((el) => {
    const cols = getComputedStyle(el).gridTemplateColumns;
    return cols.split(/\s+/).filter(Boolean).length;
  });
}

async function assertNotCssClipped(locator: Locator) {
  const count = await locator.count();
  for (let i = 0; i < count; i++) {
    const clip = await locator.nth(i).evaluate((el) => {
      const style = getComputedStyle(el);
      const nowrap = style.whiteSpace === 'nowrap';
      const ellipsis = style.textOverflow === 'ellipsis';
      const hidden =
        style.overflowX === 'hidden' ||
        style.overflow === 'hidden';
      const overflowed = el.scrollWidth > el.clientWidth + 1;
      return {
        className: el.className,
        nowrap,
        ellipsis,
        hidden,
        overflowed,
        text: (el.textContent || '').trim(),
      };
    });
    expect(clip.className, `ellipsis class on "${clip.text}"`).not.toMatch(/\btruncate\b/);
    expect(
      clip.ellipsis && clip.hidden && clip.overflowed,
      `clipped text "${clip.text}"`,
    ).toBeFalsy();
    expect(
      clip.nowrap && clip.hidden && clip.overflowed,
      `nowrap clip on "${clip.text}"`,
    ).toBeFalsy();
  }
}

async function assertNoPageXScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

for (const vp of VIEWPORTS) {
  test.describe(`Treasury Assets layout ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`${vp.columns}-col, wrap values, no page X-scroll`, async ({ page }) => {
      await waitForAssets(page);
      expect(await gridColumnCount(page)).toBe(vp.columns);

      await expect(page.getByTestId('treasury-asset-USTC').getByTestId('treasury-asset-primary')).toBeVisible();
      await expect(page.getByTestId('treasury-asset-UST1-SpaceUSD')).toContainText('LP UST1/SpaceUSD');
      await expect(page.getByTestId('treasury-asset-UST1-SpaceUSD').getByTestId('treasury-asset-primary')).toContainText(/of pool|—/);

      const cr = page.getByTestId('treasury-asset-cr');
      await expect(cr.first()).toBeVisible();
      await expect(cr.first()).toContainText('omitted');

      await assertNotCssClipped(page.getByTestId('treasury-asset-primary'));
      await assertNotCssClipped(page.getByTestId('treasury-asset-usd'));
      await assertNotCssClipped(page.getByTestId('treasury-asset-cr'));
      await assertNoPageXScroll(page);

      await expect(page.getByTestId('treasury-assets-view-contract')).toBeVisible();
      await expect(page.getByText('No treasury assets found')).toHaveCount(0);
    });
  });
}

test('View Contract and Pair open columbus-5 scanner addresses', async ({ page }) => {
  await waitForAssets(page);
  await expect(page.getByTestId('treasury-assets-view-contract')).toHaveAttribute(
    'href',
    `${SCANNER}/address/${TREASURY}`,
  );
  await expect(
    page.getByTestId('treasury-asset-UST1-SpaceUSD').getByTestId('treasury-asset-pair'),
  ).toHaveAttribute('href', `${SCANNER}/address/${SPACEUSD_PAIR}`);
});
