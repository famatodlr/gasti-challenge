import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { detectRecurringExpenses } from '../domain/analytics.ts';
import { loadTransactions } from '../domain/transaction-repository.ts';
import { categorySchema, dateRangeSchema, transactionSchema } from '../domain/transaction.ts';

export const detectRecurringExpensesTool = createTool({
  id: 'detectRecurringExpensesTool',
  description: 'Detect repeated ARS expenses, fixed costs, subscriptions, and likely recurring merchants.',
  inputSchema: z.object({
    dateRange: dateRangeSchema.optional(),
    minOccurrences: z.number().int().min(2).max(4).default(2),
    includeVariableRecurring: z.boolean().default(true),
  }),
  outputSchema: z.object({
    period: dateRangeSchema,
    currency: z.literal('ARS'),
    estimatedMonthlyCommittedSpend: z.number(),
    items: z.array(
      z.object({
        merchant: z.string(),
        category: categorySchema,
        cadence: z.enum(['monthly', 'weekly', 'irregular_repeat']),
        latestAmount: z.number(),
        averageAmount: z.number(),
        estimatedMonthlyAmount: z.number(),
        occurrences: z.array(transactionSchema),
        confidence: z.enum(['high', 'medium', 'low']),
        reason: z.string(),
        possibleZombie: z.boolean(),
      }),
    ),
    caveats: z.array(z.string()),
  }),
  execute: async ({ context }) => detectRecurringExpenses(loadTransactions(), context),
});
