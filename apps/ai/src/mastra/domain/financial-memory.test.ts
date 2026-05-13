import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createEmptyFinancialMemory,
  financialMemorySchema,
  loadFinancialMemory,
  updateFinancialMemory,
} from './financial-memory.ts';

function createTemporaryMemoryFile(): { path: string; cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), 'gasti-financial-memory-'));
  const path = join(directory, 'financial-memory.json');

  writeFileSync(path, `${JSON.stringify(createEmptyFinancialMemory(), null, 2)}\n`);

  return {
    path,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

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

test('financial memory accepts delivery as a watch category', () => {
  const memory = createEmptyFinancialMemory();

  assert.doesNotThrow(() =>
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

test('updateFinancialMemory persists monthly income for a later independent read', () => {
  const temporaryMemory = createTemporaryMemoryFile();

  try {
    const updated = updateFinancialMemory(
      'demo-user',
      {
        knownIncome: [
          {
            amount: 1500000,
            currency: 'ARS',
            cadence: 'monthly',
            source: 'user_stated',
          },
        ],
      },
      temporaryMemory.path,
    );
    const laterRead = loadFinancialMemory(temporaryMemory.path);

    assert.deepEqual(updated.knownIncome, [
      {
        label: 'Ingreso mensual',
        amount: 1500000,
        currency: 'ARS',
        cadence: 'monthly',
        source: 'user_stated',
      },
    ]);
    assert.deepEqual(laterRead.knownIncome, updated.knownIncome);
  } finally {
    temporaryMemory.cleanup();
  }
});

test('updateFinancialMemory can add a saving goal without a target amount', () => {
  const temporaryMemory = createTemporaryMemoryFile();

  try {
    const updated = updateFinancialMemory(
      'demo-user',
      {
        savingGoals: [
          {
            name: 'Viaje a Japon',
            currency: 'ARS',
            targetDate: '2027-01-01',
            source: 'user_stated',
          },
        ],
      },
      temporaryMemory.path,
    );

    assert.deepEqual(updated.savingGoals, [
      {
        name: 'Viaje a Japon',
        currency: 'ARS',
        targetDate: '2027-01-01',
        source: 'user_stated',
      },
    ]);
  } finally {
    temporaryMemory.cleanup();
  }
});

test('updateFinancialMemory can add watch categories', () => {
  const temporaryMemory = createTemporaryMemoryFile();

  try {
    const updated = updateFinancialMemory(
      'demo-user',
      {
        watchCategories: ['delivery', 'supermercado'],
      },
      temporaryMemory.path,
    );

    assert.deepEqual(updated.watchCategories, ['delivery', 'supermercado']);
  } finally {
    temporaryMemory.cleanup();
  }
});

test('updateFinancialMemory rejects unknown categories', () => {
  const temporaryMemory = createTemporaryMemoryFile();

  try {
    assert.throws(() =>
      updateFinancialMemory(
        'demo-user',
        {
          watchCategories: ['crypto'],
        },
        temporaryMemory.path,
      ),
    );
  } finally {
    temporaryMemory.cleanup();
  }
});

test('updateFinancialMemory rejects raw transaction-like data and unsupported fields', () => {
  const temporaryMemory = createTemporaryMemoryFile();

  try {
    assert.throws(() =>
      updateFinancialMemory(
        'demo-user',
        {
          transactions: [{ id: 'txn_001', amount: 4500 }],
        },
        temporaryMemory.path,
      ),
    );
    assert.throws(() =>
      updateFinancialMemory(
        'demo-user',
        {
          savingGoals: [
            {
              name: 'Viaje a Japon',
              currency: 'ARS',
              source: 'user_confirmed',
              notes: 'Basado en txn_001',
            },
          ],
        },
        temporaryMemory.path,
      ),
    );
    assert.equal(readFileSync(temporaryMemory.path, 'utf8').includes('txn_001'), false);
  } finally {
    temporaryMemory.cleanup();
  }
});

test('updateFinancialMemory deduplicates append-only memory fields', () => {
  const temporaryMemory = createTemporaryMemoryFile();

  try {
    const updated = updateFinancialMemory(
      'demo-user',
      {
        fixedExpenses: [
          {
            merchant: 'Netflix',
            category: 'suscripciones',
            amount: 5499,
            currency: 'ARS',
            cadence: 'monthly',
            source: 'user_confirmed',
          },
          {
            merchant: 'netflix',
            category: 'suscripciones',
            amount: 5499,
            currency: 'ARS',
            cadence: 'monthly',
            source: 'user_confirmed',
          },
        ],
        savingGoals: [
          {
            name: 'Viaje a Japon',
            currency: 'ARS',
            source: 'user_stated',
          },
          {
            name: 'viaje a japon',
            currency: 'ARS',
            source: 'user_confirmed',
            monthlyContributionTarget: 100000,
          },
        ],
        watchCategories: ['delivery', 'delivery'],
        recurringObservations: [
          {
            merchant: 'Rappi',
            category: 'delivery',
            observation: 'Quiero vigilarlo',
            preference: 'watch',
            source: 'user_stated',
          },
          {
            merchant: 'rappi',
            category: 'delivery',
            observation: 'quiero vigilarlo',
            preference: 'watch',
            source: 'user_confirmed',
          },
        ],
      },
      temporaryMemory.path,
    );

    assert.equal(updated.fixedExpenses.length, 1);
    assert.equal(updated.savingGoals.length, 1);
    assert.deepEqual(updated.watchCategories, ['delivery']);
    assert.equal(updated.recurringObservations.length, 1);
    assert.equal(updated.savingGoals[0]?.monthlyContributionTarget, 100000);
  } finally {
    temporaryMemory.cleanup();
  }
});
