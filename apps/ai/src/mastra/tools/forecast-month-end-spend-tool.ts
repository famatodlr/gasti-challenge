import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { forecastMonthEndSpend } from '../domain/analytics.ts';
import { loadTransactions } from '../domain/transaction-repository.ts';
import { categorySchema, dateRangeSchema } from '../domain/transaction.ts';

const periodMetaSchema = z.object({
  dayCount: z.number(),
  spansSingleMonth: z.boolean(),
  isFullCalendarMonth: z.boolean(),
  isMonthToDate: z.boolean(),
  completeness: z.enum(['complete', 'partial']),
  partialReason: z.enum(['latest_dataset_month_to_date']).optional(),
});

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
    periodMeta: periodMetaSchema,
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
    projectionBasis: z.object({
      mode: z.literal('month_to_date_run_rate'),
      observedDayCount: z.number(),
      remainingDayCount: z.number(),
      fixedCategoriesExcludedFromRunRate: z.array(categorySchema),
    }),
    drivers: z.object({
      fixedSharePct: z.number(),
      variableSharePct: z.number(),
    }),
    assumptions: z.array(z.string()),
    confidence: z.enum(['high', 'medium', 'low']),
  }),
  execute: async ({ context }) => forecastMonthEndSpend(loadTransactions(), context),
});
