import type { htech_ItemPurchase } from '@actual-app/core/types/htech_receipts';

import {
  htech_emptyFilters,
  htech_filterAndSortItems,
} from './htech_itemFilters';

const purchases: htech_ItemPurchase[] = [
  {
    id: '1',
    receipt_id: 'r1',
    transaction_id: 't1',
    printed_name: 'PERSIL LESSIVE',
    product_id: 'p1',
    product_name: 'Persil detergent',
    product_type_id: 'detergent',
    product_type_name: 'Laundry detergent',
    group_id: 'cleaning',
    group_name: 'Cleaning',
    barcode: '123456',
    quantity: '1',
    unit: 'item',
    unit_price_cents: 1200,
    discount_cents: 200,
    paid_cents: 1000,
    store: 'Lidl',
    purchased_at: '2026-11-13',
  },
  {
    id: '2',
    receipt_id: 'r2',
    transaction_id: 't2',
    printed_name: 'PERSIL',
    product_id: 'p1',
    product_name: 'Persil detergent',
    product_type_id: 'detergent',
    product_type_name: 'Laundry detergent',
    group_id: 'cleaning',
    group_name: 'Cleaning',
    barcode: '123456',
    quantity: '1',
    unit: 'item',
    unit_price_cents: 1400,
    discount_cents: 0,
    paid_cents: 1400,
    store: 'Carrefour',
    purchased_at: '2026-10-01',
  },
  {
    id: '3',
    receipt_id: 'r1',
    transaction_id: 't1',
    printed_name: 'PASTA',
    product_id: 'p2',
    product_name: 'Pasta',
    product_type_id: 'pasta',
    product_type_name: 'Pasta',
    group_id: 'food',
    group_name: 'Food',
    barcode: null,
    quantity: '1',
    unit: 'item',
    unit_price_cents: 200,
    discount_cents: 0,
    paid_cents: 200,
    store: 'Lidl',
    purchased_at: '2026-11-13',
  },
];

describe('purchased item filters', () => {
  it('combines store, group, date, price, barcode and discount filters', () => {
    const result = htech_filterAndSortItems(
      purchases,
      {
        ...htech_emptyFilters,
        search: 'persil',
        store: 'Lidl',
        group: 'cleaning',
        productType: 'detergent',
        barcode: '345',
        fromDate: '2026-11-01',
        toDate: '2026-11-30',
        minPaid: '9.00',
        maxPaid: '11.00',
        discountedOnly: true,
      },
      'newest',
    );
    expect(result.map(item => item.id)).toEqual(['1']);
  });

  it('filters by product type across store-specific products', () => {
    expect(
      htech_filterAndSortItems(
        purchases,
        { ...htech_emptyFilters, productType: 'detergent' },
        'newest',
      ).map(item => item.id),
    ).toEqual(['1', '2']);
  });

  it('orders prices across stores without changing the input list', () => {
    expect(
      htech_filterAndSortItems(purchases, htech_emptyFilters, 'paid-asc').map(
        item => item.id,
      ),
    ).toEqual(['3', '1', '2']);
    expect(purchases.map(item => item.id)).toEqual(['1', '2', '3']);
  });
});
