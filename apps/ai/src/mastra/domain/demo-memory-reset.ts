import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { memoryDatabasePath } from '../agents/conversation-memory.ts';
import { defaultFinancialMemoryPath, defaultFinancialMemorySeedPath } from './financial-memory.ts';

export type DemoMemoryResetMode = 'all' | 'conversation' | 'financial';

export type DemoMemoryResetPaths = {
  conversationDirectory: string;
  financialSeedPath: string;
  financialStatePath: string;
};

export const defaultDemoMemoryResetPaths: DemoMemoryResetPaths = {
  conversationDirectory: dirname(memoryDatabasePath),
  financialSeedPath: defaultFinancialMemorySeedPath,
  financialStatePath: defaultFinancialMemoryPath,
};

const supportedResetModes = new Set<DemoMemoryResetMode>(['all', 'conversation', 'financial']);
const conversationMemoryArtifactNames = ['memory.db', 'memory.db-shm', 'memory.db-wal'] as const;

export function resetDemoMemory(
  mode: DemoMemoryResetMode = 'all',
  paths: DemoMemoryResetPaths = defaultDemoMemoryResetPaths,
): void {
  if (!supportedResetModes.has(mode)) {
    throw new Error(`Unsupported demo memory reset mode: ${mode}`);
  }

  mkdirSync(paths.conversationDirectory, { recursive: true });

  if (mode === 'all' || mode === 'conversation') {
    for (const artifactName of conversationMemoryArtifactNames) {
      rmSync(join(paths.conversationDirectory, artifactName), { force: true });
    }
  }

  if (mode === 'all' || mode === 'financial') {
    copyFileSync(paths.financialSeedPath, paths.financialStatePath);
  }
}

function printUsage(): void {
  console.log('Usage: bun apps/ai/src/mastra/domain/demo-memory-reset.ts [all|conversation|financial]');
}

function runFromCli(argv: readonly string[]): void {
  const mode = (argv[2] ?? 'all') as DemoMemoryResetMode;

  if (!supportedResetModes.has(mode)) {
    printUsage();
    throw new Error(`Unsupported demo memory reset mode: ${mode}`);
  }

  resetDemoMemory(mode);
  console.log(`Demo memory reset completed for mode "${mode}".`);
}

if (import.meta.main) {
  runFromCli(process.argv);
}
