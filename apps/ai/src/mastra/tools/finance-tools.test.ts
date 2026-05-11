import test from 'node:test';
import assert from 'node:assert/strict';

import {
  comparePeriodsTool,
  detectRecurringExpensesTool,
  findTransactionsTool,
  forecastMonthEndSpendTool,
  spendingSummaryTool,
} from './index.ts';

async function executeTool<TInput>(tool: { execute: (input: any) => Promise<unknown> }, context: TInput): Promise<unknown> {
  return tool.execute({ context, runtimeContext: {} });
}

test('finance tools execute analytics and return schema-valid outputs', async () => {
  const spendingSummary = await executeTool(spendingSummaryTool, {
    from: '2026-05-01',
    to: '2026-05-08',
    groupBy: 'category',
  });
  const parsedSpendingSummary = spendingSummaryTool.outputSchema.parse(spendingSummary);

  assert.equal(parsedSpendingSummary.currency, 'ARS');
  assert.equal(parsedSpendingSummary.total, 499698);
  assert.equal(parsedSpendingSummary.transactionCount, 15);
  assert.equal(parsedSpendingSummary.groups[0]?.key, 'vivienda');
  assert.deepEqual(
    parsedSpendingSummary.groups.map((group) => group.key),
    ['vivienda', 'salud', 'compras', 'supermercado', 'transporte', 'servicios', 'comida_fuera', 'suscripciones'],
  );

  const foundTransactions = await executeTool(findTransactionsTool, {
    from: '2026-03-15',
    to: '2026-05-08',
    query: 'Netflix',
    sortBy: 'date_desc',
    limit: 2,
  });
  const parsedFoundTransactions = findTransactionsTool.outputSchema.parse(foundTransactions);

  assert.equal(parsedFoundTransactions.currency, 'ARS');
  assert.equal(parsedFoundTransactions.transactionCount, 2);
  assert.deepEqual(
    parsedFoundTransactions.transactions.map((transaction) => ({
      id: transaction.id,
      category: transaction.category,
      rawCategory: transaction.rawCategory,
    })),
    [
      { id: 'txn_008', category: 'suscripciones', rawCategory: 'entretenimiento' },
      { id: 'txn_044', category: 'suscripciones', rawCategory: 'entretenimiento' },
    ],
  );

  const comparison = await executeTool(comparePeriodsTool, {
    currentFrom: '2026-05-01',
    currentTo: '2026-05-08',
    baselineFrom: '2026-04-01',
    baselineTo: '2026-04-30',
    groupBy: 'category',
  });
  const parsedComparison = comparePeriodsTool.outputSchema.parse(comparison);

  assert.equal(parsedComparison.currency, 'ARS');
  assert.equal(parsedComparison.current.total, 499698);
  assert.equal(parsedComparison.baseline.total, 618987);
  assert.equal(parsedComparison.delta.direction, 'down');

  const recurringExpenses = await executeTool(detectRecurringExpensesTool, {
    from: '2026-03-15',
    to: '2026-05-08',
  });
  const parsedRecurringExpenses = detectRecurringExpensesTool.outputSchema.parse(recurringExpenses);

  assert.equal(parsedRecurringExpenses.currency, 'ARS');
  assert.equal(parsedRecurringExpenses.estimatedMonthlyCommittedSpend, 344048);
  assert.ok(parsedRecurringExpenses.items.some((item) => item.merchant === 'Netflix'));

  const monthEndForecast = await executeTool(forecastMonthEndSpendTool, {
    month: '2026-05',
    asOfDate: '2026-05-08',
  });
  const parsedMonthEndForecast = forecastMonthEndSpendTool.outputSchema.parse(monthEndForecast);

  assert.equal(parsedMonthEndForecast.currency, 'ARS');
  assert.equal(parsedMonthEndForecast.observedSpend, 499698);
  assert.equal(parsedMonthEndForecast.projectedMonthEndSpend, 1109773);
  assert.equal(parsedMonthEndForecast.confidence, 'medium');
});

test('single-range finance tools require strict top-level date inputs', () => {
  assert.throws(() =>
    spendingSummaryTool.inputSchema.parse({
      to: '2026-05-08',
      groupBy: 'category',
    }),
  );

  assert.throws(() =>
    spendingSummaryTool.inputSchema.parse({
      from: '2026-05-01',
      to: '2026/05/08',
      groupBy: 'category',
    }),
  );

  assert.throws(() =>
    spendingSummaryTool.inputSchema.parse({
      from: '2026-05-01',
      to: '2026-05-08',
      from1: '2026-05-01',
      groupBy: 'category',
    }),
  );

  assert.doesNotThrow(() =>
    spendingSummaryTool.inputSchema.parse({
      from: '2026-05-01',
      to: '2026-05-08',
      groupBy: 'category',
    }),
  );
});

test('comparePeriodsTool requires strict flat date inputs for both ranges', () => {
  assert.throws(() =>
    comparePeriodsTool.inputSchema.parse({
      currentFrom: '2026-05-01',
      currentTo: '2026-05-08',
      baselineFrom: '2026-04-01',
      groupBy: 'category',
    }),
  );

  assert.throws(() =>
    comparePeriodsTool.inputSchema.parse({
      currentRange: { from: '2026-05-01', to: '2026-05-08' },
      baselineRange: { from: '2026-04-01', to: '2026-04-30' },
      groupBy: 'category',
    }),
  );

  assert.doesNotThrow(() =>
    comparePeriodsTool.inputSchema.parse({
      currentFrom: '2026-05-01',
      currentTo: '2026-05-08',
      baselineFrom: '2026-04-01',
      baselineTo: '2026-04-30',
      groupBy: 'category',
    }),
  );
});
