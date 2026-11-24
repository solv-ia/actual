import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import { integerToCurrency } from '@actual-app/core/shared/util';
import type {
  htech_PriceHistoryRow,
  htech_Receipt,
  htech_ReceiptGroup,
} from '@actual-app/core/types/htech_receipts';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { FinancialText } from '#components/FinancialText';
import type { Modal as ModalType } from '#modals/modalsSlice';

type htech_Props = Extract<ModalType, { name: 'htech_receipts' }>['options'];

function htech_groupTotals(receipt: htech_Receipt) {
  const totals = new Map<string | null, number>();
  for (const line of receipt.lines) {
    totals.set(
      line.group_id,
      (totals.get(line.group_id) ?? 0) + line.paid_cents,
    );
  }
  return [...totals.entries()];
}

export function HtechReceiptsModal({ transactionId }: htech_Props) {
  const { t } = useTranslation();
  const [receipts, setReceipts] = useState<htech_Receipt[] | null>(null);
  const [groups, setGroups] = useState<htech_ReceiptGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<htech_PriceHistoryRow[] | null>(null);
  const [historyProductId, setHistoryProductId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      send('htech_receipts_for_transaction', { transaction_id: transactionId }),
      send('htech_receipt_groups_list'),
    ])
      .then(([nextReceipts, nextGroups]) => {
        if (active) {
          setReceipts(nextReceipts);
          setGroups(nextGroups);
        }
      })
      .catch(() => {
        if (active) setError(t('Could not load receipts.'));
      });
    return () => {
      active = false;
    };
  }, [transactionId, t]);

  async function htech_showHistory(productId: string) {
    setHistoryProductId(productId);
    setHistory(null);
    try {
      setHistory(
        await send('htech_receipts_product_history', { product_id: productId }),
      );
    } catch {
      setError(t('Could not load price history.'));
    }
  }

  function htech_downloadReceipt(receipt: htech_Receipt) {
    if (!receipt.document_base64 || !receipt.document_mime) return;
    const link = document.createElement('a');
    link.href = `data:${receipt.document_mime};base64,${receipt.document_base64}`;
    link.download = receipt.document_name ?? 'receipt';
    link.click();
  }

  const groupNames = new Map(groups.map(group => [group.id, group.name]));

  return (
    <Modal
      name="htech_receipts"
      containerProps={{
        style: { width: 'min(92vw, 720px)', maxHeight: '85vh' },
      }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title={t('Receipts')}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ overflow: 'auto', padding: 20, gap: 20 }}>
            {error && <p role="alert">{error}</p>}
            {!receipts && !error && (
              <p>
                <Trans>Loading receipts…</Trans>
              </p>
            )}
            {receipts?.length === 0 && (
              <p>
                <Trans>No receipt is linked to this transaction yet.</Trans>
              </p>
            )}
            {receipts?.map(receipt => (
              <section
                key={receipt.id}
                style={{
                  borderBottom: `1px solid ${theme.tableBorder}`,
                  paddingBottom: 16,
                }}
              >
                <View
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <strong>
                    {receipt.store} · {receipt.purchased_at}
                  </strong>
                  <FinancialText>
                    {integerToCurrency(receipt.total_cents)}
                  </FinancialText>
                </View>
                {receipt.document_base64 && receipt.document_mime && (
                  <View style={{ marginTop: 10 }}>
                    <Button
                      variant="bare"
                      onPress={() => htech_downloadReceipt(receipt)}
                    >
                      <Trans>Download original receipt</Trans>
                    </Button>
                    {receipt.document_mime.startsWith('image/') && (
                      <img
                        src={`data:${receipt.document_mime};base64,${receipt.document_base64}`}
                        alt={t('Original receipt from {{store}}', {
                          store: receipt.store,
                        })}
                        style={{
                          display: 'block',
                          maxWidth: '100%',
                          maxHeight: 240,
                          marginTop: 10,
                          objectFit: 'contain',
                        }}
                      />
                    )}
                  </View>
                )}
                <table
                  style={{
                    width: '100%',
                    marginTop: 12,
                    borderCollapse: 'collapse',
                  }}
                >
                  <thead>
                    <tr>
                      <th scope="col" style={{ textAlign: 'left' }}>
                        <Trans>Item</Trans>
                      </th>
                      <th scope="col" style={{ textAlign: 'left' }}>
                        <Trans>Group</Trans>
                      </th>
                      <th scope="col" style={{ textAlign: 'right' }}>
                        <Trans>Paid</Trans>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipt.lines.map(line => (
                      <tr key={line.id}>
                        <td style={{ padding: '6px 0' }}>
                          {line.product_id ? (
                            <Button
                              variant="bare"
                              onPress={() =>
                                void htech_showHistory(line.product_id ?? '')
                              }
                            >
                              {line.printed_name}
                            </Button>
                          ) : (
                            line.printed_name
                          )}
                          {line.quantity && (
                            <small style={{ marginLeft: 6 }}>
                              {line.quantity} {line.unit}
                            </small>
                          )}
                        </td>
                        <td>
                          {line.group_id
                            ? (groupNames.get(line.group_id) ?? '—')
                            : '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <FinancialText>
                            {integerToCurrency(line.paid_cents)}
                          </FinancialText>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <View
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginTop: 10,
                  }}
                >
                  {htech_groupTotals(receipt).map(([groupId, total]) => (
                    <span key={groupId ?? 'ungrouped'}>
                      {groupId
                        ? (groupNames.get(groupId) ?? t('Unknown group'))
                        : t('Ungrouped')}
                      :{' '}
                      <FinancialText>{integerToCurrency(total)}</FinancialText>
                    </span>
                  ))}
                </View>
              </section>
            ))}
            {historyProductId && (
              <section>
                <h2 style={{ fontSize: 16 }}>
                  <Trans>Price history</Trans>
                </h2>
                {!history && (
                  <p>
                    <Trans>Loading…</Trans>
                  </p>
                )}
                {history?.map(entry => (
                  <View
                    key={entry.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '4px 0',
                    }}
                  >
                    <span>
                      {entry.purchased_at} · {entry.store} ·{' '}
                      {entry.printed_name}
                    </span>
                    <FinancialText>
                      {integerToCurrency(entry.paid_cents)}
                    </FinancialText>
                  </View>
                ))}
              </section>
            )}
          </View>
        </>
      )}
    </Modal>
  );
}
