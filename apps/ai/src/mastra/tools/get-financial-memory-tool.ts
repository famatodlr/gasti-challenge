import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { financialMemorySchema, loadFinancialMemory } from '../domain/financial-memory.ts';

const getFinancialMemoryInputSchema = z.object({}).strict();

export const getFinancialMemoryTool = createTool({
  id: 'getFinancialMemory',
  description:
    'Return deterministic user-level financial memory: known income, fixed expenses, saving goals, watch categories, recurring observations, and preferences.',
  inputSchema: getFinancialMemoryInputSchema,
  outputSchema: financialMemorySchema,
  execute: async () => loadFinancialMemory(),
});
