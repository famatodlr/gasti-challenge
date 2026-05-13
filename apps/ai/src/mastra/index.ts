import { Mastra } from '@mastra/core';
import { gastiFinanceAgent } from './agents/index.ts';

export {
  DEMO_RESOURCE_ID,
  LOCAL_DEMO_DEFAULT_THREAD_ID,
  SanitizedGastiMemory,
  createGastiConversationMemoryContext,
  financeTools,
  gastiConversationMemory,
  gastiFinanceAgent,
  generateGastiFinanceAgent,
  getGastiModelFallbackChain,
  getGastiModelId,
  getGeminiApiKey,
  memoryDatabasePath,
  sanitizeMastraMemoryMessagesForGasti,
  streamGastiFinanceAgent,
} from './agents/index.ts';

export const mastra: Mastra = new Mastra({
  agents: { gastiFinanceAgent },
});
