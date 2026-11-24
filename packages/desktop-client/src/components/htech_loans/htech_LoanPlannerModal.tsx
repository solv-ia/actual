import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Paragraph } from '@actual-app/components/paragraph';
import { Select } from '@actual-app/components/select';
import { SpaceBetween } from '@actual-app/components/space-between';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';
import type { SyncedPrefs } from '@actual-app/core/types/prefs';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { useFormat } from '#hooks/useFormat';
import { saveSyncedPrefs } from '#prefs/prefsSlice';
import { useDispatch, useSelector } from '#redux';

import {
  htech_calculateLoanPlan,
  htech_getBudgetAdjustments,
  htech_getBudgetTransfers,
  htech_parseLoanRecord,
} from './htech_loanMath';
import type { htech_LoanRecord } from './htech_loanMath';

const htech_fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const htech_inputStyle: CSSProperties = { width: '100%' };

function htech_toCents(value: string): number {
  return Math.round(Number(value) * 100);
}

export function HtechLoanPlannerModal({
  loan: htech_existingLoan,
  paid: htech_paid = 0,
  historicalPaid: htech_historicalPaid = 0,
  remaining: htech_remaining,
}: {
  loan?: htech_LoanRecord;
  paid?: number;
  historicalPaid?: number;
  remaining?: number;
}) {
  const { t } = useTranslation();
  const htech_dispatch = useDispatch();
  const htech_format = useFormat();
  const htech_prefs = useSelector(state => state.prefs.synced);
  const [htech_name, htech_setName] = useState(htech_existingLoan?.name ?? '');
  const [htech_mode, htech_setMode] = useState<'count' | 'balance'>('balance');
  const [htech_payment, htech_setPayment] = useState(
    htech_existingLoan ? (htech_existingLoan.payment / 100).toFixed(2) : '',
  );
  const [htech_other, htech_setOther] = useState(
    htech_existingLoan
      ? (
          Math.max(
            0,
            htech_remaining ?? htech_existingLoan.total - htech_paid,
          ) / 100
        ).toFixed(2)
      : '',
  );
  const [htech_paymentDay, htech_setPaymentDay] = useState(
    htech_existingLoan ? String(htech_existingLoan.paymentDay) : '',
  );
  const [htech_categoryMode, htech_setCategoryMode] = useState<
    'current' | 'new' | 'existing'
  >(htech_existingLoan ? 'current' : 'new');
  const [htech_categoryId, htech_setCategoryId] = useState('');
  const [htech_categoryName, htech_setCategoryName] = useState<string | null>(
    htech_existingLoan?.categoryOwned
      ? htech_existingLoan.categoryName.replace(/^htech_/, '')
      : null,
  );
  const htech_categoryNameValue = htech_categoryName ?? htech_name;
  const [htech_groupId, htech_setGroupId] = useState('htech_new_group');
  const [htech_categories, htech_setCategories] = useState<{
    list: CategoryEntity[];
    grouped: CategoryGroupEntity[];
  } | null>(null);
  const [htech_isSaving, htech_setIsSaving] = useState(false);
  const [htech_error, htech_setError] = useState('');

  useEffect(() => {
    let htech_isActive = true;
    void send('get-categories', {})
      .then(htech_result => {
        if (htech_isActive) {
          htech_setCategories(htech_result);
          const htech_loansGroup = htech_result.grouped.find(
            group => group.name === 'htech_Loans',
          );
          const htech_currentCategory = htech_result.list.find(
            category => category.id === htech_existingLoan?.categoryId,
          );
          if (htech_currentCategory?.group) {
            htech_setGroupId(htech_currentCategory.group);
          } else if (htech_loansGroup) {
            htech_setGroupId(htech_loansGroup.id);
          }
        }
      })
      .catch(() => {
        if (htech_isActive) {
          htech_setError(t('Could not load budget categories.'));
        }
      });
    return () => {
      htech_isActive = false;
    };
  }, [htech_existingLoan?.categoryId, t]);

  const htech_availableCategories = (htech_categories?.list ?? [])
    .filter(
      category =>
        !category.hidden &&
        !category.tombstone &&
        !category.is_income &&
        !htech_prefs[`htech_loan-${category.id}`],
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const htech_groupOptions = (htech_categories?.grouped ?? [])
    .filter(group => !group.hidden && !group.tombstone && !group.is_income)
    .map(group => [group.id, group.name] as const);
  const htech_hasLoansGroup = htech_groupOptions.some(
    ([, name]) => name === 'htech_Loans',
  );

  const htech_otherValue =
    htech_mode === 'count' ? Number(htech_other) : htech_toCents(htech_other);
  const htech_plan = htech_calculateLoanPlan(
    htech_toCents(htech_payment),
    htech_otherValue,
    htech_mode,
    Number(htech_paymentDay),
    monthUtils.currentDay(),
  );

  async function htech_save(close: () => void) {
    if (
      !htech_plan ||
      !htech_name.trim() ||
      (htech_categoryMode === 'existing' && !htech_categoryId) ||
      (htech_categoryMode === 'new' && !htech_categoryNameValue.trim())
    ) {
      htech_setError(t('Enter a name and valid payment details.'));
      return;
    }
    htech_setIsSaving(true);
    htech_setError('');

    try {
      const htech_storedName = `htech_${htech_categoryNameValue.trim()}`;
      const htech_categories = await send('get-categories', {});
      const htech_hasDuplicateLoan = Object.values(htech_prefs).some(value => {
        const htech_loan = value && htech_parseLoanRecord(value);
        return (
          htech_loan &&
          htech_loan.name === htech_name.trim() &&
          htech_loan.categoryId !== htech_existingLoan?.categoryId
        );
      });
      if (
        htech_hasDuplicateLoan ||
        ((htech_categoryMode === 'new' ||
          (htech_categoryMode === 'current' &&
            htech_existingLoan?.categoryOwned)) &&
          htech_categories.list.some(
            category =>
              category.name === htech_storedName &&
              (htech_categoryMode !== 'current' ||
                category.id !== htech_existingLoan?.categoryId),
          ))
      ) {
        htech_setError(t('A loan with this name already exists.'));
        return;
      }

      let htech_savedCategoryId = htech_existingLoan?.categoryId;
      let htech_savedCategoryName = htech_existingLoan?.categoryName;
      if (htech_categoryMode === 'current' && htech_existingLoan) {
        const htech_existingCategory = htech_categories.list.find(
          category => category.id === htech_existingLoan.categoryId,
        );
        if (!htech_existingCategory) {
          throw new Error('Loan category missing');
        }
        if (htech_existingLoan.categoryOwned) {
          await send('category-update', {
            ...htech_existingCategory,
            name: htech_storedName,
          });
          htech_savedCategoryName = htech_storedName;
        } else {
          htech_savedCategoryName = htech_existingCategory.name;
        }
      } else if (htech_categoryMode === 'existing') {
        const htech_selectedCategory = htech_categories.list.find(
          category => category.id === htech_categoryId,
        );
        if (
          !htech_selectedCategory ||
          htech_selectedCategory.is_income ||
          htech_prefs[`htech_loan-${htech_categoryId}`]
        ) {
          throw new Error('Loan category unavailable');
        }
        htech_savedCategoryId = htech_selectedCategory.id;
        htech_savedCategoryName = htech_selectedCategory.name;
      } else {
        let htech_savedGroupId = htech_groupId;
        if (htech_savedGroupId === 'htech_new_group') {
          htech_savedGroupId =
            htech_categories.grouped.find(group => group.name === 'htech_Loans')
              ?.id ?? '';
        }
        if (!htech_savedGroupId) {
          htech_savedGroupId = await send('category-group-create', {
            name: 'htech_Loans',
          });
        }
        htech_savedCategoryId = await send('category-create', {
          name: htech_storedName,
          groupId: htech_savedGroupId,
        });
        htech_savedCategoryName = htech_storedName;
      }
      if (!htech_savedCategoryId || !htech_savedCategoryName) {
        throw new Error('Loan category could not be created');
      }

      const htech_categoryChanged =
        htech_existingLoan?.categoryId !== undefined &&
        htech_existingLoan.categoryId !== htech_savedCategoryId;
      const htech_currentMonth = monthUtils.currentDay().slice(0, 7);
      const htech_adjustments = htech_categoryChanged
        ? (() => {
            const htech_transfers = htech_getBudgetTransfers(
              htech_existingLoan,
              htech_plan,
              htech_currentMonth,
            );
            return [
              ...htech_transfers.oldCategory.map(adjustment => ({
                ...adjustment,
                categoryId: htech_existingLoan.categoryId,
              })),
              ...htech_transfers.newCategory.map(adjustment => ({
                ...adjustment,
                categoryId: htech_savedCategoryId,
              })),
            ];
          })()
        : htech_getBudgetAdjustments(
            htech_existingLoan,
            htech_plan,
            htech_currentMonth,
          ).map(adjustment => ({
            ...adjustment,
            categoryId: htech_savedCategoryId,
          }));
      for (const htech_adjustment of htech_adjustments) {
        const htech_currentBudget = await send('htech_budget/get-amount', {
          category: htech_adjustment.categoryId,
          month: htech_adjustment.month,
        });
        await send('budget/budget-amount', {
          category: htech_adjustment.categoryId,
          month: htech_adjustment.month,
          amount: Math.max(0, htech_currentBudget + htech_adjustment.delta),
        });
      }

      const htech_record = {
        ...htech_plan,
        categoryId: htech_savedCategoryId,
        categoryName: htech_savedCategoryName,
        categoryOwned:
          htech_categoryMode === 'current'
            ? (htech_existingLoan?.categoryOwned ?? false)
            : htech_categoryMode === 'new',
        name: htech_name.trim(),
        total: htech_existingLoan
          ? htech_paid +
            htech_plan.total -
            (htech_categoryChanged ? 0 : htech_historicalPaid) +
            (htech_categoryChanged
              ? 0
              : (htech_existingLoan.historicalPaidAtSave ?? 0))
          : htech_plan.total,
        trackingFromDate: htech_categoryChanged
          ? '0000-01-01'
          : htech_existingLoan
            ? htech_existingLoan.trackingFromDate
            : '0000-01-01',
        paidBeforeCategoryChange: htech_categoryChanged
          ? htech_paid
          : (htech_existingLoan?.paidBeforeCategoryChange ?? 0),
        setupDate: htech_categoryChanged
          ? monthUtils.currentDay()
          : htech_existingLoan
            ? htech_existingLoan.setupDate
            : monthUtils.currentDay(),
        historicalPaidAtSave: htech_categoryChanged
          ? 0
          : (htech_existingLoan?.historicalPaidAtSave ?? 0),
      } satisfies htech_LoanRecord;
      const htech_prefKey: keyof SyncedPrefs = `htech_loan-${htech_savedCategoryId}`;
      const htech_oldPrefKey: keyof SyncedPrefs | undefined =
        htech_categoryChanged
          ? `htech_loan-${htech_existingLoan.categoryId}`
          : undefined;
      await htech_dispatch(
        saveSyncedPrefs({
          prefs: {
            ...(htech_oldPrefKey ? { [htech_oldPrefKey]: '' } : {}),
            [htech_prefKey]: JSON.stringify(htech_record),
          },
        }),
      ).unwrap();
      close();
    } catch {
      htech_setError(
        t(
          'Could not finish creating the loan plan. Check your loans and budget before trying again.',
        ),
      );
    } finally {
      htech_setIsSaving(false);
    }
  }

  return (
    <Modal name="htech_loan-planner" containerProps={{ style: { width: 460 } }}>
      {({ state }) => (
        <>
          <ModalHeader
            title={
              htech_existingLoan ? t('Edit loan') : t('Plan loan payments')
            }
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ gap: 12 }}>
            <Paragraph>
              {htech_existingLoan ? (
                <Trans>
                  Change what you still owe, your monthly payment, or payment
                  day. Future budget amounts will update.
                </Trans>
              ) : (
                <Trans>
                  Enter what you still owe. You do not need to know when the
                  loan started. Categorize older bank payments in this loan's
                  category to show them as payment history; they will not reduce
                  the remaining balance you enter here.
                </Trans>
              )}
            </Paragraph>
            <label htmlFor="htech_loan-name" style={htech_fieldStyle}>
              <Trans>Loan name</Trans>
              <Input
                id="htech_loan-name"
                style={htech_inputStyle}
                value={htech_name}
                onChange={event => htech_setName(event.target.value)}
              />
            </label>
            <label htmlFor="htech_loan-payment" style={htech_fieldStyle}>
              <Trans>Monthly payment</Trans>
              <Input
                id="htech_loan-payment"
                style={htech_inputStyle}
                type="number"
                min="0.01"
                step="0.01"
                value={htech_payment}
                onChange={event => htech_setPayment(event.target.value)}
              />
            </label>
            <label htmlFor="htech_loan-mode" style={htech_fieldStyle}>
              <Trans>Calculate from</Trans>
              <Select
                id="htech_loan-mode"
                options={[
                  ['count', t('Payments left')],
                  ['balance', t('Remaining balance')],
                ]}
                value={htech_mode}
                onChange={value => {
                  htech_setMode(value === 'balance' ? 'balance' : 'count');
                  htech_setOther('');
                }}
              />
            </label>
            <label htmlFor="htech_loan-other" style={htech_fieldStyle}>
              {htech_mode === 'count' ? (
                <Trans>Payments left</Trans>
              ) : (
                <Trans>Remaining balance</Trans>
              )}
              <Input
                id="htech_loan-other"
                style={htech_inputStyle}
                type="number"
                min={htech_mode === 'count' ? '1' : '0.01'}
                step={htech_mode === 'count' ? '1' : '0.01'}
                value={htech_other}
                onChange={event => htech_setOther(event.target.value)}
              />
            </label>
            <label htmlFor="htech_loan-day" style={htech_fieldStyle}>
              <Trans>Payment day of the month</Trans>
              <Input
                id="htech_loan-day"
                style={htech_inputStyle}
                type="number"
                min="1"
                max="31"
                step="1"
                value={htech_paymentDay}
                onChange={event => htech_setPaymentDay(event.target.value)}
              />
            </label>
            <Paragraph>
              <Trans>
                Budgeting starts with the next payment. For days 29–31, shorter
                months use their last day.
              </Trans>
            </Paragraph>
            <>
              <label
                htmlFor="htech_loan-category-mode"
                style={htech_fieldStyle}
              >
                <Trans>Budget category</Trans>
                <Select
                  id="htech_loan-category-mode"
                  options={[
                    ...(htech_existingLoan
                      ? [
                          [
                            'current',
                            t('Keep current category ({{name}})', {
                              name: htech_existingLoan.categoryName,
                            }),
                          ] as const,
                        ]
                      : []),
                    ['new', t('Create a new category')],
                    ['existing', t('Use an existing category')],
                  ]}
                  value={htech_categoryMode}
                  onChange={value => {
                    htech_setCategoryMode(
                      value === 'existing'
                        ? 'existing'
                        : value === 'current'
                          ? 'current'
                          : 'new',
                    );
                  }}
                />
              </label>
              {htech_categoryMode === 'new' && (
                <>
                  <label
                    htmlFor="htech_loan-category-name"
                    style={htech_fieldStyle}
                  >
                    <Trans>New category name</Trans>
                    <Input
                      id="htech_loan-category-name"
                      style={htech_inputStyle}
                      value={htech_categoryNameValue}
                      onChange={event =>
                        htech_setCategoryName(event.target.value)
                      }
                    />
                  </label>
                  <label
                    htmlFor="htech_loan-category-group"
                    style={htech_fieldStyle}
                  >
                    <Trans>Category group</Trans>
                    <Select
                      id="htech_loan-category-group"
                      options={[
                        ...(!htech_hasLoansGroup
                          ? [['htech_new_group', t('New Loans group')] as const]
                          : []),
                        ...htech_groupOptions,
                      ]}
                      value={htech_groupId}
                      onChange={htech_setGroupId}
                    />
                  </label>
                  {htech_categoryNameValue.trim() && (
                    <Paragraph>
                      {t('New category: {{name}}', {
                        name: `htech_${htech_categoryNameValue.trim()}`,
                      })}
                    </Paragraph>
                  )}
                </>
              )}
              {htech_categoryMode === 'current' &&
                htech_existingLoan?.categoryOwned && (
                  <label
                    htmlFor="htech_loan-category-name"
                    style={htech_fieldStyle}
                  >
                    <Trans>Category name</Trans>
                    <Input
                      id="htech_loan-category-name"
                      style={htech_inputStyle}
                      value={htech_categoryNameValue}
                      onChange={event =>
                        htech_setCategoryName(event.target.value)
                      }
                    />
                  </label>
                )}
              {htech_categoryMode === 'existing' && (
                <>
                  <label htmlFor="htech_loan-category" style={htech_fieldStyle}>
                    <Trans>Existing category</Trans>
                    <Select
                      id="htech_loan-category"
                      options={[
                        ['', t('Choose a category')],
                        ...htech_availableCategories.map(
                          category =>
                            [
                              category.id,
                              `${
                                htech_categories?.grouped.find(
                                  group => group.id === category.group,
                                )?.name ?? ''
                              } / ${category.name}`,
                            ] as const,
                        ),
                      ]}
                      value={htech_categoryId}
                      onChange={htech_setCategoryId}
                    />
                  </label>
                  <Paragraph>
                    <Trans>
                      Use a category dedicated to this loan. Every payment in
                      that category will count toward its balance.
                    </Trans>
                  </Paragraph>
                </>
              )}
            </>
            {htech_plan && (
              <Paragraph>
                {t(
                  '{{count}} payments · {{total}} total remaining · next payment {{firstDate}} · final payment {{finalPayment}} on {{finalDate}}',
                  {
                    count: htech_plan.count,
                    total: htech_format(htech_plan.total, 'financial'),
                    firstDate: htech_plan.firstDate,
                    finalPayment: htech_format(
                      htech_plan.finalPayment,
                      'financial',
                    ),
                    finalDate: htech_plan.finalDate,
                  },
                )}
              </Paragraph>
            )}
            {htech_error && <Paragraph>{htech_error}</Paragraph>}
            <SpaceBetween>
              <Button onPress={() => state.close()}>
                <Trans>Cancel</Trans>
              </Button>
              <Button
                variant="primary"
                isDisabled={
                  htech_isSaving ||
                  !htech_plan ||
                  !htech_name.trim() ||
                  (htech_categoryMode === 'existing' && !htech_categoryId) ||
                  ((htech_categoryMode === 'new' ||
                    (htech_categoryMode === 'current' &&
                      htech_existingLoan?.categoryOwned)) &&
                    !htech_categoryNameValue.trim())
                }
                onPress={() => void htech_save(() => state.close())}
              >
                {htech_existingLoan ? (
                  <Trans>Save loan</Trans>
                ) : (
                  <Trans>Create loan plan</Trans>
                )}
              </Button>
            </SpaceBetween>
          </View>
        </>
      )}
    </Modal>
  );
}
