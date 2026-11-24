import * as monthUtils from '@actual-app/core/shared/months';

export type htech_LoanPlan = {
  total: number;
  payment: number;
  count: number;
  finalPayment: number;
  finalMonth: string;
  finalDate: string;
  firstDate: string;
  paymentDay: number;
};

export type htech_LoanRecord = htech_LoanPlan & {
  categoryId: string;
  categoryName: string;
  categoryOwned: boolean;
  name: string;
  trackingFromDate: string;
  paidBeforeCategoryChange: number;
  setupDate?: string;
  historicalPaidAtSave?: number;
};

function htech_paymentDate(month: string, paymentDay: number): string {
  const htech_lastDay = Number(monthUtils.lastDayOfMonth(month).slice(-2));
  return `${month}-${String(Math.min(paymentDay, htech_lastDay)).padStart(2, '0')}`;
}

export function htech_parseLoanRecord(value: string): htech_LoanRecord | null {
  try {
    const record: unknown = JSON.parse(value);
    if (
      record &&
      typeof record === 'object' &&
      'categoryId' in record &&
      typeof record.categoryId === 'string' &&
      'name' in record &&
      typeof record.name === 'string' &&
      'firstDate' in record &&
      typeof record.firstDate === 'string' &&
      (!('trackingFromDate' in record) ||
        typeof record.trackingFromDate === 'string') &&
      'payment' in record &&
      typeof record.payment === 'number' &&
      'total' in record &&
      typeof record.total === 'number' &&
      'count' in record &&
      typeof record.count === 'number' &&
      'finalPayment' in record &&
      typeof record.finalPayment === 'number' &&
      'finalMonth' in record &&
      typeof record.finalMonth === 'string' &&
      'finalDate' in record &&
      typeof record.finalDate === 'string' &&
      Number.isSafeInteger(record.payment) &&
      record.payment > 0 &&
      Number.isSafeInteger(record.total) &&
      record.total > 0 &&
      Number.isSafeInteger(record.count) &&
      record.count > 0 &&
      Number.isSafeInteger(record.finalPayment) &&
      record.finalPayment > 0
    ) {
      const htech_paymentDay =
        'paymentDay' in record && typeof record.paymentDay === 'number'
          ? record.paymentDay
          : Number(record.firstDate.slice(-2));
      if (
        !Number.isInteger(htech_paymentDay) ||
        htech_paymentDay < 1 ||
        htech_paymentDay > 31
      ) {
        return null;
      }
      return {
        categoryId: record.categoryId,
        categoryName:
          'categoryName' in record && typeof record.categoryName === 'string'
            ? record.categoryName
            : `htech_${record.name}`,
        categoryOwned:
          'categoryOwned' in record && typeof record.categoryOwned === 'boolean'
            ? record.categoryOwned
            : true,
        name: record.name,
        firstDate: record.firstDate,
        trackingFromDate:
          'trackingFromDate' in record &&
          typeof record.trackingFromDate === 'string'
            ? record.trackingFromDate
            : record.firstDate,
        paidBeforeCategoryChange:
          'paidBeforeCategoryChange' in record &&
          typeof record.paidBeforeCategoryChange === 'number' &&
          Number.isSafeInteger(record.paidBeforeCategoryChange) &&
          record.paidBeforeCategoryChange >= 0
            ? record.paidBeforeCategoryChange
            : 0,
        ...('setupDate' in record &&
        typeof record.setupDate === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(record.setupDate) &&
        'historicalPaidAtSave' in record &&
        typeof record.historicalPaidAtSave === 'number' &&
        Number.isSafeInteger(record.historicalPaidAtSave) &&
        record.historicalPaidAtSave >= 0
          ? {
              setupDate: record.setupDate,
              historicalPaidAtSave: record.historicalPaidAtSave,
            }
          : {}),
        paymentDay: htech_paymentDay,
        payment: record.payment,
        total: record.total,
        count: record.count,
        finalPayment: record.finalPayment,
        finalMonth: record.finalMonth,
        finalDate: record.finalDate,
      } satisfies htech_LoanRecord;
    }
  } catch {
    // Ignore a malformed synced preference.
  }
  return null;
}

