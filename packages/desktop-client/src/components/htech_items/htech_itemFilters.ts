import type { htech_ItemPurchase } from '@actual-app/core/types/htech_receipts';

export type htech_ItemFilters = {
  search: string;
  store: string;
  group: string;
  productType: string;
  barcode: string;
  fromDate: string;
  toDate: string;
  minPaid: string;
  maxPaid: string;
  discountedOnly: boolean;
};

export type htech_ItemSort =
  | 'newest'
  | 'oldest'
  | 'item-asc'
  | 'store-asc'
  | 'paid-desc'
  | 'paid-asc'
  | 'discount-desc';

export const htech_emptyFilters: htech_ItemFilters = {
  search: '',
  store: '',
  group: '',
  productType: '',
  barcode: '',
  fromDate: '',
  toDate: '',
  minPaid: '',
  maxPaid: '',
  discountedOnly: false,
};

function htech_moneyToCents(value: string): number | null {
  if (!value.trim()) return null;
  const amount = Number(value.replace(',', '.'));
  return Number.isFinite(amount) && amount >= 0
    ? Math.round(amount * 100)
    : null;
}

export function htech_filterAndSortItems(
  items: htech_ItemPurchase[],
  filters: htech_ItemFilters,
  sort: htech_ItemSort,
): htech_ItemPurchase[] {
  const search = filters.search.trim().toLocaleLowerCase();
  const barcode = filters.barcode.trim();
  const minPaid = htech_moneyToCents(filters.minPaid);
  const maxPaid = htech_moneyToCents(filters.maxPaid);

  return items
    .filter(item => {
      if (
        search &&
        ![
          item.printed_name,
          item.product_name,
          item.product_type_name,
          item.store,
          item.barcode,
        ].some(value => value?.toLocaleLowerCase().includes(search))
      ) {
        return false;
      }
      if (filters.store && item.store !== filters.store) return false;
      if (filters.group && item.group_id !== filters.group) return false;
      if (
        filters.productType === '__unassigned__' &&
        item.product_type_id !== null
      ) {
        return false;
      }
      if (
        filters.productType &&
        filters.productType !== '__unassigned__' &&
        item.product_type_id !== filters.productType
      ) {
        return false;
      }
      if (barcode && !item.barcode?.includes(barcode)) return false;
      if (filters.fromDate && item.purchased_at < filters.fromDate) {
        return false;
      }
      if (filters.toDate && item.purchased_at > filters.toDate) return false;
      if (minPaid !== null && item.paid_cents < minPaid) return false;
      if (maxPaid !== null && item.paid_cents > maxPaid) return false;
      if (filters.discountedOnly && item.discount_cents <= 0) return false;
      return true;
    })
    .sort((left, right) => {
      let comparison = 0;
      switch (sort) {
        case 'newest':
          comparison = right.purchased_at.localeCompare(left.purchased_at);
          break;
        case 'oldest':
          comparison = left.purchased_at.localeCompare(right.purchased_at);
          break;
        case 'item-asc':
          comparison = left.printed_name.localeCompare(right.printed_name);
          break;
        case 'store-asc':
          comparison = left.store.localeCompare(right.store);
          break;
        case 'paid-desc':
          comparison = right.paid_cents - left.paid_cents;
          break;
        case 'paid-asc':
          comparison = left.paid_cents - right.paid_cents;
          break;
        case 'discount-desc':
          comparison = right.discount_cents - left.discount_cents;
          break;
        default:
          comparison = 0;
      }
      return comparison || right.purchased_at.localeCompare(left.purchased_at);
    });
}
