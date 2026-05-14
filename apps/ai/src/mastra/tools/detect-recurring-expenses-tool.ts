import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { detectRecurringExpenses } from '../domain/analytics.ts';
import { loadTransactions } from '../domain/transaction-repository.ts';
import { categorySchema, dateRangeSchema, transactionSchema } from '../domain/transaction.ts';
import { addDateRangeOrderValidation, flatDateRangeFields, toDateRange } from './date-input.ts';

const periodMetaSchema = z.object({
  dayCount: z.number(),
  spansSingleMonth: z.boolean(),
  isFullCalendarMonth: z.boolean(),
  isMonthToDate: z.boolean(),
  completeness: z.enum(['complete', 'partial']),
  partialReason: z.enum(['latest_dataset_month_to_date']).optional(),
});

const detectRecurringExpensesInputSchema = addDateRangeOrderValidation(
  z
    .object({
      ...flatDateRangeFields,
      minOccurrences: z.number().int().min(2).max(4).default(2),
      includeVariableRecurring: z.boolean().default(true),
    })
    .strict(),
  [{ fromKey: 'from', toKey: 'to' }],
);

export const detectRecurringExpensesTool = createTool({
  id: 'detectRecurringExpensesTool',
  description: 'Detect repeated ARS expenses, fixed costs, subscriptions, and likely recurring merchants.',
  inputSchema: detectRecurringExpensesInputSchema,
  outputSchema: z.object({
    period: dateRangeSchema,
    periodMeta: periodMetaSchema,
    currency: z.literal('ARS'),
    estimatedMonthlyCommittedSpend: z.number(),
    summary: z.object({
      committedMonthlyTotal: z.number(),
      highConfidenceCount: z.number(),
      possibleZombieCount: z.number(),
      fixedLikeCount: z.number(),
      variableRepeatCount: z.number(),
    }),
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
        occurrenceCount: z.number(),
        firstSeen: z.string(),
        lastSeen: z.string(),
        classification: z.enum(['compromiso', 'repeticion_variable']),
        occurrenceIds: z.array(z.string()),
      }),
    ),
    caveats: z.array(z.string()),
  }),
  execute: async ({ context }) => {
    const { from, to, ...input } = context;

    return detectRecurringExpenses(loadTransactions(), {
      ...input,
      dateRange: toDateRange({ from, to }),
    });
  },
});
