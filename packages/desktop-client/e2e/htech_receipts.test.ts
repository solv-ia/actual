import { expect, test } from './fixtures';
import { ConfigurationPage } from './page-models/configuration-page';
import { Navigation } from './page-models/navigation';

test('opens receipts from a transaction', async ({ page }) => {
  const configuration = new ConfigurationPage(page);
  const navigation = new Navigation(page);

  await page.goto('/');
  await configuration.createTestFile();
  const account = await navigation.goToAccountPage('Ally Savings');
  await account.rightClickNthTransaction(0);
  await page
    .getByRole('menu')
    .getByRole('button', { name: 'Receipts' })
    .click();

  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: /Receipts/ }),
  });
  await expect(dialog).toContainText(
    'No receipt is linked to this transaction yet.',
  );
  await expect(dialog).toMatchThemeScreenshots();
});

test('opens the purchased items page and its filters', async ({ page }) => {
  const configuration = new ConfigurationPage(page);
  await page.goto('/');
  await configuration.createTestFile();
  await page.getByRole('link', { name: 'Purchased items' }).click();
  await expect(page.getByRole('main')).toContainText('No purchased items yet.');
  await page.getByRole('button', { name: 'Advanced filters' }).click();
  await expect(page.getByLabel('Barcode contains')).toBeVisible();
  await expect(page.getByRole('main')).toMatchThemeScreenshots();
});
