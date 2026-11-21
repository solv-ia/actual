import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import { integerToCurrency } from '@actual-app/core/shared/util';
import type { htech_ItemPurchase } from '@actual-app/core/types/htech_receipts';

import { FinancialText } from '#components/FinancialText';
import { Page } from '#components/Page';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

import {
  htech_emptyFilters,
  htech_filterAndSortItems,
} from './htech_itemFilters';
import type { htech_ItemFilters, htech_ItemSort } from './htech_itemFilters';

const htech_PAGE_SIZE = 50;

const htech_controlStyle = {
  minHeight: 32,
  padding: '5px 8px',
  border: `1px solid ${theme.formInputBorder}`,
  borderRadius: 4,
  color: theme.formInputText,
  backgroundColor: theme.formInputBackground,
};

const htech_cellStyle = {
  padding: '9px 12px',
  borderBottom: `1px solid ${theme.tableBorder}`,
};

function htech_selectOptions(items: htech_ItemPurchase[]) {
  const stores = [...new Set(items.map(item => item.store))].sort((a, b) =>
    a.localeCompare(b),
  );
  const groups = [
    ...new Map(
      items
        .filter(item => item.group_id && item.group_name)
        .map(item => [item.group_id, item.group_name] as const),
    ).entries(),
  ].sort((left, right) => (left[1] ?? '').localeCompare(right[1] ?? ''));
  return { stores, groups };
}

