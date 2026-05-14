import { createTool } from '@mastra/core/tools';

import {
  financialMemoryPatchSchema,
  financialMemorySchema,
  updateFinancialMemory,
} from '../domain/financial-memory.ts';
import { DEMO_USER_RESOURCE_ID } from '../domain/demo-context.ts';

export const updateFinancialMemoryTool = createTool({
  id: 'updateFinancialMemory',
  description:
    'Persist explicit user-stated or user-confirmed structured financial memory for demo-user. Never use this for inferred transaction patterns, raw transactions, transaction IDs, secrets, or arbitrary JSON.',
  inputSchema: financialMemoryPatchSchema,
  outputSchema: financialMemorySchema,
  execute: async ({ context }) => updateFinancialMemory(DEMO_USER_RESOURCE_ID, context),
});
