import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { forecastMonthEndSpend } from '../domain/analytics.ts';
import { loadTransactions } from '../domain/transaction-repository.ts';
import { categorySchema, dateRangeSchema } from '../domain/transaction.ts';

export const forecastMonthEndSpendTool = createTool({
  id: 'forecastMonthEndSpendTool',
  description: 'Project ARS month-end spend from observed month-to-date transactions and visible assumptions.',
  inputSchema: z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    monthlyIncome: z.number().optional(),
    monthlyTargetSpend: z.number().optional(),
    excludeCategoriesFromDailyRunRate: z.array(categorySchema).default(['vivienda', 'servicios', 'suscripciones']),
  }),
  outputSchema: z.object({
    periodObserved: dateRangeSchema,
    currency: z.literal('ARS'),
    observedSpend: z.number(),
    observedFixedSpend: z.number(),
    observedVariableSpend: z.number(),
    elapsedDays: z.number(),
    daysInMonth: z.number(),
    variableDailyAverage: z.number(),
    projectedVariableSpend: z.number(),
    projectedMonthEndSpend: z.number(),
    projectedRange: z.object({
      low: z.number(),
      high: z.number(),
    }),
    monthlyIncome: z.number().optional(),
    projectedSavingsOrDeficit: z.number().optional(),
    targetGap: z.number().optional(),
    assumptions: z.array(z.string()),
    confidence: z.enum(['high', 'medium', 'low']),
  }),
  execute: async ({ context }) => forecastMonthEndSpend(loadTransactions(), context),
});
