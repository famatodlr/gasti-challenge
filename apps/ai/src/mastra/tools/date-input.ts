import { z } from 'zod';

import { dateRangeSchema, dateStringSchema, type DateRange } from '../domain/transaction.ts';

export const flatDateRangeFields = {
  from: dateStringSchema,
  to: dateStringSchema,
} as const;

export const compareDateRangeFields = {
  currentFrom: dateStringSchema,
  currentTo: dateStringSchema,
  baselineFrom: dateStringSchema,
  baselineTo: dateStringSchema,
} as const;

type FlatDateRangeInput = {
  from: string;
  to: string;
};

type CompareDateRangeInput = {
  currentFrom: string;
  currentTo: string;
  baselineFrom: string;
  baselineTo: string;
};

export function toDateRange(input: FlatDateRangeInput): DateRange {
  return dateRangeSchema.parse({ from: input.from, to: input.to });
}

export function toCompareDateRanges(input: CompareDateRangeInput): {
  currentRange: DateRange;
  baselineRange: DateRange;
} {
  const currentRange = dateRangeSchema.parse({ from: input.currentFrom, to: input.currentTo });
  const baselineRange = dateRangeSchema.parse({ from: input.baselineFrom, to: input.baselineTo });

  return {
    currentRange,
    baselineRange,
  };
}

export function addDateRangeOrderValidation<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  ranges: Array<{ fromKey: string; toKey: string }>,
): z.ZodEffects<TSchema> {
  return schema.superRefine((input, context) => {
    if (typeof input !== 'object' || input === null) {
      return;
    }

    const record = input as Record<string, unknown>;

    for (const range of ranges) {
      const from = record[range.fromKey];
      const to = record[range.toKey];

      if (typeof from !== 'string' || typeof to !== 'string') {
        continue;
      }

      const parsedRange = dateRangeSchema.safeParse({ from, to });

      if (!parsedRange.success) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Date range "from" must be before or equal to "to"',
          path: [range.fromKey],
        });
      }
    }
  });
}
