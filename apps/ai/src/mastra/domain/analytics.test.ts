import test from 'node:test';
import assert from 'node:assert/strict';

import { comparePeriods, detectRecurringExpenses, forecastMonthEndSpend, summarizeSpending } from './analytics.ts';
import { loadTransactions } from './transaction-repository.ts';
import { formatARS } from './transaction.ts';

const transactions = loadTransactions();

test('loads the normalized transaction dataset in ascending calculation order', () => {
  assert.equal(transactions.length, 50);
  assert.equal(transactions[0]?.id, 'txn_050');
  assert.equal(transactions.at(-1)?.id, 'txn_002');
  assert.deepEqual(
    Array.from(new Set(transactions.map((transaction) => transaction.rawCategory))).sort(),
    ['comida', 'educacion', 'entretenimiento', 'otros', 'salud', 'servicios', 'transporte'],
  );
  assert.deepEqual(
    Array.from(new Set(transactions.map((transaction) => transaction.category))).sort(),
    [
      'comida_fuera',
      'compras',
      'educacion',
      'ocio',
      'salud',
      'servicios',
      'supermercado',
      'suscripciones',
      'transporte',
      'vivienda',
    ],
  );
  assert.deepEqual(
    transactions
      .filter((transaction) => transaction.merchant === 'Propietario')
      .map(({ id, category, rawCategory }) => ({ id, category, rawCategory })),
    [
      { id: 'txn_047', category: 'vivienda', rawCategory: 'otros' },
      { id: 'txn_014', category: 'vivienda', rawCategory: 'otros' },
    ],
  );
});

test('summarizes May spending with category groups and top transactions', () => {
  const summary = summarizeSpending(transactions, {
    dateRange: { from: '2026-05-01', to: '2026-05-08' },
    groupBy: 'category',
  });

  assert.equal(summary.period.from, '2026-05-01');
  assert.equal(summary.period.to, '2026-05-08');
  assert.equal(summary.currency, 'ARS');
  assert.equal(summary.total, 499698);
  assert.equal(summary.transactionCount, 15);
  assert.equal(summary.groups[0]?.key, 'vivienda');
  assert.equal(summary.groups[0]?.total, 250000);
  assert.deepEqual(
    summary.groups.map(({ key, total, count }) => ({ key, total, count })),
    [
      { key: 'vivienda', total: 250000, count: 1 },
      { key: 'salud', total: 83900, count: 2 },
      { key: 'compras', total: 45000, count: 1 },
      { key: 'supermercado', total: 38500, count: 1 },
      { key: 'transporte', total: 29300, count: 4 },
      { key: 'servicios', total: 28500, count: 1 },
      { key: 'comida_fuera', total: 15500, count: 3 },
      { key: 'suscripciones', total: 8998, count: 2 },
    ],
  );
  assert.equal(summary.topTransactions[0]?.id, 'txn_014');
  assert.equal(formatARS(summary.total), 'ARS 499.698');
});

test('compares full April with May to date and exposes a partial-period caveat', () => {
  const comparison = comparePeriods(transactions, {
    currentRange: { from: '2026-05-01', to: '2026-05-08' },
    baselineRange: { from: '2026-04-01', to: '2026-04-30' },
    groupBy: 'category',
  });

  assert.equal(comparison.current.total, 499698);
  assert.equal(comparison.baseline.total, 618987);
  assert.equal(comparison.delta.amount, -119289);
  assert.equal(comparison.delta.direction, 'down');
  assert.ok(comparison.caveats.some((caveat) => caveat.includes('different lengths')));
  assert.equal(comparison.groups.find((group) => group.key === 'salud')?.deltaAmount, 56500);
});

test('detects repeated subscriptions and fixed bills as recurring expenses', () => {
  const recurring = detectRecurringExpenses(transactions, {
    dateRange: { from: '2026-03-15', to: '2026-05-08' },
  });

  const merchants = recurring.items.map((item) => item.merchant);
  const committedMerchants = ['Propietario', 'Edenor', 'SportClub', 'Personal', 'Movistar', 'Netflix', 'Spotify'];
  const variableRepeatMerchants = ['Mercado Libre', 'Uber', 'Rappi', 'Farmacity', 'PedidosYa', 'Cabify', 'SUBE'];

  assert.ok(merchants.includes('Netflix'));
  assert.ok(merchants.includes('Spotify'));
  assert.ok(merchants.includes('Propietario'));
  assert.equal(recurring.estimatedMonthlyCommittedSpend, 344048);
  assert.equal(recurring.items.find((item) => item.merchant === 'Netflix')?.confidence, 'high');
  assert.equal(recurring.items.find((item) => item.merchant === 'Spotify')?.cadence, 'monthly');

  for (const merchant of variableRepeatMerchants) {
    assert.ok(merchants.includes(merchant));
    assert.equal(recurring.items.find((item) => item.merchant === merchant)?.confidence, 'low');
  }

  const committedTotal = recurring.items
    .filter((item) => committedMerchants.includes(item.merchant))
    .reduce((total, item) => total + item.estimatedMonthlyAmount, 0);

  assert.equal(committedTotal, recurring.estimatedMonthlyCommittedSpend);
});

test('forecasts May month-end spend as of 2026-05-08', () => {
  const forecast = forecastMonthEndSpend(transactions, {
    month: '2026-05',
    asOfDate: '2026-05-08',
  });

  assert.equal(forecast.periodObserved.from, '2026-05-01');
  assert.equal(forecast.periodObserved.to, '2026-05-08');
  assert.equal(forecast.observedSpend, 499698);
  assert.equal(forecast.observedFixedSpend, 287498);
  assert.equal(forecast.observedVariableSpend, 212200);
  assert.equal(forecast.elapsedDays, 8);
  assert.equal(forecast.daysInMonth, 31);
  assert.equal(forecast.variableDailyAverage, 26525);
  assert.equal(forecast.projectedVariableSpend, 822275);
  assert.equal(forecast.projectedMonthEndSpend, 1109773);
  assert.equal(forecast.confidence, 'medium');
});
