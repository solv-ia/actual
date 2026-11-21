BEGIN TRANSACTION;

CREATE TABLE htech_receipt_groups (
  id TEXT PRIMARY KEY,
  name TEXT,
  sort_order INTEGER DEFAULT 0,
  tombstone INTEGER DEFAULT 0
);

CREATE TABLE htech_products (
  id TEXT PRIMARY KEY,
  name TEXT,
  brand TEXT,
  package_quantity TEXT,
  package_unit TEXT,
  default_group_id TEXT,
  tombstone INTEGER DEFAULT 0
);

CREATE TABLE htech_product_barcodes (
  id TEXT PRIMARY KEY,
  product_id TEXT,
  code TEXT,
  store TEXT,
  tombstone INTEGER DEFAULT 0
);

CREATE TABLE htech_receipts (
  id TEXT PRIMARY KEY,
  transaction_id TEXT,
  store TEXT,
  purchased_at TEXT,
  total_cents INTEGER,
  document_name TEXT,
  document_mime TEXT,
  document_base64 TEXT,
  tombstone INTEGER DEFAULT 0
);

CREATE TABLE htech_receipt_lines (
  id TEXT PRIMARY KEY,
  receipt_id TEXT,
  position INTEGER,
  kind TEXT,
  printed_name TEXT,
  product_id TEXT,
  group_id TEXT,
  barcode TEXT,
  quantity TEXT,
  unit TEXT,
  unit_price_cents INTEGER,
  discount_cents INTEGER DEFAULT 0,
  paid_cents INTEGER,
  tombstone INTEGER DEFAULT 0
);

CREATE INDEX htech_receipts_transaction ON htech_receipts(transaction_id, tombstone);
CREATE INDEX htech_receipt_lines_receipt ON htech_receipt_lines(receipt_id, position, tombstone);
CREATE INDEX htech_receipt_lines_product ON htech_receipt_lines(product_id, tombstone);
CREATE INDEX htech_receipt_lines_group ON htech_receipt_lines(group_id, tombstone);
CREATE INDEX htech_product_barcodes_code ON htech_product_barcodes(code, store, tombstone);

COMMIT;
