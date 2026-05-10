import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { comparePeriods } from '../domain/analytics.ts';
import { loadTransactions } from '../domain/transaction-repository.ts';
import { categorySchema, dateRangeSchema } from '../domain/transaction.ts';

export const comparePeriodsTool = createTool({
  id: 'comparePeriodsTool',
  description: 'Compare ARS spending between two inclusive date ranges by total, category, or merchant.',
  inputSchema: z.object({
    currentRange: dateRangeSchema,
    baselineRange: dateRangeSchema,
    groupBy: z.enum(['category', 'merchant']).default('category'),
    categories: z.array(categorySchema).optional(),
  }),
  outputSchema: z.object({
    currency: z.literal('ARS'),
    current: z.object({
      period: dateRangeSchema,
      total: z.number(),
      transactionCount: z.number(),
    }),
    baseline: z.object({
      period: dateRangeSchema,
      total: z.number(),
      transactionCount: z.number(),
    }),
    delta: z.object({
      amount: z.number(),
      percent: z.number().nullable(),
      direction: z.enum(['up', 'down', 'flat']),
    }),
    groups: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        currentTotal: z.number(),
        baselineTotal: z.number(),
        deltaAmount: z.number(),
        deltaPercent: z.number().nullable(),
        driverTransactionIds: z.array(z.string()),
      }),
    ),
    caveats: z.array(z.string()),
  }),
  execute: async ({ context }) => comparePeriods(loadTransactions(), context),
});
