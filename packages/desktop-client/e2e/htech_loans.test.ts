import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { AccountPage } from './page-models/account-page';
import { ConfigurationPage } from './page-models/configuration-page';

test.describe('htech_loans', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/');
    await new ConfigurationPage(page).createTestFile();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('creates and edits a loan, then keeps it visible after reload', async () => {
    await page.getByRole('link', { name: 'Loans' }).click();
    await expect(
      page.getByText('No loans yet. Add one to plan its monthly payments.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Add loan' }).click();

    const htech_dialog = page.getByRole('dialog');
    await htech_dialog.getByRole('textbox', { name: 'Loan name' }).fill('Bike');
    await expect(
      htech_dialog.getByRole('textbox', { name: 'New category name' }),
    ).toHaveValue('Bike');
    await htech_dialog
      .getByRole('textbox', { name: 'New category name' })
      .fill('Bike payment');
    await htech_dialog
      .getByRole('spinbutton', { name: 'Monthly payment' })
      .fill('100');
    await htech_dialog
      .getByRole('spinbutton', { name: 'Remaining balance' })
      .fill('300');
    await htech_dialog
      .getByRole('spinbutton', { name: 'Payment day of the month' })
      .fill('15');

    await expect(htech_dialog).toContainText(
      '3 payments · 300.00 total remaining',
    );
    await htech_dialog
      .getByRole('button', { name: 'Create loan plan' })
      .click();

    await expect(page.getByRole('heading', { name: 'Bike' })).toBeVisible();
    await expect(
      page.getByText('300.00', { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText('3', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Edit loan' }).click();
    await htech_dialog.getByRole('textbox', { name: 'Loan name' }).fill('Car');
    await htech_dialog
      .getByRole('textbox', { name: 'Category name', exact: true })
      .fill('Car payment');
    await htech_dialog
      .getByRole('spinbutton', { name: 'Monthly payment' })
      .fill('75');
    await htech_dialog
      .getByRole('spinbutton', { name: 'Remaining balance' })
      .fill('150');
    await htech_dialog
      .getByRole('spinbutton', { name: 'Payment day of the month' })
      .fill('20');
    await expect(htech_dialog).toContainText(
      '2 payments · 150.00 total remaining',
    );
    await htech_dialog.getByRole('button', { name: 'Save loan' }).click();
    await expect(page.getByRole('heading', { name: 'Car' })).toBeVisible();
    await expect(
      page.getByText('150.00', { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText('75.00', { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Car' })).toBeVisible();

    await page.getByRole('link', { name: 'Budget', exact: true }).click();
    await expect(page.getByText('htech_Car payment')).toBeVisible();
  });

  test('links a loan to an existing budget category', async () => {
    await page.getByRole('link', { name: 'Loans' }).click();
    await page.getByRole('button', { name: 'Add loan' }).click();

    const htech_dialog = page.getByRole('dialog');
    await htech_dialog.getByRole('textbox', { name: 'Loan name' }).fill('Car');
    await htech_dialog
      .getByRole('spinbutton', { name: 'Monthly payment' })
      .fill('50');
    await htech_dialog
      .getByRole('spinbutton', { name: 'Remaining balance' })
      .fill('100');
    await htech_dialog
      .getByRole('spinbutton', { name: 'Payment day of the month' })
      .fill('28');
    await htech_dialog.getByRole('button', { name: 'Budget category' }).click();
    await page
      .getByRole('button', { name: 'Use an existing category' })
      .click();
    await htech_dialog
      .getByRole('button', { name: 'Existing category' })
      .click();
    await page.getByRole('button', { name: 'Bills / Cell' }).click();
    await htech_dialog
      .getByRole('button', { name: 'Create loan plan' })
      .click();

    await expect(page.getByRole('heading', { name: 'Car' })).toBeVisible();
    await expect(page.getByText('Cell', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Car' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit loan' }).click();
    await expect(htech_dialog).toContainText('Keep current category (Cell)');
    await htech_dialog.getByRole('button', { name: 'Budget category' }).click();
    await page
      .getByRole('button', { name: 'Use an existing category' })
      .click();
    await htech_dialog
      .getByRole('button', { name: 'Existing category' })
      .click();
    await page.getByRole('button', { name: 'Bills / Internet' }).click();
    await htech_dialog.getByRole('button', { name: 'Save loan' }).click();
    await expect(page.getByText('Internet', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Internet', { exact: true })).toBeVisible();
  });

  test('counts older categorized payments without changing the entered balance', async () => {
    await page.getByRole('link', { name: 'Loans' }).click();
    await page.getByRole('button', { name: 'Add loan' }).click();
    const htech_dialog = page.getByRole('dialog');
    await htech_dialog.getByRole('textbox', { name: 'Loan name' }).fill('Bike');
    await htech_dialog
      .getByRole('spinbutton', { name: 'Monthly payment' })
      .fill('100');
    await htech_dialog
      .getByRole('spinbutton', { name: 'Remaining balance' })
      .fill('300');
    await htech_dialog
      .getByRole('spinbutton', { name: 'Payment day of the month' })
      .fill('15');
    await htech_dialog
      .getByRole('button', { name: 'Create loan plan' })
      .click();

    await page.getByRole('link', { name: /Ally Savings/ }).click();
    const htech_account = new AccountPage(page);
    await htech_account.addNewTransactionButton.click();
    const htech_date = htech_account.newTransactionRow
      .getByTestId('date')
      .locator('input');
    await htech_date.fill('2020-01-15');
    await htech_date.press('Tab');
    await htech_account._fillTransactionFields(
      htech_account.newTransactionRow,
      {
        debit: '100',
        category: 'htech_Bike',
      },
    );
    await htech_account.addEnteredTransaction();

    await page.getByRole('link', { name: 'Loans' }).click();
    await expect(
      page.getByText('300.00', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText('100.00', { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveAttribute('value', '25');
  });
});
