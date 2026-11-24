import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import type * as HtechApiModule from '../packages/api/index';

type HtechApi = typeof HtechApiModule;

type HtechLineInput = {
  printed_name: string;
  product_name?: string;
  analysis_group?: string;
  kind?: 'item' | 'adjustment';
  barcode?: string;
  quantity?: string;
  unit?: string;
  unit_price_cents?: number;
  discount_cents?: number;
  paid_cents: number;
};

type HtechSaveInput = {
  transaction_id: string;
  store: string;
  purchased_at: string;
  total_cents: number;
  document_path: string;
  lines: HtechLineInput[];
};

type HtechMatchInput = {
  purchased_at: string;
  total_cents: number;
  merchant_hint?: string;
  account_id?: string;
  days_window?: number;
};

type HtechReadInput = { transaction_id: string };

type HtechTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const htechText = { type: 'string', minLength: 1 };
const htechCents = { type: 'integer', minimum: 0 };

export const htechTools: HtechTool[] = [
  {
    name: 'htech_find_receipt_transaction',
    description:
      'Find live Actual transactions for a receipt by payment amount and purchase date. Returns candidates and a match only when one candidate also fits the merchant. Read-only; use this before saving a receipt.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        purchased_at: {
          ...htechText,
          description: 'Receipt date, YYYY-MM-DD.',
        },
        total_cents: {
          ...htechCents,
          description: 'Positive receipt total in cents.',
        },
        merchant_hint: {
          type: 'string',
          description: 'Store or merchant name printed on the receipt.',
        },
        account_id: {
          type: 'string',
          description: 'Optional Actual account ID to narrow the search.',
        },
        days_window: {
          type: 'integer',
          minimum: 0,
          maximum: 7,
          description: 'Days before and after the receipt date; default 3.',
        },
      },
      required: ['purchased_at', 'total_cents'],
    },
  },
  {
    name: 'htech_save_receipt',
    description:
      'Save a receipt, its original PDF/image, analysis groups, products, optional barcodes, and item lines to an existing live transaction. Requires a unique transaction ID found first. Rejects amount mismatches and duplicate receipts. Does not change the transaction or its budget category.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        transaction_id: htechText,
        store: htechText,
        purchased_at: {
          ...htechText,
          description: 'Receipt date, YYYY-MM-DD.',
        },
        total_cents: htechCents,
        document_path: {
          ...htechText,
          description:
            'Absolute local path to the original PDF, JPEG, PNG, or WebP receipt, at most 5 MB.',
        },
        lines: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              printed_name: htechText,
              product_name: {
                type: 'string',
                description:
                  'Canonical product name for cross-store price history; defaults to printed_name.',
              },
              analysis_group: {
                type: 'string',
                description:
                  'Analysis group such as Food, Cleaning, or Toiletries.',
              },
              kind: { type: 'string', enum: ['item', 'adjustment'] },
              barcode: {
                type: 'string',
                description: 'Printed barcode, if known; leave out otherwise.',
              },
              quantity: { type: 'string' },
              unit: { type: 'string' },
              unit_price_cents: htechCents,
              discount_cents: htechCents,
              paid_cents: {
                type: 'integer',
                description:
                  'Net amount paid for this line in cents; negative only for adjustments.',
              },
            },
            required: ['printed_name', 'paid_cents'],
          },
        },
      },
      required: [
        'transaction_id',
        'store',
        'purchased_at',
        'total_cents',
        'document_path',
        'lines',
      ],
    },
  },
  {
    name: 'htech_get_receipts',
    description:
      'Read the receipts and item lines linked to a live Actual transaction, including analysis groups and document metadata. Omits document base64 to keep the response concise.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { transaction_id: htechText },
      required: ['transaction_id'],
    },
  },
];

const htechRequire = createRequire(import.meta.url);
let htechQueue: Promise<unknown> = Promise.resolve();

function htechRequireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function htechRequireDate(value: unknown): string {
  const date = htechRequireText(value, 'purchased_at');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00Z`))
  ) {
    throw new Error('purchased_at must be a valid YYYY-MM-DD date');
  }
  return date;
}

function htechRequireCents(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${field} must be a nonnegative integer number of cents`);
  }
  return Number(value);
}

function htechNormalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function htechDateOffset(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function htechWithBudget<T>(
  operation: (api: HtechApi) => Promise<T>,
): Promise<T> {
  const run = async () => {
    const apiEntry = htechRequireText(
      process.env.HTECH_ACTUAL_API_ENTRY,
      'HTECH_ACTUAL_API_ENTRY',
    );
    const serverURL = htechRequireText(
      process.env.ACTUAL_SERVER_URL,
      'ACTUAL_SERVER_URL',
    );
    const password = htechRequireText(
      process.env.ACTUAL_PASSWORD,
      'ACTUAL_PASSWORD',
    );
    const syncId = htechRequireText(
      process.env.ACTUAL_BUDGET_SYNC_ID,
      'ACTUAL_BUDGET_SYNC_ID',
    );
    const baseDir = htechRequireText(
      process.env.MCP_BRIDGE_DATA_DIR,
      'MCP_BRIDGE_DATA_DIR',
    );
    const dataDir = path.join(baseDir, 'htech');
    await mkdir(dataDir, { recursive: true });
    const api = htechRequire(apiEntry) as HtechApi;
    try {
      await api.init({ dataDir, serverURL, password });
      const budgets = await api.getBudgets();
      const local = budgets.find(
        budget => budget.groupId === syncId && typeof budget.id === 'string',
      );
      if (local?.id) await api.loadBudget(local.id);
      else await api.downloadBudget(syncId);
      if (!api.internal) throw new Error('Actual budget did not open');
      await api.internal.send('sync');
      return await operation(api);
    } finally {
      await api.shutdown();
    }
  };
  const result = htechQueue.then(run, run);
  htechQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function htechFindTransaction(input: HtechMatchInput) {
  const date = htechRequireDate(input.purchased_at);
  const total = htechRequireCents(input.total_cents, 'total_cents');
  const days = input.days_window ?? 3;
  if (!Number.isInteger(days) || days < 0 || days > 7) {
    throw new Error('days_window must be 0 to 7');
  }
  const merchant = htechNormalize(input.merchant_hint ?? '');
  return htechWithBudget(async api => {
    const accounts = (await api.getAccounts()).filter(
      account => !account.closed,
    );
    const selected = input.account_id
      ? accounts.filter(account => account.id === input.account_id)
      : accounts;
    if (input.account_id && selected.length === 0) {
      throw new Error('account_id was not found');
    }
    const candidates = [];
    for (const account of selected) {
      const transactions = await api.getTransactions(
        account.id,
        htechDateOffset(date, -days),
        htechDateOffset(date, days),
      );
      for (const row of transactions) {
        if (row.amount !== -total || row.is_child || row.tombstone) continue;
        const payee = row.imported_payee ?? '';
        const merchantMatches =
          !merchant ||
          htechNormalize(`${payee} ${row.notes ?? ''}`).includes(merchant);
        candidates.push({
          id: row.id,
          date: row.date,
          amount_cents: row.amount,
          account_id: account.id,
          account_name: account.name,
          payee,
          notes: row.notes,
          merchant_matches: merchantMatches,
        });
      }
    }
    candidates.sort(
      (a, b) =>
        Number(b.merchant_matches) - Number(a.merchant_matches) ||
        Math.abs(
          Date.parse(`${a.date}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`),
        ) -
          Math.abs(
            Date.parse(`${b.date}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`),
          ),
    );
    return {
      match:
        candidates.length === 1 && candidates[0].merchant_matches
          ? candidates[0]
          : null,
      candidates,
    };
  });
}

async function htechReadReceipts(input: HtechReadInput) {
  const transactionId = htechRequireText(
    input.transaction_id,
    'transaction_id',
  );
  return htechWithBudget(async api => {
    const [receipts, groups] = await Promise.all([
      api.htech_getReceiptsForTransaction(transactionId),
      api.htech_getReceiptGroups(),
    ]);
    const groupNames = new Map(groups.map(group => [group.id, group.name]));
    return {
      transaction_id: transactionId,
      receipts: receipts.map(receipt => ({
        id: receipt.id,
        store: receipt.store,
        purchased_at: receipt.purchased_at,
        total_cents: receipt.total_cents,
        document_name: receipt.document_name,
        document_mime: receipt.document_mime,
        lines: receipt.lines.map(line => ({
          id: line.id,
          position: line.position,
          kind: line.kind,
          printed_name: line.printed_name,
          product_id: line.product_id,
          analysis_group: line.group_id
            ? (groupNames.get(line.group_id) ?? null)
            : null,
          barcode: line.barcode,
          quantity: line.quantity,
          unit: line.unit,
          unit_price_cents: line.unit_price_cents,
          discount_cents: line.discount_cents,
          paid_cents: line.paid_cents,
        })),
      })),
    };
  });
}

async function htechReadDocument(documentPath: string) {
  if (!path.isAbsolute(documentPath)) {
    throw new Error('document_path must be absolute');
  }
  const file = await stat(documentPath);
  if (!file.isFile() || file.size > 5_000_000) {
    throw new Error('Receipt document must be a file of at most 5 MB');
  }
  const bytes = await readFile(documentPath);
  const isPdf = bytes.subarray(0, 5).toString() === '%PDF-';
  const isPng = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp =
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP';
  const mime = isPdf
    ? 'application/pdf'
    : isPng
      ? 'image/png'
      : isJpeg
        ? 'image/jpeg'
        : isWebp
          ? 'image/webp'
          : null;
  if (!mime) {
    throw new Error('Receipt document must be a PDF, JPEG, PNG, or WebP file');
  }
  return {
    name: path.basename(documentPath),
    mime,
    base64: bytes.toString('base64'),
  };
}

async function htechSaveReceipt(input: HtechSaveInput) {
  const transactionId = htechRequireText(
    input.transaction_id,
    'transaction_id',
  );
  const store = htechRequireText(input.store, 'store');
  const purchasedAt = htechRequireDate(input.purchased_at);
  const total = htechRequireCents(input.total_cents, 'total_cents');
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new Error('lines must be a nonempty array');
  }
  const lines = input.lines.map((line, index) => {
    const kind = line.kind ?? 'item';
    if (kind !== 'item' && kind !== 'adjustment') {
      throw new Error(`lines[${index}].kind is invalid`);
    }
    const printedName = htechRequireText(
      line.printed_name,
      `lines[${index}].printed_name`,
    );
    if (
      !Number.isSafeInteger(line.paid_cents) ||
      (kind === 'item' && line.paid_cents < 0)
    ) {
      throw new Error(`lines[${index}].paid_cents is invalid`);
    }
    return {
      printedName,
      productName: htechRequireText(
        line.product_name || printedName,
        `lines[${index}].product_name`,
      ),
      groupName: line.analysis_group?.trim() || null,
      kind,
      barcode: line.barcode?.trim() || null,
      quantity: line.quantity?.trim() || null,
      unit: line.unit?.trim() || null,
      unitPrice:
        line.unit_price_cents == null
          ? null
          : htechRequireCents(
              line.unit_price_cents,
              `lines[${index}].unit_price_cents`,
            ),
      discount: htechRequireCents(
        line.discount_cents ?? 0,
        `lines[${index}].discount_cents`,
      ),
      paid: line.paid_cents,
    };
  });
  if (lines.reduce((sum, line) => sum + line.paid, 0) !== total) {
    throw new Error('Receipt lines do not add up to total_cents');
  }
  const document = await htechReadDocument(
    htechRequireText(input.document_path, 'document_path'),
  );
  return htechWithBudget(async api => {
    const accounts = await api.getAccounts();
    let matchedTransaction = null;
    for (const account of accounts) {
      const transactions = await api.getTransactions(
        account.id,
        htechDateOffset(purchasedAt, -7),
        htechDateOffset(purchasedAt, 7),
      );
      matchedTransaction = transactions.find(row => row.id === transactionId);
      if (matchedTransaction) break;
    }
    if (!matchedTransaction) {
      throw new Error(
        'transaction_id was not found within seven days of purchased_at',
      );
    }
    if (matchedTransaction.amount !== -total) {
      throw new Error('Receipt total does not match the transaction payment');
    }
    const existing = await api.htech_getReceiptsForTransaction(transactionId);
    const duplicate = existing.find(
      receipt =>
        receipt.store.toLowerCase() === store.toLowerCase() &&
        receipt.purchased_at === purchasedAt &&
        receipt.total_cents === total,
    );
    if (duplicate) {
      if (duplicate.document_base64 !== document.base64) {
        throw new Error(
          'A receipt with this store, date, and total already exists with a different document',
        );
      }
      return {
        created: false,
        receipt_id: duplicate.id,
        transaction_id: transactionId,
        total_cents: total,
        line_count: duplicate.lines.length,
      };
    }
    const groups = await api.htech_getReceiptGroups();
    const products = await api.htech_getProducts();
    const barcodes = await api.htech_getProductBarcodes();
    const savedLines = [];
    for (const line of lines) {
      let group = line.groupName
        ? groups.find(
            candidate =>
              htechNormalize(candidate.name) ===
              htechNormalize(line.groupName!),
          )
        : null;
      if (line.groupName && !group) {
        group = {
          id: randomUUID(),
          name: line.groupName,
          sort_order: groups.length,
        };
        await api.htech_saveReceiptGroup(group);
        groups.push(group);
      }
      let product = products.find(
        candidate =>
          htechNormalize(candidate.name) === htechNormalize(line.productName),
      );
      if (!product) {
        product = {
          id: randomUUID(),
          name: line.productName,
          brand: null,
          package_quantity: null,
          package_unit: null,
          default_group_id: group?.id ?? null,
        };
        await api.htech_saveProduct(product);
        products.push(product);
      }
      const existingBarcode = line.barcode
        ? barcodes.find(
            candidate =>
              candidate.code === line.barcode && candidate.store === null,
          )
        : null;
      if (existingBarcode && existingBarcode.product_id !== product.id) {
        throw new Error(
          `Barcode ${line.barcode} is already linked to a different product`,
        );
      }
      if (line.barcode && !existingBarcode) {
        const barcode = {
          id: randomUUID(),
          product_id: product.id,
          code: line.barcode,
          store: null,
        };
        await api.htech_saveProductBarcode(barcode);
        barcodes.push(barcode);
      }
      savedLines.push({
        id: randomUUID(),
        kind: line.kind,
        printed_name: line.printedName,
        product_id: product.id,
        group_id: group?.id ?? null,
        barcode: line.barcode,
        quantity: line.quantity,
        unit: line.unit,
        unit_price_cents: line.unitPrice,
        discount_cents: line.discount,
        paid_cents: line.paid,
      });
    }
    const receiptId = randomUUID();
    const result = await api.htech_saveReceipt({
      id: receiptId,
      transaction_id: transactionId,
      store,
      purchased_at: purchasedAt,
      total_cents: total,
      document_name: document.name,
      document_mime: document.mime,
      document_base64: document.base64,
      lines: savedLines,
    });
    if (result.difference_cents !== 0) {
      throw new Error('Saved receipt does not match the transaction payment');
    }
    if (!api.internal) throw new Error('Actual budget closed before sync');
    await api.internal.send('sync');
    const verified = await api.htech_getReceiptsForTransaction(transactionId);
    if (
      verified.find(receipt => receipt.id === receiptId)?.lines.length !==
      lines.length
    ) {
      throw new Error('Saved receipt could not be verified');
    }
    return {
      created: true,
      receipt_id: receiptId,
      transaction_id: transactionId,
      total_cents: total,
      line_count: lines.length,
      difference_cents: 0,
    };
  });
}

export async function htechCall(name: string, args: unknown): Promise<unknown> {
  const input =
    args && typeof args === 'object' && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};
  if (name === 'htech_find_receipt_transaction') {
    return htechFindTransaction(input as HtechMatchInput);
  }
  if (name === 'htech_save_receipt') {
    return htechSaveReceipt(input as HtechSaveInput);
  }
  if (name === 'htech_get_receipts') {
    return htechReadReceipts(input as HtechReadInput);
  }
  throw new Error(`Unknown htech tool: ${name}`);
}
