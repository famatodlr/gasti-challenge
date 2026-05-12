import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { financeContextSchema, getFinanceContext } from '../domain/finance-context.ts';
import { loadTransactions } from '../domain/transaction-repository.ts';

const getFinanceContextInputSchema = z.object({}).strict();

export const getFinanceContextTool = createTool({
  id: 'getFinanceContext',
  description:
    'Return deterministic ARS transaction dataset metadata: reference date, available date range, and available months with counts.',
  inputSchema: getFinanceContextInputSchema,
  outputSchema: financeContextSchema,
  execute: async () => getFinanceContext(loadTransactions()),
});
