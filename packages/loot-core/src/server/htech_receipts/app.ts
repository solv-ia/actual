import { createApp } from '#server/app';
import * as db from '#server/db';
import { mutator } from '#server/mutators';
import { batchMessages } from '#server/sync';
import type {
  htech_ItemPurchase,
  htech_PriceHistoryRow,
  htech_Product,
  htech_ProductBarcode,
  htech_Receipt,
  htech_ReceiptGroup,
  htech_ReceiptLine,
  htech_SaveReceipt,
} from '#types/htech_receipts';

type htech_ReceiptRow = Omit<htech_Receipt, 'lines'>;
export type htech_ReceiptHandlers = {
  htech_receipts_items_list: typeof htech_receipts_items_list;
  htech_receipt_groups_list: typeof htech_receipt_groups_list;
  htech_receipt_groups_save: typeof htech_receipt_groups_save;
  htech_products_list: typeof htech_products_list;
  htech_products_save: typeof htech_products_save;
  htech_product_barcodes_list: typeof htech_product_barcodes_list;
  htech_product_barcodes_save: typeof htech_product_barcodes_save;
  htech_receipts_save: typeof htech_receipts_save;
  htech_receipts_delete: typeof htech_receipts_delete;
  htech_receipts_for_transaction: typeof htech_receipts_for_transaction;
  htech_receipts_product_history: typeof htech_receipts_product_history;
};

export const htech_app = createApp<htech_ReceiptHandlers>();
htech_app.method('htech_receipts_items_list', htech_receipts_items_list);
htech_app.method('htech_receipt_groups_list', htech_receipt_groups_list);
htech_app.method(
  'htech_receipt_groups_save',
  mutator(htech_receipt_groups_save),
);
htech_app.method('htech_products_list', htech_products_list);
htech_app.method('htech_products_save', mutator(htech_products_save));
htech_app.method('htech_product_barcodes_list', htech_product_barcodes_list);
htech_app.method(
  'htech_product_barcodes_save',
  mutator(htech_product_barcodes_save),
);
htech_app.method('htech_receipts_save', mutator(htech_receipts_save));
htech_app.method('htech_receipts_delete', mutator(htech_receipts_delete));
htech_app.method(
  'htech_receipts_for_transaction',
  htech_receipts_for_transaction,
);
htech_app.method(
  'htech_receipts_product_history',
  htech_receipts_product_history,
);

function htech_requireText(value: string, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  return trimmed;
}

