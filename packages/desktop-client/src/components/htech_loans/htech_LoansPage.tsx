import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgAdd } from '@actual-app/components/icons/v1';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { spacing } from '@actual-app/components/tokens';
import { View } from '@actual-app/components/view';
import { q } from '@actual-app/core/shared/query';
import type { TransactionEntity } from '@actual-app/core/types/models';

import { ManagePage } from '#components/common/ManagePage';
import { FinancialText } from '#components/FinancialText';
import { Page } from '#components/Page';
import { useFormat } from '#hooks/useFormat';
import { pushModal } from '#modals/modalsSlice';
import { liveQuery } from '#queries/liveQuery';
import { useDispatch, useSelector } from '#redux';

import { htech_getLoanProgress, htech_parseLoanRecord } from './htech_loanMath';
import type { htech_LoanRecord } from './htech_loanMath';

type htech_LoanTransaction = Pick<
  TransactionEntity,
  'category' | 'amount' | 'date'
>;

export function HtechLoansPage() {
  const { t } = useTranslation();
  const htech_dispatch = useDispatch();
  const htech_format = useFormat();
  const htech_prefs = useSelector(state => state.prefs.synced);
  const [htech_transactions, htech_setTransactions] = useState<
    htech_LoanTransaction[]
  >([]);
  const [htech_error, htech_setError] = useState(false);

  const htech_loans = Object.entries(htech_prefs)
    .flatMap(([key, value]) => {
      if (!key.startsWith('htech_loan-') || !value) {
        return [];
      }
      const htech_loan = htech_parseLoanRecord(value);
      return htech_loan && key === `htech_loan-${htech_loan.categoryId}`
        ? [htech_loan]
        : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const htech_categoryIds = htech_loans.map(loan => loan.categoryId).join('|');
  const htech_summaries = htech_loans.map(loan => ({
    loan,
    progress: htech_getLoanProgress(
      loan,
      htech_transactions.filter(
        transaction =>
          transaction.category === loan.categoryId &&
          transaction.date >= loan.trackingFromDate,
      ),
    ),
  }));
  const htech_activeLoans = htech_summaries.filter(
    summary => summary.progress.remaining > 0,
  );
  const htech_finishedLoans = htech_summaries.filter(
    summary => summary.progress.remaining === 0,
  );

  useEffect(() => {
    if (!htech_categoryIds) return;
    const htech_ids = htech_categoryIds.split('|');
    const htech_query = q('transactions')
      .filter({ $or: htech_ids.map(id => ({ category: id })) })
      .select(['category', 'amount', 'date']);
    const htech_subscription = liveQuery<htech_LoanTransaction>(htech_query, {
      onData: data => {
        htech_setTransactions(data);
        htech_setError(false);
      },
      onError: () => htech_setError(true),
    });
    return () => htech_subscription.unsubscribe();
  }, [htech_categoryIds]);

  return (
    <Page header={t('Loans')}>
      <ManagePage
        description={
          <Trans>
            Bank payments count toward a loan when you categorize them in its
            budget category.
          </Trans>
        }
        actions={
          <Button
            variant="primary"
            onPress={() =>
              htech_dispatch(
                pushModal({ modal: { name: 'htech_loan-planner' } }),
              )
            }
          >
            <SvgAdd
              width={10}
              height={10}
              style={{ marginRight: spacing.xs }}
            />
            <Trans>Add loan</Trans>
          </Button>
        }
      >
        {htech_error && (
          <Text>
            <Trans>Could not load loan payments.</Trans>
          </Text>
        )}
        {htech_loans.length === 0 ? (
          <View
            style={{
              padding: spacing.xl,
              backgroundColor: theme.tableBackground,
            }}
          >
            <Text>
              <Trans>No loans yet. Add one to plan its monthly payments.</Trans>
            </Text>
          </View>
        ) : null}
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}
        >
          <section aria-labelledby="htech_active-loans-heading">
            <h2
              id="htech_active-loans-heading"
              style={htech_sectionHeadingStyle}
            >
              <Trans>In progress</Trans>
              <span style={htech_sectionCountStyle}>
                {htech_activeLoans.length}
              </span>
            </h2>
            {htech_activeLoans.length === 0 ? (
              <Text style={{ color: theme.pageTextSubdued }}>
                <Trans>No loans in progress.</Trans>
              </Text>
            ) : (
              <div style={htech_cardsStyle}>
                {htech_activeLoans.map(({ loan, progress }) => (
                  <HtechLoanCard
                    key={loan.categoryId}
                    loan={loan}
                    progress={progress}
                    format={htech_format}
                  />
                ))}
              </div>
            )}
          </section>
          <section aria-labelledby="htech_finished-loans-heading">
            <h2
              id="htech_finished-loans-heading"
              style={htech_sectionHeadingStyle}
            >
              <Trans>Finished</Trans>
              <span style={htech_sectionCountStyle}>
                {htech_finishedLoans.length}
              </span>
            </h2>
            {htech_finishedLoans.length === 0 ? (
              <Text style={{ color: theme.pageTextSubdued }}>
                <Trans>Paid off loans will appear here.</Trans>
              </Text>
            ) : (
              <div style={htech_cardsStyle}>
                {htech_finishedLoans.map(({ loan, progress }) => (
                  <HtechLoanCard
                    key={loan.categoryId}
                    loan={loan}
                    progress={progress}
                    format={htech_format}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </ManagePage>
    </Page>
  );
}

function HtechLoanCard({
  loan,
  progress,
  format,
}: {
  loan: htech_LoanRecord;
  progress: ReturnType<typeof htech_getLoanProgress>;
  format: ReturnType<typeof useFormat>;
}) {
  const { t } = useTranslation();
  const htech_dispatch = useDispatch();
  const htech_percent = Math.min(
    100,
    Math.round((progress.paid / progress.total) * 100),
  );
  const htech_isFinished = progress.remaining === 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.tableBackground,
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 8,
        padding: spacing.lg,
        gap: spacing.md,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: spacing.sm,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{loan.name}</h3>
          <Text size="small" style={{ color: theme.pageTextSubdued }}>
            {loan.categoryName}
          </Text>
        </div>
        <Button
          size="small"
          onPress={() =>
            htech_dispatch(
              pushModal({
                modal: {
                  name: 'htech_loan-planner',
                  options: {
                    loan,
                    paid: progress.paid,
                    historicalPaid: progress.historicalPaid,
                    remaining: progress.remaining,
                  },
                },
              }),
            )
          }
        >
          <Trans>Edit loan</Trans>
        </Button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: spacing.md,
        }}
      >
        <div>
          <Text size="small" style={{ color: theme.pageTextSubdued }}>
            <Trans>Remaining</Trans>
          </Text>
          <div
            style={{
              color: htech_isFinished
                ? theme.numberPositive
                : theme.pageTextLink,
              fontSize: 24,
              fontWeight: 600,
            }}
          >
            <FinancialText>
              {format(progress.remaining, 'financial')}
            </FinancialText>
          </div>
        </div>
        <div>
          <Text size="small" style={{ color: theme.pageTextSubdued }}>
            <Trans>Paid</Trans>
          </Text>
          <div
            style={{
              color: theme.numberPositive,
              fontSize: 24,
              fontWeight: 600,
            }}
          >
            <FinancialText>{format(progress.paid, 'financial')}</FinancialText>
          </div>
        </div>
      </div>
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: spacing.xs,
          }}
        >
          <Text size="small" style={{ color: theme.pageTextSubdued }}>
            <Trans>Payment progress</Trans>
          </Text>
          <Text size="small" style={{ color: theme.numberPositive }}>
            {htech_percent}%
          </Text>
        </div>
        <progress
          aria-label={t('Loan payment progress')}
          value={htech_percent}
          max={100}
          style={{
            width: '100%',
            height: 8,
            accentColor: theme.numberPositive,
          }}
        />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: spacing.sm,
          borderTop: `1px solid ${theme.tableBorder}`,
          paddingTop: spacing.sm,
        }}
      >
        <div>
          <Text size="small" style={{ color: theme.pageTextSubdued }}>
            <Trans>Monthly</Trans>
          </Text>
          <div>
            <FinancialText>{format(loan.payment, 'financial')}</FinancialText>
          </div>
        </div>
        <div>
          <Text size="small" style={{ color: theme.pageTextSubdued }}>
            <Trans>Payments left</Trans>
          </Text>
          <div>{progress.paymentsLeft}</div>
        </div>
        <div>
          <Text size="small" style={{ color: theme.pageTextSubdued }}>
            <Trans>Planned payoff</Trans>
          </Text>
          <div>{htech_isFinished ? t('Paid off') : loan.finalMonth}</div>
        </div>
      </div>
    </div>
  );
}

const htech_cardsStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 440px))',
  gap: spacing.md,
} satisfies CSSProperties;

const htech_sectionHeadingStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing.sm,
  fontSize: 18,
  margin: `0 0 ${spacing.md}`,
} satisfies CSSProperties;

const htech_sectionCountStyle = {
  color: theme.pageTextSubdued,
  fontSize: 13,
  fontWeight: 400,
} satisfies CSSProperties;
