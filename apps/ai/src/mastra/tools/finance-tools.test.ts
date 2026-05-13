import test from 'node:test';
import assert from 'node:assert/strict';

import {
  comparePeriodsTool,
  detectRecurringExpensesTool,
  findTransactionsTool,
  forecastMonthEndSpendTool,
  getFinanceContextTool,
  getFinancialMemoryTool,
  spendingSummaryTool,
  updateFinancialMemoryTool,
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
    [
      'vivienda',
      'salud',
      'compras',
      'supermercado',
      'transporte',
      'servicios',
      'delivery',
      'suscripciones',
      'comida_fuera',
    ],
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

test('getFinanceContextTool exposes dataset metadata without raw transactions', async () => {
  const financeContext = await executeTool(getFinanceContextTool, {});
  const parsedFinanceContext = getFinanceContextTool.outputSchema.parse(financeContext);

  assert.equal(parsedFinanceContext.today, '2026-05-12');
  assert.equal(parsedFinanceContext.currency, 'ARS');
  assert.deepEqual(parsedFinanceContext.availableDateRange, {
    from: '2026-03-15',
    to: '2026-05-08',
  });
  assert.deepEqual(
    parsedFinanceContext.availableMonths.map(({ year, month, label, transactionCount }) => ({
      year,
      month,
      label,
      transactionCount,
    })),
    [
      { year: 2026, month: 3, label: 'marzo de 2026', transactionCount: 3 },
      { year: 2026, month: 4, label: 'abril de 2026', transactionCount: 32 },
      { year: 2026, month: 5, label: 'mayo de 2026', transactionCount: 15 },
    ],
  );
  assert.equal(JSON.stringify(parsedFinanceContext).includes('txn_'), false);
});

test('getFinancialMemoryTool exposes structured user context without raw transactions', async () => {
  const financialMemory = await executeTool(getFinancialMemoryTool, {});
  const parsedFinancialMemory = getFinancialMemoryTool.outputSchema.parse(financialMemory);

  assert.equal(parsedFinancialMemory.schemaVersion, 1);
  assert.equal(parsedFinancialMemory.resourceId, 'demo-user');
  assert.equal(parsedFinancialMemory.currency, 'ARS');
  assert.deepEqual(parsedFinancialMemory.knownIncome, [
    {
      label: 'Ingreso mensual',
      amount: 1500000,
      currency: 'ARS',
      cadence: 'monthly',
      source: 'user_stated',
    },
  ]);
  assert.deepEqual(parsedFinancialMemory.fixedExpenses, []);
  assert.deepEqual(parsedFinancialMemory.savingGoals, [
    {
      name: 'Viaje a Japón',
      targetAmount: 1000000,
      currency: 'ARS',
      targetDate: '2025-01-01',
      source: 'user_stated',
    },
  ]);
  assert.deepEqual(parsedFinancialMemory.watchCategories, ['delivery']);
  assert.deepEqual(parsedFinancialMemory.recurringObservations, []);
  assert.deepEqual(parsedFinancialMemory.preferences, {
    preferredLanguage: 'es-AR',
    answerStyle: 'concise',
    includeEvidence: true,
  });
  assert.equal(JSON.stringify(parsedFinancialMemory).includes('txn_'), false);
  assert.equal(JSON.stringify(parsedFinancialMemory).includes('transactions'), false);
});

test('updateFinancialMemoryTool exposes a strict structured patch schema', () => {
  assert.equal(updateFinancialMemoryTool.id, 'updateFinancialMemory');
  assert.doesNotThrow(() =>
    updateFinancialMemoryTool.inputSchema.parse({
      knownIncome: [
        {
          amount: 1500000,
          currency: 'ARS',
          cadence: 'monthly',
          source: 'user_stated',
        },
      ],
      savingGoals: [
        {
          name: 'Viaje a Japon',
          currency: 'ARS',
          source: 'user_stated',
        },
      ],
      watchCategories: ['delivery'],
    }),
  );
  assert.throws(() =>
    updateFinancialMemoryTool.inputSchema.parse({
      transactions: [{ id: 'txn_001', amount: 4500 }],
    }),
  );
});

test('April questions can resolve to the dataset year from finance context', async () => {
  const financeContext = getFinanceContextTool.outputSchema.parse(await executeTool(getFinanceContextTool, {}));
  const april = financeContext.availableMonths.find((month) => month.label === 'abril de 2026');

  assert.ok(april);

  const aprilSummary = spendingSummaryTool.outputSchema.parse(
    await executeTool(spendingSummaryTool, {
      from: april.from,
      to: april.to,
      groupBy: 'category',
    }),
  );

  assert.equal(aprilSummary.period.from, '2026-04-01');
  assert.equal(aprilSummary.period.to, '2026-04-30');
  assert.equal(aprilSummary.transactionCount, 32);
  assert.notEqual(aprilSummary.total, 0);
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
