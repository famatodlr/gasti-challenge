import test from 'node:test';
import assert from 'node:assert/strict';

import { financeContextSchema, getFinanceContext } from './finance-context.ts';
import { loadTransactions } from './transaction-repository.ts';

const transactions = loadTransactions();

test('builds finance context metadata from the available transaction dataset', () => {
  const context = financeContextSchema.parse(getFinanceContext(transactions, { today: '2026-05-14' }));

  assert.equal(context.today, '2026-05-14');
  assert.equal(context.currency, 'ARS');
  assert.deepEqual(context.availableDateRange, {
    from: '2026-03-15',
    to: '2026-05-08',
  });
  assert.deepEqual(context.availableMonths, [
    {
      year: 2026,
      month: 3,
      label: 'marzo de 2026',
      from: '2026-03-01',
      to: '2026-03-31',
      transactionCount: 3,
    },
    {
      year: 2026,
      month: 4,
      label: 'abril de 2026',
      from: '2026-04-01',
      to: '2026-04-30',
      transactionCount: 32,
    },
    {
      year: 2026,
      month: 5,
      label: 'mayo de 2026',
      from: '2026-05-01',
      to: '2026-05-31',
      transactionCount: 15,
    },
  ]);
});

test('finance context does not expose raw transactions', () => {
  const context = getFinanceContext(transactions);
  const contextRecord = context as Record<string, unknown>;
  const serializedContext = JSON.stringify(context);

  assert.equal(Object.prototype.hasOwnProperty.call(contextRecord, 'transactions'), false);
  assert.equal(serializedContext.includes('txn_'), false);
  assert.equal(serializedContext.includes('Rappi'), false);
});
