import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { comparePeriods } from '../domain/analytics.ts';
import { loadTransactions } from '../domain/transaction-repository.ts';
import { categorySchema, dateRangeSchema } from '../domain/transaction.ts';
import { addDateRangeOrderValidation, compareDateRangeFields, toCompareDateRanges } from './date-input.ts';

const comparePeriodsInputSchema = addDateRangeOrderValidation(
  z
    .object({
      ...compareDateRangeFields,
      groupBy: z.enum(['category', 'merchant']).default('category'),
      categories: z.array(categorySchema).optional(),
    })
    .strict(),
  [
    { fromKey: 'currentFrom', toKey: 'currentTo' },
    { fromKey: 'baselineFrom', toKey: 'baselineTo' },
  ],
);

export const comparePeriodsTool = createTool({
  id: 'comparePeriodsTool',
  description: 'Compare ARS spending between two inclusive date ranges by total, category, or merchant.',
  inputSchema: comparePeriodsInputSchema,
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
  execute: async ({ context }) => {
    const { currentFrom, currentTo, baselineFrom, baselineTo, ...input } = context;

    return comparePeriods(loadTransactions(), {
      ...input,
      ...toCompareDateRanges({ currentFrom, currentTo, baselineFrom, baselineTo }),
    });
  },
});
