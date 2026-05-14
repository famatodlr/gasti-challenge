import { Mastra } from '@mastra/core';
import { gastiFinanceAgent } from './agents/index.ts';
import {
  greetingFinancialSnapshotWorkflow,
  monthlyFinancialReviewWorkflow,
} from './workflows/index.ts';

export {
  SanitizedGastiMemory,
  buildGastiResponseMarkdown,
  buildSafeGastiResponseFallback,
  createDemoMemoryContext,
  createGastiConversationMemoryContext,
  DEMO_DEFAULT_MEMORY_THREAD_ID,
  DEMO_USER_RESOURCE_ID,
  financeTools,
  gastiConversationMemory,
  gastiFinanceAgent,
  gastiResponseKindSchema,
  gastiStructuredResponseSchema,
  generateGastiFinanceAgent,
  generateWithGastiModelFallback,
  GastiModelFallbackExhaustedError,
  normalizeGastiStructuredResponse,
  normalizeDemoResourceId,
  normalizeDemoThreadId,
  getGastiModelFallbackChain,
  getGastiModelId,
  getGeminiApiKey,
  isGastiQuotaOrRateLimitError,
  memoryDatabasePath,
  sanitizeMastraMemoryMessagesForGasti,
  streamGastiFinanceAgent,
} from './agents/index.ts';
export type { GastiResponseKind, GastiStructuredResponse } from './agents/index.ts';
export {
  GREETING_WORKFLOW_ACTIVITY_LABELS,
  MONTHLY_REVIEW_ACTIVITY_LABELS,
  buildDeterministicGreetingAnswer,
  buildDeterministicMonthlyReviewAnswer,
  createGreetingFinancialSnapshotWorkflow,
  createMonthlyFinancialReviewWorkflow,
  detectGastiWorkflowIntent,
  generateGreetingAnswerWithAgent,
  generateMonthlyReviewAnswerWithAgent,
  greetingFinancialSnapshotWorkflow,
  isGreetingFinancialSnapshotIntent,
  isMonthlyFinancialReviewIntent,
  monthlyFinancialReviewWorkflow,
  runGreetingFinancialSnapshotWorkflow,
  runMonthlyFinancialReviewWorkflow,
} from './workflows/index.ts';
export type {
  GastiWorkflowIntent,
  GreetingAnswerGenerator,
  GreetingAnswerGeneratorInput,
  GreetingFinancialSnapshot,
  GreetingWorkflowInput,
  GreetingWorkflowOutput,
  MonthlyReviewAnswerGenerator,
  MonthlyReviewAnswerGeneratorInput,
  MonthlyReviewResult,
  MonthlyReviewWorkflowInput,
  MonthlyReviewWorkflowOutput,
} from './workflows/index.ts';

export const mastra: Mastra = new Mastra({
  agents: { gastiFinanceAgent },
  workflows: {
    greetingFinancialSnapshotWorkflow,
    monthlyFinancialReviewWorkflow,
  },
});
