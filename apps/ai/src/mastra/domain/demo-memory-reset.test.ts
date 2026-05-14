import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createEmptyFinancialMemory } from './financial-memory.ts';
import {
  resetDemoMemory,
  type DemoMemoryResetPaths,
} from './demo-memory-reset.ts';

function createTemporaryResetPaths(): { paths: DemoMemoryResetPaths; cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), 'gasti-demo-memory-reset-'));
  const conversationDirectory = join(directory, '.mastra');
  const financialSeedPath = join(directory, 'financial-memory.seed.json');
  const financialStatePath = join(directory, 'financial-memory.json');

  mkdirSync(conversationDirectory, { recursive: true });

  const seedMemory = {
    ...createEmptyFinancialMemory(),
    knownIncome: [
      {
        label: 'Ingreso mensual',
        amount: 1500000,
        currency: 'ARS' as const,
        cadence: 'monthly' as const,
        source: 'user_stated' as const,
      },
    ],
    watchCategories: ['delivery'],
  };

  writeFileSync(financialSeedPath, `${JSON.stringify(seedMemory, null, 2)}\n`);
  writeFileSync(
    financialStatePath,
    `${JSON.stringify(
      {
        ...createEmptyFinancialMemory(),
        watchCategories: ['salud'],
      },
      null,
      2,
    )}\n`,
  );

  return {
    paths: {
      conversationDirectory,
      financialSeedPath,
      financialStatePath,
    },
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

function writeConversationFiles(conversationDirectory: string): void {
  writeFileSync(join(conversationDirectory, 'memory.db'), 'conversation-db');
  writeFileSync(join(conversationDirectory, 'memory.db-shm'), 'conversation-shm');
  writeFileSync(join(conversationDirectory, 'memory.db-wal'), 'conversation-wal');
}

test('resetDemoMemory removes the full persisted conversation state for demo mode', () => {
  const temporaryResetPaths = createTemporaryResetPaths();

  try {
    writeConversationFiles(temporaryResetPaths.paths.conversationDirectory);

    resetDemoMemory('conversation', temporaryResetPaths.paths);

    assert.equal(existsSync(join(temporaryResetPaths.paths.conversationDirectory, 'memory.db')), false);
    assert.equal(existsSync(join(temporaryResetPaths.paths.conversationDirectory, 'memory.db-shm')), false);
    assert.equal(existsSync(join(temporaryResetPaths.paths.conversationDirectory, 'memory.db-wal')), false);
    assert.equal(existsSync(temporaryResetPaths.paths.conversationDirectory), true);
  } finally {
    temporaryResetPaths.cleanup();
  }
});

test('resetDemoMemory restores the financial memory file from the immutable seed', () => {
  const temporaryResetPaths = createTemporaryResetPaths();

  try {
    resetDemoMemory('financial', temporaryResetPaths.paths);

    assert.equal(
      readFileSync(temporaryResetPaths.paths.financialStatePath, 'utf8'),
      readFileSync(temporaryResetPaths.paths.financialSeedPath, 'utf8'),
    );
  } finally {
    temporaryResetPaths.cleanup();
  }
});

test('resetDemoMemory in conversation mode leaves financial memory untouched', () => {
  const temporaryResetPaths = createTemporaryResetPaths();

  try {
    const originalFinancialState = readFileSync(temporaryResetPaths.paths.financialStatePath, 'utf8');
    writeConversationFiles(temporaryResetPaths.paths.conversationDirectory);

    resetDemoMemory('conversation', temporaryResetPaths.paths);

    assert.equal(readFileSync(temporaryResetPaths.paths.financialStatePath, 'utf8'), originalFinancialState);
  } finally {
    temporaryResetPaths.cleanup();
  }
});

test('resetDemoMemory in financial mode leaves persisted conversation files untouched', () => {
  const temporaryResetPaths = createTemporaryResetPaths();

  try {
    writeConversationFiles(temporaryResetPaths.paths.conversationDirectory);

    resetDemoMemory('financial', temporaryResetPaths.paths);

    assert.equal(existsSync(join(temporaryResetPaths.paths.conversationDirectory, 'memory.db')), true);
    assert.equal(existsSync(join(temporaryResetPaths.paths.conversationDirectory, 'memory.db-shm')), true);
    assert.equal(existsSync(join(temporaryResetPaths.paths.conversationDirectory, 'memory.db-wal')), true);
  } finally {
    temporaryResetPaths.cleanup();
  }
});
