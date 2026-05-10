import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { findTransactions } from '../domain/analytics.ts';
import { loadTransactions } from '../domain/transaction-repository.ts';
import { categorySchema, dateRangeSchema, transactionSchema } from '../domain/transaction.ts';

export const findTransactionsTool = createTool({
  id: 'findTransactionsTool',
  description: 'Find exact ARS transaction rows that match date, category, merchant, query, amount, and sorting filters.',
  inputSchema: z.object({
    dateRange: dateRangeSchema.optional(),
    categories: z.array(categorySchema).optional(),
    merchants: z.array(z.string()).optional(),
    query: z.string().optional(),
    minAmount: z.number().optional(),
    maxAmount: z.number().optional(),
    sortBy: z.enum(['date_desc', 'amount_desc', 'amount_asc']).default('date_desc'),
    limit: z.number().int().min(1).max(25).default(10),
  }),
  outputSchema: z.object({
    period: dateRangeSchema,
    currency: z.literal('ARS'),
    filtersApplied: z.array(z.string()),
    total: z.number(),
    transactionCount: z.number(),
    transactions: z.array(transactionSchema),
  }),
  execute: async ({ context }) => findTransactions(loadTransactions(), context),
});
