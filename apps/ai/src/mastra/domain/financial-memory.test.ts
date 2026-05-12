import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptyFinancialMemory,
  financialMemorySchema,
  loadFinancialMemory,
} from './financial-memory.ts';

test('creates empty financial memory defaults for the demo user', () => {
  const memory = financialMemorySchema.parse(createEmptyFinancialMemory());

  assert.equal(memory.schemaVersion, 1);
  assert.equal(memory.resourceId, 'demo-user');
  assert.equal(memory.currency, 'ARS');
  assert.deepEqual(memory.knownIncome, []);
  assert.deepEqual(memory.fixedExpenses, []);
  assert.deepEqual(memory.savingGoals, []);
  assert.deepEqual(memory.watchCategories, []);
  assert.deepEqual(memory.recurringObservations, []);
  assert.deepEqual(memory.preferences, {
    preferredLanguage: 'es-AR',
    answerStyle: 'concise',
    includeEvidence: true,
  });
});

test('loads the deterministic financial memory fixture', () => {
  const memory = financialMemorySchema.parse(loadFinancialMemory());

  assert.equal(memory.resourceId, 'demo-user');
  assert.equal(memory.currency, 'ARS');
  assert.deepEqual(memory.knownIncome, []);
  assert.deepEqual(memory.fixedExpenses, []);
  assert.deepEqual(memory.savingGoals, []);
});

test('financial memory rejects unknown watch categories', () => {
  const memory = createEmptyFinancialMemory();

  assert.throws(() =>
    financialMemorySchema.parse({
      ...memory,
      watchCategories: ['delivery'],
    }),
  );
});

test('financial memory is scoped to the demo user resource', () => {
  const memory = createEmptyFinancialMemory();

  assert.throws(() =>
    financialMemorySchema.parse({
      ...memory,
      resourceId: 'other-user',
    }),
  );
});

test('financial memory does not expose raw transactions', () => {
  const memory = loadFinancialMemory();
  const serializedMemory = JSON.stringify(memory);

  assert.equal(serializedMemory.includes('txn_'), false);
  assert.equal(serializedMemory.includes('transactions'), false);
});
