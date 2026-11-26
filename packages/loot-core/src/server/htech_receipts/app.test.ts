import * as db from '#server/db';
import type { htech_SaveReceipt } from '#types/htech_receipts';

import { htech_app } from './app';

beforeEach(global.emptyDatabase());

async function htech_makeTransaction() {
  await db.insertAccount({ id: 'account-1', name: 'Bank' });
  return db.insertTransaction({
    account: 'account-1',
    date: '2026-11-21',
    amount: -500,
  });
}

function htech_makeReceipt(transaction_id: string): htech_SaveReceipt {
  return {
    id: 'receipt-1',
    transaction_id,
    store: 'Carrefour',
    purchased_at: '2026-11-21',
    total_cents: 500,
    lines: [
      {
        id: 'line-1',
        kind: 'item',
        printed_name: 'SAVON 500ML',
        product_id: 'product-1',
        group_id: 'cleaning',
        barcode: '03012345678905',
        quantity: '1',
        unit: 'item',
        unit_price_cents: 500,
        discount_cents: 0,
        paid_cents: 500,
      },
    ],
  };
}

describe('htech receipts', () => {
  it('saves a receipt, its group and barcode, then retrieves price history', async () => {
    const transaction_id = await htech_makeTransaction();
    await htech_app.handlers.htech_receipt_groups_save({
      id: 'cleaning',
      name: 'Cleaning',
      sort_order: 1,
    });
    await htech_app.handlers.htech_products_save({
      id: 'product-1',
      name: 'Soap 500 ml',
      brand: null,
      package_quantity: '500',
      package_unit: 'ml',
      default_group_id: 'cleaning',
      product_type_id: null,
    });
    await htech_app.handlers.htech_product_barcodes_save({
      id: 'barcode-1',
      product_id: 'product-1',
      code: '03012345678905',
      store: null,
    });
    expect(await htech_app.handlers.htech_receipt_groups_list()).toEqual([
      { id: 'cleaning', name: 'Cleaning', sort_order: 1 },
    ]);
    expect(await htech_app.handlers.htech_products_list()).toEqual([
      expect.objectContaining({ id: 'product-1', name: 'Soap 500 ml' }),
    ]);
    expect(await htech_app.handlers.htech_product_barcodes_list()).toEqual([
      expect.objectContaining({ code: '03012345678905' }),
    ]);

    const result = await htech_app.handlers.htech_receipts_save({
      ...htech_makeReceipt(transaction_id),
      document_name: 'carrefour.png',
      document_mime: 'image/png',
      document_base64: 'aGVsbG8=',
    });
    expect(result).toEqual({ id: 'receipt-1', difference_cents: 0 });
    const receipts = await htech_app.handlers.htech_receipts_for_transaction({
      transaction_id,
    });
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      document_name: 'carrefour.png',
      document_mime: 'image/png',
      document_base64: 'aGVsbG8=',
    });
    expect(receipts[0].lines[0]).toMatchObject({
      printed_name: 'SAVON 500ML',
      group_id: 'cleaning',
      barcode: '03012345678905',
      paid_cents: 500,
    });
    expect(await htech_app.handlers.htech_receipts_items_list()).toEqual([
      expect.objectContaining({
        id: 'line-1',
        transaction_id,
        printed_name: 'SAVON 500ML',
        product_name: 'Soap 500 ml',
        group_name: 'Cleaning',
        barcode: '03012345678905',
        paid_cents: 500,
      }),
    ]);
    expect(
      Object.hasOwn(
        (await htech_app.handlers.htech_receipts_items_list())[0],
        'document_base64',
      ),
    ).toBe(false);
    expect(
      await htech_app.handlers.htech_receipts_product_history({
        product_id: 'product-1',
      }),
    ).toEqual([
      expect.objectContaining({ store: 'Carrefour', paid_cents: 500 }),
    ]);
    expect(
      await db.first<{ code: string }>(
        'SELECT code FROM htech_product_barcodes WHERE id = ?',
        ['barcode-1'],
      ),
    ).toEqual({ code: '03012345678905' });

    const receiptWithoutPrintedBarcode = htech_makeReceipt(transaction_id);
    receiptWithoutPrintedBarcode.lines[0].barcode = null;
    await htech_app.handlers.htech_receipts_save(receiptWithoutPrintedBarcode);
    expect(
      (await htech_app.handlers.htech_receipts_items_list())[0].barcode,
    ).toBe('03012345678905');
  });

  it('rejects unbalanced receipts without saving anything', async () => {
    const transaction_id = await htech_makeTransaction();
    const receipt = htech_makeReceipt(transaction_id);
    receipt.lines[0].product_id = null;
    receipt.lines[0].group_id = null;
    receipt.lines[0].paid_cents = 400;
    await expect(
      htech_app.handlers.htech_receipts_save(receipt),
    ).rejects.toThrow('Receipt lines do not add up');
    expect(
      await htech_app.handlers.htech_receipts_for_transaction({
        transaction_id,
      }),
    ).toEqual([]);
  });

  it('assigns a product type to existing purchases without changing their prices', async () => {
    const transaction_id = await htech_makeTransaction();
    await htech_app.handlers.htech_products_save({
      id: 'product-1',
      name: 'Organic olive oil, 75 cl',
      brand: null,
      package_quantity: '75',
      package_unit: 'cl',
      default_group_id: null,
      product_type_id: null,
    });
    const receipt = htech_makeReceipt(transaction_id);
    receipt.lines[0].group_id = null;
    await htech_app.handlers.htech_receipts_save(receipt);

    const type = await htech_app.handlers.htech_product_types_create({
      name: 'Olive oil',
    });
    await htech_app.handlers.htech_products_assign_type({
      product_id: 'product-1',
      product_type_id: type.id,
    });
    expect(await htech_app.handlers.htech_receipts_items_list()).toEqual([
      expect.objectContaining({
        product_id: 'product-1',
        product_type_id: type.id,
        product_type_name: 'Olive oil',
        paid_cents: 500,
      }),
    ]);
    await expect(
      htech_app.handlers.htech_product_types_create({ name: 'olive oil' }),
    ).rejects.toThrow('already exists');
    await expect(
      htech_app.handlers.htech_products_assign_type({
        product_id: 'product-1',
        product_type_id: 'missing',
      }),
    ).rejects.toThrow('does not exist');
  });

  it('replaces lines without duplicating a retried receipt', async () => {
    const transaction_id = await htech_makeTransaction();
    const receipt = htech_makeReceipt(transaction_id);
    receipt.lines[0].product_id = null;
    receipt.lines[0].group_id = null;
    await htech_app.handlers.htech_receipts_save(receipt);
    await htech_app.handlers.htech_receipts_save(receipt);
    expect(
      (
        await htech_app.handlers.htech_receipts_for_transaction({
          transaction_id,
        })
      )[0].lines,
    ).toHaveLength(1);

    receipt.lines[0].id = 'line-2';
    await htech_app.handlers.htech_receipts_save(receipt);
    expect(
      (
        await htech_app.handlers.htech_receipts_for_transaction({
          transaction_id,
        })
      )[0].lines,
    ).toEqual([expect.objectContaining({ id: 'line-2' })]);
  });

  it('deletes a receipt while leaving the budget transaction intact', async () => {
    const transaction_id = await htech_makeTransaction();
    const receipt = htech_makeReceipt(transaction_id);
    receipt.lines[0].product_id = null;
    receipt.lines[0].group_id = null;
    await htech_app.handlers.htech_receipts_save(receipt);

    await htech_app.handlers.htech_receipts_delete({ id: receipt.id });
    expect(
      await htech_app.handlers.htech_receipts_for_transaction({
        transaction_id,
      }),
    ).toEqual([]);
    expect(
      await db.first<{ id: string }>(
        'SELECT id FROM transactions WHERE id = ? AND tombstone = 0',
        [transaction_id],
      ),
    ).toEqual({ id: transaction_id });
  });
});