export function htech_getBudgetAdjustments(
  loan: htech_LoanRecord | undefined,
  plan: htech_LoanPlan,
  fromMonth = plan.firstDate.slice(0, 7),
): Array<{ month: string; delta: number }> {
  const htech_deltas = new Map<string, number>();
  if (loan) {
    for (let htech_index = 0; htech_index < loan.count; htech_index++) {
      const htech_month = monthUtils.addMonths(loan.firstDate, htech_index);
      if (htech_month >= fromMonth) {
        const htech_amount =
          htech_index === loan.count - 1 ? loan.finalPayment : loan.payment;
        htech_deltas.set(
          htech_month,
          (htech_deltas.get(htech_month) ?? 0) - htech_amount,
        );
      }
    }
  }
  for (let htech_index = 0; htech_index < plan.count; htech_index++) {
    const htech_month = monthUtils.addMonths(plan.firstDate, htech_index);
    const htech_amount =
      htech_index === plan.count - 1 ? plan.finalPayment : plan.payment;
    htech_deltas.set(
      htech_month,
      (htech_deltas.get(htech_month) ?? 0) + htech_amount,
    );
  }
  return [...htech_deltas]
    .filter(([, delta]) => delta !== 0)
    .map(([month, delta]) => ({ month, delta }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function htech_getBudgetTransfers(
  loan: htech_LoanRecord,
  plan: htech_LoanPlan,
  fromMonth = plan.firstDate.slice(0, 7),
): {
  oldCategory: Array<{ month: string; delta: number }>;
  newCategory: Array<{ month: string; delta: number }>;
} {
  const oldCategory = Array.from({ length: loan.count }, (_, index) => {
    const month = monthUtils.addMonths(loan.firstDate, index);
    const amount = index === loan.count - 1 ? loan.finalPayment : loan.payment;
    return { month, delta: -amount };
  }).filter(({ month }) => month >= fromMonth);
  return {
    oldCategory,
    newCategory: htech_getBudgetAdjustments(undefined, plan),
  };
}

export function htech_getLoanProgress(
  loan: htech_LoanRecord,
  transactions: readonly { amount: number; date: string }[],
) {
  const setupDate = loan.setupDate;
  const historicalPaid = setupDate
    ? Math.max(
        0,
        -transactions
          .filter(transaction => transaction.date <= setupDate)
          .reduce((sum, transaction) => sum + transaction.amount, 0),
      )
    : 0;
  const paid = Math.max(
    0,
    loan.paidBeforeCategoryChange -
      transactions.reduce((sum, transaction) => sum + transaction.amount, 0),
  );
  const total = loan.total + historicalPaid - (loan.historicalPaidAtSave ?? 0);
  const remaining = Math.max(0, total - paid);
  return {
    paid,
    historicalPaid,
    total,
    remaining,
    paymentsLeft: Math.ceil(remaining / loan.payment),
  };
}

export function htech_calculateLoanPlan(
  payment: number,
  countOrBalance: number,
  mode: 'count' | 'balance',
  paymentDay: number,
  today: string,
): htech_LoanPlan | null {
  if (
    !Number.isSafeInteger(payment) ||
    payment <= 0 ||
    !Number.isInteger(paymentDay) ||
    paymentDay < 1 ||
    paymentDay > 31 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(today)
  ) {
    return null;
  }

  const htech_currentMonth = today.slice(0, 7);
  const htech_thisMonthDate = htech_paymentDate(htech_currentMonth, paymentDay);
  const htech_firstMonth =
    htech_thisMonthDate >= today
      ? htech_currentMonth
      : monthUtils.addMonths(htech_currentMonth, 1);
  const firstDate = htech_paymentDate(htech_firstMonth, paymentDay);

  const count =
    mode === 'count' ? countOrBalance : Math.ceil(countOrBalance / payment);
  const total = mode === 'count' ? payment * count : countOrBalance;
  if (
    !Number.isSafeInteger(count) ||
    !Number.isSafeInteger(total) ||
    count < 1 ||
    count > 600 ||
    total < 1
  ) {
    return null;
  }

  const finalMonth = monthUtils.addMonths(htech_firstMonth, count - 1);
  return {
    total,
    payment,
    count,
    finalPayment: total - payment * (count - 1),
    firstDate,
    paymentDay,
    finalMonth,
    finalDate: htech_paymentDate(finalMonth, paymentDay),
  };
}
