import { describe, expect, it } from 'vitest';

import {
  htech_calculateLoanPlan,
  htech_getBudgetAdjustments,
  htech_getBudgetTransfers,
  htech_getLoanProgress,
  htech_parseLoanRecord,
} from './htech_loanMath';

const htech_loan = {
  categoryId: 'category-1',
  categoryName: 'htech_Bike',
  categoryOwned: true,
  name: 'Bike',
  firstDate: '2026-12-15',
  trackingFromDate: '2026-12-15',
  paidBeforeCategoryChange: 0,
  paymentDay: 15,
  total: 25001,
  payment: 10000,
  count: 3,
  finalPayment: 5001,
  finalMonth: '2027-02',
  finalDate: '2027-02-15',
};

describe('htech_calculateLoanPlan', () => {
  it('calculates the total from the number of payments', () => {
    expect(
      htech_calculateLoanPlan(12500, 12, 'count', 15, '2026-11-23'),
    ).toEqual({
      total: 150000,
      payment: 12500,
      count: 12,
      finalPayment: 12500,
      firstDate: '2026-12-15',
      paymentDay: 15,
      finalMonth: '2027-11',
      finalDate: '2027-11-15',
    });
  });

  it('calculates a smaller final payment from the remaining amount', () => {
    expect(
      htech_calculateLoanPlan(10000, 25001, 'balance', 28, '2026-11-23'),
    ).toEqual({
      total: 25001,
      payment: 10000,
      count: 3,
      finalPayment: 5001,
      firstDate: '2026-11-28',
      paymentDay: 28,
      finalMonth: '2027-01',
      finalDate: '2027-01-28',
    });
  });

  it('uses month end when the payment day is 31', () => {
    expect(
      htech_calculateLoanPlan(10000, 3, 'count', 31, '2027-02-20'),
    ).toMatchObject({
      firstDate: '2027-02-28',
      finalDate: '2027-04-30',
    });
  });

  it('rejects invalid or implausibly long plans', () => {
    expect(htech_calculateLoanPlan(0, 3, 'count', 15, '2026-11-23')).toBeNull();
    expect(
      htech_calculateLoanPlan(10000, 2.5, 'count', 15, '2026-11-23'),
    ).toBeNull();
    expect(
      htech_calculateLoanPlan(10000, 601, 'count', 15, '2026-11-23'),
    ).toBeNull();
    expect(
      htech_calculateLoanPlan(10000, 3, 'count', 32, '2026-11-23'),
    ).toBeNull();
  });
});

describe('htech_loan progress', () => {
  it('counts categorized bank outflows toward the remaining balance', () => {
    expect(
      htech_getLoanProgress(htech_loan, [
        { amount: -10000, date: '2026-12-15' },
        { amount: -5000, date: '2027-01-15' },
      ]),
    ).toEqual({
      paid: 15000,
      historicalPaid: 0,
      total: 25001,
      remaining: 10001,
      paymentsLeft: 2,
    });
  });

  it('does not show a negative balance after overpayment', () => {
    expect(
      htech_getLoanProgress(htech_loan, [
        { amount: -30000, date: '2026-12-15' },
      ]),
    ).toEqual({
      paid: 30000,
      historicalPaid: 0,
      total: 25001,
      remaining: 0,
      paymentsLeft: 0,
    });
  });

  it('keeps payments counted before a category change', () => {
    expect(
      htech_getLoanProgress(
        { ...htech_loan, paidBeforeCategoryChange: 10000 },
        [{ amount: -5000, date: '2026-12-15' }],
      ),
    ).toEqual({
      paid: 15000,
      historicalPaid: 0,
      total: 25001,
      remaining: 10001,
      paymentsLeft: 2,
    });
  });

  it('shows payments before setup without reducing the entered balance', () => {
    const htech_newLoan = {
      ...htech_loan,
      total: 25001,
      trackingFromDate: '0000-01-01',
      setupDate: '2026-11-24',
      historicalPaidAtSave: 0,
    };
    expect(
      htech_getLoanProgress(htech_newLoan, [
        { amount: -10000, date: '2026-10-15' },
        { amount: -5000, date: '2026-12-15' },
      ]),
    ).toEqual({
      paid: 15000,
      historicalPaid: 10000,
      total: 35001,
      remaining: 20001,
      paymentsLeft: 3,
    });
  });

  it('ignores invalid stored records', () => {
    expect(htech_parseLoanRecord('invalid')).toBeNull();
    expect(htech_parseLoanRecord(JSON.stringify(htech_loan))).toEqual(
      htech_loan,
    );
    const htech_newLoan = {
      ...htech_loan,
      setupDate: '2026-11-24',
      historicalPaidAtSave: 0,
    };
    expect(htech_parseLoanRecord(JSON.stringify(htech_newLoan))).toEqual(
      htech_newLoan,
    );
    const {
      paymentDay: _,
      trackingFromDate: __,
      categoryName: ___,
      categoryOwned: ____,
      paidBeforeCategoryChange: _____,
      ...htech_oldLoan
    } = htech_loan;
    expect(htech_parseLoanRecord(JSON.stringify(htech_oldLoan))).toEqual(
      htech_loan,
    );
  });
});

describe('htech_getBudgetAdjustments', () => {
  it('adds each payment to the selected category', () => {
    const htech_plan = htech_calculateLoanPlan(
      10000,
      25001,
      'balance',
      15,
      '2026-11-23',
    );
    expect(htech_plan).not.toBeNull();
    if (!htech_plan) return;
    expect(htech_getBudgetAdjustments(undefined, htech_plan)).toEqual([
      { month: '2026-12', delta: 10000 },
      { month: '2027-01', delta: 10000 },
      { month: '2027-02', delta: 5001 },
    ]);
  });

  it('changes future contributions while leaving past months alone', () => {
    const htech_plan = htech_calculateLoanPlan(
      7500,
      15000,
      'balance',
      15,
      '2027-01-10',
    );
    expect(htech_plan).not.toBeNull();
    if (!htech_plan) return;
    expect(htech_getBudgetAdjustments(htech_loan, htech_plan)).toEqual([
      { month: '2027-01', delta: -2500 },
      { month: '2027-02', delta: 2499 },
    ]);
  });
});

describe('htech_getBudgetTransfers', () => {
  it('moves future allocations even when the payment amount stays the same', () => {
    const htech_plan = htech_calculateLoanPlan(
      10000,
      25001,
      'balance',
      15,
      '2026-11-23',
    );
    expect(htech_plan).not.toBeNull();
    if (!htech_plan) return;
    expect(htech_getBudgetTransfers(htech_loan, htech_plan)).toEqual({
      oldCategory: [
        { month: '2026-12', delta: -10000 },
        { month: '2027-01', delta: -10000 },
        { month: '2027-02', delta: -5001 },
      ],
      newCategory: [
        { month: '2026-12', delta: 10000 },
        { month: '2027-01', delta: 10000 },
        { month: '2027-02', delta: 5001 },
      ],
    });
  });

  it('removes this month from the old category when the next payment moves to next month', () => {
    const htech_plan = htech_calculateLoanPlan(
      10000,
      20000,
      'balance',
      15,
      '2026-12-20',
    );
    expect(htech_plan).not.toBeNull();
    if (!htech_plan) return;
    expect(
      htech_getBudgetTransfers(htech_loan, htech_plan, '2026-12').oldCategory,
    ).toContainEqual({ month: '2026-12', delta: -10000 });
  });
});
