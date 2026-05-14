import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { findTransactions } from '../domain/analytics.ts';
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

const findTransactionsInputSchema = addDateRangeOrderValidation(
  z
    .object({
      ...flatDateRangeFields,
      categories: z.array(categorySchema).optional(),
      merchants: z.array(z.string()).optional(),
      query: z.string().optional(),
      minAmount: z.number().optional(),
      maxAmount: z.number().optional(),
      sortBy: z.enum(['date_desc', 'amount_desc', 'amount_asc']).default('date_desc'),
      limit: z.number().int().min(1).max(25).default(10),
    })
    .strict(),
  [{ fromKey: 'from', toKey: 'to' }],
);

export const findTransactionsTool = createTool({
  id: 'findTransactionsTool',
  description: 'Find exact ARS transaction rows that match date, category, merchant, query, amount, and sorting filters.',
  inputSchema: findTransactionsInputSchema,
  outputSchema: z.object({
    period: dateRangeSchema,
    periodMeta: periodMetaSchema,
    currency: z.literal('ARS'),
    filtersApplied: z.array(z.string()),
    filters: z.object({
      dateRange: dateRangeSchema.optional(),
      categories: z.array(categorySchema).optional(),
      merchants: z.array(z.string()).optional(),
      query: z.string().optional(),
      minAmount: z.number().optional(),
      maxAmount: z.number().optional(),
      sortBy: z.enum(['date_desc', 'amount_desc', 'amount_asc']),
      limit: z.number(),
    }),
    total: z.number(),
    transactionCount: z.number(),
    summary: z.object({
      total: z.number(),
      transactionCount: z.number(),
      uniqueMerchants: z.number(),
      topCategories: z.array(spendingGroupSchema),
      topMerchants: z.array(spendingGroupSchema),
      amountRange: z.object({
        min: z.number(),
        max: z.number(),
      }),
    }),
    transactions: z.array(transactionSchema),
  }),
  execute: async ({ context }) => {
    const { from, to, ...input } = context;

    return findTransactions(loadTransactions(), {
      ...input,
      dateRange: toDateRange({ from, to }),
    });
  },
});
