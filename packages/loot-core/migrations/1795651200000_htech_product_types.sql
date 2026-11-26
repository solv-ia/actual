BEGIN TRANSACTION;

CREATE TABLE htech_product_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  tombstone INTEGER DEFAULT 0
);

ALTER TABLE htech_products ADD COLUMN product_type_id TEXT;

CREATE INDEX htech_products_product_type ON htech_products(product_type_id, tombstone);

COMMIT;
