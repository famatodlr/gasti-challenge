import { createTool } from '@mastra/core/tools';

import {
  DEMO_FINANCIAL_MEMORY_RESOURCE_ID,
  financialMemoryPatchSchema,
  financialMemorySchema,
  updateFinancialMemory,
} from '../domain/financial-memory.ts';

export const updateFinancialMemoryTool = createTool({
  id: 'updateFinancialMemory',
  description:
    'Persist explicit user-stated or user-confirmed structured financial memory for demo-user. Never use this for inferred transaction patterns, raw transactions, transaction IDs, secrets, or arbitrary JSON.',
  inputSchema: financialMemoryPatchSchema,
  outputSchema: financialMemorySchema,
  execute: async ({ context }) => updateFinancialMemory(DEMO_FINANCIAL_MEMORY_RESOURCE_ID, context),
});