export function HtechItemsPage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [items, setItems] = useState<htech_ItemPurchase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [filters, setFilters] = useState<htech_ItemFilters>(htech_emptyFilters);
  const [sort, setSort] = useState<htech_ItemSort>('newest');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let active = true;
    send('htech_receipts_items_list')
      .then(nextItems => {
        if (active) {
          setItems(nextItems);
          setError(null);
        }
      })
      .catch(() => {
        if (active) setError(t('Could not load purchased items.'));
      });
    return () => {
      active = false;
    };
  }, [refresh, t]);

  const { stores, groups } = useMemo(
    () => htech_selectOptions(items ?? []),
    [items],
  );
  const filtered = useMemo(
    () => htech_filterAndSortItems(items ?? [], filters, sort),
    [items, filters, sort],
  );
  const lastPage = Math.max(
    0,
    Math.ceil(filtered.length / htech_PAGE_SIZE) - 1,
  );
  const visiblePage = Math.min(page, lastPage);
  const visibleItems = filtered.slice(
    visiblePage * htech_PAGE_SIZE,
    (visiblePage + 1) * htech_PAGE_SIZE,
  );

  function htech_changeFilter<K extends keyof htech_ItemFilters>(
    key: K,
    value: htech_ItemFilters[K],
  ) {
    setFilters(current => ({ ...current, [key]: value }));
    setPage(0);
  }

  return (
    <Page header={t('Purchased items')}>
      <View style={{ flex: 1, minHeight: 0, gap: 14, paddingTop: 16 }}>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <label style={{ display: 'grid', gap: 4, flex: '2 1 220px' }}>
            <Trans>Search items</Trans>
            <input
              aria-label={t('Search items')}
              placeholder={t('Name, product, store or barcode')}
              value={filters.search}
              onChange={event =>
                htech_changeFilter('search', event.target.value)
              }
              style={htech_controlStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, flex: '1 1 150px' }}>
            <Trans>Store</Trans>
            <select
              aria-label={t('Store')}
              value={filters.store}
              onChange={event =>
                htech_changeFilter('store', event.target.value)
              }
              style={htech_controlStyle}
            >
              <option value="">
                <Trans>All stores</Trans>
              </option>
              {stores.map(store => (
                <option key={store} value={store}>
                  {store}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, flex: '1 1 150px' }}>
            <Trans>Group</Trans>
            <select
              aria-label={t('Group')}
              value={filters.group}
              onChange={event =>
                htech_changeFilter('group', event.target.value)
              }
              style={htech_controlStyle}
            >
              <option value="">
                <Trans>All groups</Trans>
              </option>
              {groups.map(([id, name]) => (
                <option key={id} value={id ?? ''}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, flex: '1 1 170px' }}>
            <Trans>Order by</Trans>
            <select
              aria-label={t('Order by')}
              value={sort}
              onChange={event => setSort(event.target.value as htech_ItemSort)}
              style={htech_controlStyle}
            >
              <option value="newest">
                <Trans>Newest first</Trans>
              </option>
              <option value="oldest">
                <Trans>Oldest first</Trans>
              </option>
              <option value="item-asc">{t('Item A–Z')}</option>
              <option value="store-asc">{t('Store A–Z')}</option>
              <option value="paid-desc">
                <Trans>Highest paid first</Trans>
              </option>
              <option value="paid-asc">
                <Trans>Lowest paid first</Trans>
              </option>
              <option value="discount-desc">
                <Trans>Largest discount first</Trans>
              </option>
            </select>
          </label>
        </View>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <Button
            variant="bare"
            onPress={() => setShowAdvanced(current => !current)}
          >
            {showAdvanced ? t('Hide advanced filters') : t('Advanced filters')}
          </Button>
          <Button
            variant="bare"
            onPress={() => {
              setFilters(htech_emptyFilters);
              setSort('newest');
              setPage(0);
            }}
          >
            <Trans>Clear filters</Trans>
          </Button>
          <Button
            variant="bare"
            onPress={() => setRefresh(current => current + 1)}
          >
            <Trans>Refresh</Trans>
          </Button>
          <span style={{ marginLeft: 'auto', color: theme.pageTextLight }}>
            {t('{{count}} of {{total}} items', {
              count: filtered.length,
              total: items?.length ?? 0,
            })}
          </span>
        </View>
        {showAdvanced && (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 10,
              padding: 12,
              backgroundColor: theme.tableBackground,
              border: `1px solid ${theme.tableBorder}`,
              borderRadius: 6,
            }}
          >
            <label style={{ display: 'grid', gap: 4 }}>
              <Trans>From date</Trans>
              <input
                type="date"
                value={filters.fromDate}
                onChange={event =>
                  htech_changeFilter('fromDate', event.target.value)
                }
                style={htech_controlStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <Trans>To date</Trans>
              <input
                type="date"
                value={filters.toDate}
                onChange={event =>
                  htech_changeFilter('toDate', event.target.value)
                }
                style={htech_controlStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <Trans>Minimum paid</Trans>
              <input
                type="number"
                min="0"
                step="0.01"
                value={filters.minPaid}
                onChange={event =>
                  htech_changeFilter('minPaid', event.target.value)
                }
                style={{ ...htech_controlStyle, width: 130 }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <Trans>Maximum paid</Trans>
              <input
                type="number"
                min="0"
                step="0.01"
                value={filters.maxPaid}
                onChange={event =>
                  htech_changeFilter('maxPaid', event.target.value)
                }
                style={{ ...htech_controlStyle, width: 130 }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <Trans>Barcode contains</Trans>
              <input
                value={filters.barcode}
                onChange={event =>
                  htech_changeFilter('barcode', event.target.value)
                }
                style={{ ...htech_controlStyle, width: 170 }}
              />
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                alignSelf: 'end',
                minHeight: 32,
              }}
            >
              <input
                type="checkbox"
                checked={filters.discountedOnly}
                onChange={event =>
                  htech_changeFilter('discountedOnly', event.target.checked)
                }
              />
              <Trans>Discounted only</Trans>
            </label>
          </View>
        )}
        {error && <p role="alert">{error}</p>}
        {!items && !error && (
          <p>
            <Trans>Loading purchased items…</Trans>
          </p>
        )}
        {items && !error && (
          <View
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              backgroundColor: theme.tableBackground,
              border: `1px solid ${theme.tableBorder}`,
              borderRadius: 6,
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: 860,
              }}
            >
              <thead>
                <tr style={{ backgroundColor: theme.tableHeaderBackground }}>
                  <th
                    scope="col"
                    style={{ ...htech_cellStyle, textAlign: 'left' }}
                  >
                    <Trans>Date</Trans>
                  </th>
                  <th
                    scope="col"
                    style={{ ...htech_cellStyle, textAlign: 'left' }}
                  >
                    <Trans>Item</Trans>
                  </th>
                  <th
                    scope="col"
                    style={{ ...htech_cellStyle, textAlign: 'left' }}
                  >
                    <Trans>Store</Trans>
                  </th>
                  <th
                    scope="col"
                    style={{ ...htech_cellStyle, textAlign: 'left' }}
                  >
                    <Trans>Group</Trans>
                  </th>
                  <th
                    scope="col"
                    style={{ ...htech_cellStyle, textAlign: 'left' }}
                  >
                    <Trans>Barcode</Trans>
                  </th>
                  <th
                    scope="col"
                    style={{ ...htech_cellStyle, textAlign: 'right' }}
                  >
                    <Trans>Qty</Trans>
                  </th>
                  <th
                    scope="col"
                    style={{ ...htech_cellStyle, textAlign: 'right' }}
                  >
                    <Trans>Unit price</Trans>
                  </th>
                  <th
                    scope="col"
                    style={{ ...htech_cellStyle, textAlign: 'right' }}
                  >
                    <Trans>Discount</Trans>
                  </th>
                  <th
                    scope="col"
                    style={{ ...htech_cellStyle, textAlign: 'right' }}
                  >
                    <Trans>Paid</Trans>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map(item => (
                  <tr key={item.id}>
                    <td style={htech_cellStyle}>{item.purchased_at}</td>
                    <td style={htech_cellStyle}>
                      <Button
                        variant="bare"
                        onPress={() =>
                          dispatch(
                            pushModal({
                              modal: {
                                name: 'htech_receipts',
                                options: { transactionId: item.transaction_id },
                              },
                            }),
                          )
                        }
                      >
                        {item.printed_name}
                      </Button>
                    </td>
                    <td style={htech_cellStyle}>{item.store}</td>
                    <td style={htech_cellStyle}>
                      {item.group_name ?? t('Ungrouped')}
                    </td>
                    <td style={htech_cellStyle}>{item.barcode ?? '—'}</td>
                    <td style={{ ...htech_cellStyle, textAlign: 'right' }}>
                      {item.quantity ?? '—'}
                    </td>
                    <td style={{ ...htech_cellStyle, textAlign: 'right' }}>
                      {item.unit_price_cents === null ? (
                        '—'
                      ) : (
                        <>
                          <FinancialText>
                            {integerToCurrency(item.unit_price_cents)}
                          </FinancialText>
                          {item.unit && `/${item.unit}`}
                        </>
                      )}
                    </td>
                    <td style={{ ...htech_cellStyle, textAlign: 'right' }}>
                      <FinancialText>
                        {integerToCurrency(item.discount_cents)}
                      </FinancialText>
                    </td>
                    <td style={{ ...htech_cellStyle, textAlign: 'right' }}>
                      <FinancialText>
                        {integerToCurrency(item.paid_cents)}
                      </FinancialText>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p style={{ padding: 16, textAlign: 'center' }}>
                {items.length === 0
                  ? t(
                      'No purchased items yet. Add a receipt to a transaction to see its items here.',
                    )
                  : t('No items match these filters.')}
              </p>
            )}
          </View>
        )}
        {filtered.length > htech_PAGE_SIZE && (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'end',
              alignItems: 'center',
              gap: 10,
              paddingBottom: 12,
            }}
          >
            <Button
              variant="bare"
              isDisabled={visiblePage === 0}
              onPress={() => setPage(current => current - 1)}
            >
              <Trans>Previous</Trans>
            </Button>
            <span>
              {t('Page {{page}} of {{pages}}', {
                page: visiblePage + 1,
                pages: lastPage + 1,
              })}
            </span>
            <Button
              variant="bare"
              isDisabled={visiblePage === lastPage}
              onPress={() => setPage(current => current + 1)}
            >
              <Trans>Next</Trans>
            </Button>
          </View>
        )}
      </View>
    </Page>
  );
}