function htech_requireCents(value: number, field: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${field} must be an integer number of cents`);
  }
}

async function htech_receipts_items_list(): Promise<htech_ItemPurchase[]> {
  return db.all<htech_ItemPurchase>(
    `SELECT l.id, l.receipt_id, r.transaction_id, l.printed_name, l.product_id,
            p.name AS product_name, l.group_id, g.name AS group_name,
            COALESCE(l.barcode, (
              SELECT b.code FROM htech_product_barcodes b
              WHERE b.product_id = l.product_id AND b.tombstone = 0
                AND (b.store IS NULL OR b.store = r.store)
              ORDER BY b.store IS NULL, b.id
              LIMIT 1
            )) AS barcode,
            l.quantity, l.unit, l.unit_price_cents, l.discount_cents,
            l.paid_cents, r.store, r.purchased_at
       FROM htech_receipt_lines l
       JOIN htech_receipts r ON r.id = l.receipt_id AND r.tombstone = 0
       JOIN transactions t ON t.id = r.transaction_id AND t.tombstone = 0
       LEFT JOIN htech_products p ON p.id = l.product_id AND p.tombstone = 0
       LEFT JOIN htech_receipt_groups g ON g.id = l.group_id AND g.tombstone = 0
      WHERE l.tombstone = 0 AND l.kind = 'item'
      ORDER BY r.purchased_at DESC, r.id, l.position, l.id`,
  );
}

async function htech_receipt_groups_list(): Promise<htech_ReceiptGroup[]> {
  return db.all<htech_ReceiptGroup>(
    'SELECT id, name, sort_order FROM htech_receipt_groups WHERE tombstone = 0 ORDER BY sort_order, name',
  );
}

async function htech_receipt_groups_save(
  group: htech_ReceiptGroup,
): Promise<string> {
  htech_requireText(group.id, 'group.id');
  htech_requireText(group.name, 'group.name');
  await db.update('htech_receipt_groups', { ...group, tombstone: 0 });
  return group.id;
}

async function htech_products_list(): Promise<htech_Product[]> {
  return db.all<htech_Product>(
    `SELECT id, name, brand, package_quantity, package_unit, default_group_id
       FROM htech_products WHERE tombstone = 0 ORDER BY name, id`,
  );
}

async function htech_products_save(product: htech_Product): Promise<string> {
  htech_requireText(product.id, 'product.id');
  htech_requireText(product.name, 'product.name');
  if (product.default_group_id) {
    const group = await db.first<{ id: string }>(
      'SELECT id FROM htech_receipt_groups WHERE id = ? AND tombstone = 0',
      [product.default_group_id],
    );
    if (!group) {
      throw new Error('Product group does not exist');
    }
  }
  await db.update('htech_products', { ...product, tombstone: 0 });
  return product.id;
}

async function htech_product_barcodes_save(
  barcode: htech_ProductBarcode,
): Promise<string> {
  htech_requireText(barcode.id, 'barcode.id');
  htech_requireText(barcode.code, 'barcode.code');
  const product = await db.first<{ id: string }>(
    'SELECT id FROM htech_products WHERE id = ? AND tombstone = 0',
    [barcode.product_id],
  );
  if (!product) {
    throw new Error('Barcode product does not exist');
  }
  const conflicting = await db.first<{ id: string }>(
    'SELECT id FROM htech_product_barcodes WHERE code = ? AND store IS ? AND id != ? AND tombstone = 0',
    [barcode.code, barcode.store, barcode.id],
  );
  if (conflicting) {
    throw new Error('Barcode already belongs to another product');
  }
  await db.update('htech_product_barcodes', { ...barcode, tombstone: 0 });
  return barcode.id;
}

async function htech_product_barcodes_list(): Promise<htech_ProductBarcode[]> {
  return db.all<htech_ProductBarcode>(
    `SELECT id, product_id, code, store FROM htech_product_barcodes
      WHERE tombstone = 0 ORDER BY code, store, id`,
  );
}

async function htech_receipts_save(receipt: htech_SaveReceipt): Promise<{
  id: string;
  difference_cents: number;
}> {
  htech_requireText(receipt.id, 'receipt.id');
  htech_requireText(receipt.store, 'receipt.store');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receipt.purchased_at)) {
    throw new Error('purchased_at must be YYYY-MM-DD');
  }
  if (Number.isNaN(Date.parse(`${receipt.purchased_at}T00:00:00Z`))) {
    throw new Error('purchased_at is not a valid date');
  }
  htech_requireCents(receipt.total_cents, 'total_cents');
  if (receipt.total_cents < 0) {
    throw new Error('Receipt total cannot be negative');
  }
  if (receipt.lines.length === 0) {
    throw new Error('Receipt must have at least one line');
  }
  const transaction = await db.first<{ id: string; amount: number }>(
    'SELECT id, amount FROM transactions WHERE id = ? AND tombstone = 0',
    [receipt.transaction_id],
  );
  if (!transaction) {
    throw new Error('Transaction does not exist');
  }
  if (receipt.document_base64 != null) {
    if (
      !receipt.document_mime ||
      !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(
        receipt.document_mime,
      )
    ) {
      throw new Error('Unsupported receipt document type');
    }
    if (
      !/^[A-Za-z0-9+/]*={0,2}$/.test(receipt.document_base64) ||
      receipt.document_base64.length > 7_000_000
    ) {
      throw new Error('Receipt document must be valid base64 and at most 5 MB');
    }
  }

  const seenIds = new Set<string>();
  const groupIds = new Set<string>();
  const productIds = new Set<string>();
  let linesTotal = 0;
  for (const line of receipt.lines) {
    htech_requireText(line.id, 'line.id');
    htech_requireText(line.printed_name, 'line.printed_name');
    htech_requireCents(line.paid_cents, 'line.paid_cents');
    htech_requireCents(line.discount_cents, 'line.discount_cents');
    if (line.discount_cents < 0) {
      throw new Error('discount_cents cannot be negative');
    }
    if (line.unit_price_cents != null) {
      htech_requireCents(line.unit_price_cents, 'line.unit_price_cents');
    }
    if (line.kind !== 'item' && line.kind !== 'adjustment') {
      throw new Error('Invalid receipt line kind');
    }
    if (line.kind === 'item' && line.paid_cents < 0) {
      throw new Error('Item amount cannot be negative');
    }
    if (seenIds.has(line.id)) {
      throw new Error('Duplicate receipt line ID');
    }
    seenIds.add(line.id);
    if (line.group_id) groupIds.add(line.group_id);
    if (line.product_id) productIds.add(line.product_id);
    linesTotal += line.paid_cents;
  }
  if (linesTotal !== receipt.total_cents) {
    throw new Error('Receipt lines do not add up to receipt total');
  }

  for (const id of groupIds) {
    if (
      !(await db.first(
        'SELECT id FROM htech_receipt_groups WHERE id = ? AND tombstone = 0',
        [id],
      ))
    ) {
      throw new Error(`Receipt group does not exist: ${id}`);
    }
  }
  for (const id of productIds) {
    if (
      !(await db.first(
        'SELECT id FROM htech_products WHERE id = ? AND tombstone = 0',
        [id],
      ))
    ) {
      throw new Error(`Receipt product does not exist: ${id}`);
    }
  }
  for (const id of seenIds) {
    const existing = await db.first<{ receipt_id: string }>(
      'SELECT receipt_id FROM htech_receipt_lines WHERE id = ?',
      [id],
    );
    if (existing && existing.receipt_id !== receipt.id) {
      throw new Error(`Receipt line ID belongs to another receipt: ${id}`);
    }
  }

  const oldLines = await db.all<{ id: string }>(
    'SELECT id FROM htech_receipt_lines WHERE receipt_id = ? AND tombstone = 0',
    [receipt.id],
  );
  await batchMessages(async () => {
    const { lines, ...fields } = receipt;
    await db.update('htech_receipts', { ...fields, tombstone: 0 });
    for (const oldLine of oldLines) {
      if (!seenIds.has(oldLine.id)) {
        await db.delete_('htech_receipt_lines', oldLine.id);
      }
    }
    for (const [position, line] of lines.entries()) {
      await db.update('htech_receipt_lines', {
        ...line,
        receipt_id: receipt.id,
        position,
        tombstone: 0,
      });
    }
  });

  return {
    id: receipt.id,
    difference_cents: receipt.total_cents - Math.abs(transaction.amount),
  };
}

async function htech_receipts_delete({ id }: { id: string }): Promise<void> {
  const receipt = await db.first<{ id: string }>(
    'SELECT id FROM htech_receipts WHERE id = ? AND tombstone = 0',
    [id],
  );
  if (!receipt) {
    throw new Error('Receipt does not exist');
  }
  const lines = await db.all<{ id: string }>(
    'SELECT id FROM htech_receipt_lines WHERE receipt_id = ? AND tombstone = 0',
    [id],
  );
  await batchMessages(async () => {
    await db.delete_('htech_receipts', id);
    for (const line of lines) {
      await db.delete_('htech_receipt_lines', line.id);
    }
  });
}

async function htech_receipts_for_transaction({
  transaction_id,
}: {
  transaction_id: string;
}): Promise<htech_Receipt[]> {
  const receipts = await db.all<htech_ReceiptRow>(
    `SELECT id, transaction_id, store, purchased_at, total_cents, document_name, document_mime, document_base64
       FROM htech_receipts WHERE transaction_id = ? AND tombstone = 0 ORDER BY purchased_at DESC, id`,
    [transaction_id],
  );
  return Promise.all(
    receipts.map(async receipt => ({
      ...receipt,
      lines: await db.all<htech_ReceiptLine>(
        `SELECT id, receipt_id, position, kind, printed_name, product_id, group_id, barcode,
              quantity, unit, unit_price_cents, discount_cents, paid_cents
         FROM htech_receipt_lines WHERE receipt_id = ? AND tombstone = 0 ORDER BY position, id`,
        [receipt.id],
      ),
    })),
  );
}

async function htech_receipts_product_history({
  product_id,
}: {
  product_id: string;
}): Promise<htech_PriceHistoryRow[]> {
  return db.all<htech_PriceHistoryRow>(
    `SELECT l.id, l.printed_name, l.quantity, l.unit, l.paid_cents, l.discount_cents,
            r.store, r.purchased_at
       FROM htech_receipt_lines l JOIN htech_receipts r ON r.id = l.receipt_id
      WHERE l.product_id = ? AND l.kind = 'item' AND l.tombstone = 0 AND r.tombstone = 0
      ORDER BY r.purchased_at DESC, l.id`,
    [product_id],
  );
}
