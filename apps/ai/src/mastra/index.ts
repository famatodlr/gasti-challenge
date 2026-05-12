import { Mastra } from '@mastra/core';
import { gastiFinanceAgent } from './agents/index.ts';

export {
  financeTools,
  gastiFinanceAgent,
  generateGastiFinanceAgent,
  getGastiModelFallbackChain,
  getGastiModelId,
  getGeminiApiKey,
} from './agents/index.ts';

export const mastra: Mastra = new Mastra({
  agents: { gastiFinanceAgent },
});
