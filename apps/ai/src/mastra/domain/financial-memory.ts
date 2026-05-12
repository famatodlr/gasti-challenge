import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z, ZodError } from 'zod';

import { categorySchema } from './transaction.ts';

export const DEMO_FINANCIAL_MEMORY_RESOURCE_ID = 'demo-user';

const memorySourceSchema = z.enum(['user_stated', 'user_confirmed']);
const currencySchema = z.literal('ARS');

export const knownIncomeSchema = z
  .object({
    label: z.string().min(1),
    amount: z.number().int().positive(),
    currency: currencySchema,
    cadence: z.enum(['monthly', 'weekly', 'biweekly', 'one_time', 'unknown']),
    source: memorySourceSchema,
    notes: z.string().min(1).optional(),
  })
  .strict();

export const fixedExpenseSchema = z
  .object({
    merchant: z.string().min(1),
    category: categorySchema,
    amount: z.number().int().positive(),
    currency: currencySchema,
    cadence: z.enum(['monthly', 'weekly', 'annual', 'unknown']),
    source: memorySourceSchema,
    notes: z.string().min(1).optional(),
  })
  .strict();

export const savingGoalSchema = z
  .object({
    name: z.string().min(1),
    targetAmount: z.number().int().positive(),
    currency: currencySchema,
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    monthlyContributionTarget: z.number().int().positive().optional(),
    source: memorySourceSchema,
    notes: z.string().min(1).optional(),
  })
  .strict();

export const recurringObservationSchema = z
  .object({
    merchant: z.string().min(1),
    category: categorySchema,
    observation: z.string().min(1),
    preference: z.enum(['watch', 'reduce', 'keep']),
    source: memorySourceSchema,
  })
  .strict();

export const financialPreferencesSchema = z
  .object({
    preferredLanguage: z.enum(['es-AR', 'en']),
    answerStyle: z.enum(['concise', 'detailed']),
    includeEvidence: z.boolean(),
  })
  .strict();

export const financialMemorySchema = z
  .object({
    schemaVersion: z.literal(1),
    resourceId: z.literal(DEMO_FINANCIAL_MEMORY_RESOURCE_ID),
    currency: currencySchema,
    knownIncome: z.array(knownIncomeSchema),
    fixedExpenses: z.array(fixedExpenseSchema),
    savingGoals: z.array(savingGoalSchema),
    watchCategories: z.array(categorySchema),
    recurringObservations: z.array(recurringObservationSchema),
    preferences: financialPreferencesSchema,
  })
  .strict();

export type KnownIncome = z.infer<typeof knownIncomeSchema>;
export type FixedExpense = z.infer<typeof fixedExpenseSchema>;
export type SavingGoal = z.infer<typeof savingGoalSchema>;
export type RecurringObservation = z.infer<typeof recurringObservationSchema>;
export type FinancialPreferences = z.infer<typeof financialPreferencesSchema>;
export type FinancialMemory = z.infer<typeof financialMemorySchema>;

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const defaultFinancialMemoryPath = resolve(currentDirectory, '../../../../../data/financial-memory.json');

export function createEmptyFinancialMemory(): FinancialMemory {
  return financialMemorySchema.parse({
    schemaVersion: 1,
    resourceId: DEMO_FINANCIAL_MEMORY_RESOURCE_ID,
    currency: 'ARS',
    knownIncome: [],
    fixedExpenses: [],
    savingGoals: [],
    watchCategories: [],
    recurringObservations: [],
    preferences: {
      preferredLanguage: 'es-AR',
      answerStyle: 'concise',
      includeEvidence: true,
    },
  });
}

export function loadFinancialMemory(path = defaultFinancialMemoryPath): FinancialMemory {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read financial memory from ${path}: ${getErrorMessage(error)}`);
  }

  try {
    return financialMemorySchema.parse(parsedJson);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ');
      throw new Error(`Invalid financial memory data in ${path}: ${issues}`);
    }

    throw error;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
