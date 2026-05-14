import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { summarizeSpending } from '../domain/analytics.ts';
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

const spendingGroupSchema = z.object({
  key: z.string(),
  label: z.string(),
  total: z.number(),
  count: z.number(),
  sharePct: z.number(),
  transactionIds: z.array(z.string()),
});

const spendingSummaryInputSchema = addDateRangeOrderValidation(
  z
    .object({
      ...flatDateRangeFields,
      categories: z.array(categorySchema).optional(),
      merchants: z.array(z.string()).optional(),
      groupBy: z.enum(['category', 'merchant', 'day', 'week']).default('category'),
      includeTopTransactions: z.boolean().default(true),
      topTransactionLimit: z.number().int().min(1).max(10).default(5),
    })
    .strict(),
  [{ fromKey: 'from', toKey: 'to' }],
);

export const spendingSummaryTool = createTool({
  id: 'spendingSummaryTool',
  description: 'Summarize ARS spending by category, merchant, day, or week with optional top transactions.',
  inputSchema: spendingSummaryInputSchema,
  outputSchema: z.object({
    period: dateRangeSchema,
    periodMeta: periodMetaSchema,
    currency: z.literal('ARS'),
    total: z.number(),
    transactionCount: z.number(),
    groups: z.array(spendingGroupSchema),
    topGroups: z.array(spendingGroupSchema),
    topMerchants: z.array(spendingGroupSchema),
    highlights: z.object({
      dominantGroup: spendingGroupSchema.optional(),
      dominantMerchant: spendingGroupSchema.optional(),
      largestTransaction: z
        .object({
          id: z.string(),
          merchant: z.string(),
          category: categorySchema,
          amount: z.number(),
          date: z.string(),
        })
        .optional(),
    }),
    topTransactions: z.array(transactionSchema),
    assumptions: z.array(z.string()),
  }),
  execute: async ({ context }) => {
    const { from, to, ...input } = context;

    return summarizeSpending(loadTransactions(), {
      ...input,
      dateRange: toDateRange({ from, to }),
    });
  },
});
