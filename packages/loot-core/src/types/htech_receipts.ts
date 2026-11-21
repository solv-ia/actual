export type htech_ReceiptGroup = {
  id: string;
  name: string;
  sort_order: number;
};

export type htech_Product = {
  id: string;
  name: string;
  brand: string | null;
  package_quantity: string | null;
  package_unit: string | null;
  default_group_id: string | null;
};

export type htech_ProductBarcode = {
  id: string;
  product_id: string;
  code: string;
  store: string | null;
};

export type htech_ReceiptLine = {
  id: string;
  receipt_id: string;
  position: number;
  kind: 'item' | 'adjustment';
  printed_name: string;
  product_id: string | null;
  group_id: string | null;
  barcode: string | null;
  quantity: string | null;
  unit: string | null;
  unit_price_cents: number | null;
  discount_cents: number;
  paid_cents: number;
};

export type htech_Receipt = {
  id: string;
  transaction_id: string;
  store: string;
  purchased_at: string;
  total_cents: number;
  document_name: string | null;
  document_mime: string | null;
  document_base64: string | null;
  lines: htech_ReceiptLine[];
};

export type htech_PriceHistoryRow = Pick<
  htech_ReceiptLine,
  'id' | 'printed_name' | 'quantity' | 'unit' | 'paid_cents' | 'discount_cents'
> &
  Pick<htech_Receipt, 'store' | 'purchased_at'>;

export type htech_ItemPurchase = Pick<
  htech_ReceiptLine,
  | 'id'
  | 'receipt_id'
  | 'printed_name'
  | 'product_id'
  | 'group_id'
  | 'quantity'
  | 'unit'
  | 'unit_price_cents'
  | 'discount_cents'
  | 'paid_cents'
> &
  Pick<htech_Receipt, 'transaction_id' | 'store' | 'purchased_at'> & {
    product_name: string | null;
    group_name: string | null;
    barcode: string | null;
  };

export type htech_SaveReceipt = Omit<
  htech_Receipt,
  'lines' | 'document_name' | 'document_mime' | 'document_base64'
> & {
  document_name?: string | null;
  document_mime?: string | null;
  document_base64?: string | null;
  lines: Omit<htech_ReceiptLine, 'receipt_id' | 'position'>[];
};
