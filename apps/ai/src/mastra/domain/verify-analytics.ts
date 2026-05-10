import {
  comparePeriods,
  detectRecurringExpenses,
  forecastMonthEndSpend,
  summarizeSpending,
} from './analytics.ts';
import { loadTransactions } from './transaction-repository.ts';
import { formatARS } from './transaction.ts';

const expectedMonthlyCommittedSpend = 344048;
const transactions = loadTransactions();

const maySummary = summarizeSpending(transactions, {
  dateRange: { from: '2026-05-01', to: '2026-05-08' },
  groupBy: 'category',
});

const aprilVsMay = comparePeriods(transactions, {
  currentRange: { from: '2026-05-01', to: '2026-05-08' },
  baselineRange: { from: '2026-04-01', to: '2026-04-30' },
  groupBy: 'category',
});

const recurring = detectRecurringExpenses(transactions, {
  dateRange: { from: '2026-03-15', to: '2026-05-08' },
});

const mayForecast = forecastMonthEndSpend(transactions, {
  month: '2026-05',
  asOfDate: '2026-05-08',
});

if (recurring.estimatedMonthlyCommittedSpend !== expectedMonthlyCommittedSpend) {
  throw new Error(
    `Expected committed recurring spend to be ${expectedMonthlyCommittedSpend}, got ${recurring.estimatedMonthlyCommittedSpend}`,
  );
}

console.log(
  JSON.stringify(
    {
      maySpendingTotal: {
        period: maySummary.period,
        total: maySummary.total,
        formattedTotal: formatARS(maySummary.total),
        transactionCount: maySummary.transactionCount,
        categoryBreakdown: maySummary.groups.map((group) => ({
          category: group.key,
          total: group.total,
          formattedTotal: formatARS(group.total),
          transactionCount: group.count,
          sharePct: group.sharePct,
        })),
      },
      aprilVsMayComparison: {
        current: aprilVsMay.current,
        baseline: aprilVsMay.baseline,
        delta: aprilVsMay.delta,
        caveats: aprilVsMay.caveats,
      },
      recurringExpensesDetection: {
        expectedMonthlyCommittedSpend,
        estimatedMonthlyCommittedSpend: recurring.estimatedMonthlyCommittedSpend,
        formattedEstimatedMonthlyCommittedSpend: formatARS(recurring.estimatedMonthlyCommittedSpend),
        merchants: recurring.items.map((item) => ({
          merchant: item.merchant,
          cadence: item.cadence,
          confidence: item.confidence,
          estimatedMonthlyAmount: item.estimatedMonthlyAmount,
        })),
      },
      mayProjectionAsOf20260508: {
        observedSpend: mayForecast.observedSpend,
        observedFixedSpend: mayForecast.observedFixedSpend,
        observedVariableSpend: mayForecast.observedVariableSpend,
        variableDailyAverage: mayForecast.variableDailyAverage,
        projectedMonthEndSpend: mayForecast.projectedMonthEndSpend,
        formattedProjectedMonthEndSpend: formatARS(mayForecast.projectedMonthEndSpend),
        confidence: mayForecast.confidence,
        assumptions: mayForecast.assumptions,
      },
    },
    null,
    2,
  ),
);
