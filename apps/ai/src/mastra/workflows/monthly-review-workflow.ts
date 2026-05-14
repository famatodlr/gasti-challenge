import { Agent } from '@mastra/core/agent';
import { RuntimeContext } from '@mastra/core/di';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';

import {
  comparePeriods,
  detectRecurringExpenses,
  forecastMonthEndSpend,
  summarizeSpending,
  type PeriodComparison,
} from '../domain/analytics.ts';
import { getCurrentDateString } from '../domain/current-date.ts';
import { loadTransactions as loadDefaultTransactions } from '../domain/transaction-repository.ts';
import {
  compareISODate,
  dateRangeSchema,
  dateStringSchema,
  formatARS,
  getDaysInMonth,
  getMonthDateRange,
  isWithinDateRange,
  transactionSchema,
  type Category,
  type DateRange,
  type Transaction,
} from '../domain/transaction.ts';
import { generateWithGastiModelFallback } from '../agents/model-fallback.ts';
import { getGeminiApiKey } from '../agents/model.ts';

export const MONTHLY_REVIEW_ACTIVITY_LABELS = [
  'Detectando período',
  'Calculando KPIs',
  'Comparando contra el período anterior',
  'Buscando insights',
  'Armando respuesta',
] as const;

const WORKFLOW_MODEL_RUNTIME_CONTEXT_KEY = 'gasti.workflow.modelId';

const categoryLabels: Record<Category, string> = {
  comida_fuera: 'Comida fuera',
  compras: 'Compras',
  delivery: 'Delivery',
  educacion: 'Educación',
  ocio: 'Ocio',
  salud: 'Salud',
  servicios: 'Servicios',
  supermercado: 'Supermercado',
  suscripciones: 'Suscripciones',
  transporte: 'Transporte',
  vivienda: 'Vivienda',
};

const monthNames = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

const monthAliases: Array<{ month: number; aliases: string[] }> = [
  { month: 1, aliases: ['enero', 'january'] },
  { month: 2, aliases: ['febrero', 'february'] },
  { month: 3, aliases: ['marzo', 'march'] },
  { month: 4, aliases: ['abril', 'april'] },
  { month: 5, aliases: ['mayo', 'may'] },
  { month: 6, aliases: ['junio', 'june'] },
  { month: 7, aliases: ['julio', 'july'] },
  { month: 8, aliases: ['agosto', 'august'] },
  { month: 9, aliases: ['septiembre', 'setiembre', 'september'] },
  { month: 10, aliases: ['octubre', 'october'] },
  { month: 11, aliases: ['noviembre', 'november'] },
  { month: 12, aliases: ['diciembre', 'december'] },
];

const monthlyReviewPeriodSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  label: z.string(),
  range: dateRangeSchema,
  isPartial: z.boolean(),
  comparableDay: z.number().int().min(1).max(31).optional(),
});

const kpisSchema = z.object({
  totalSpending: z.number(),
  transactionCount: z.number(),
  averageTransactionAmount: z.number(),
});

const comparisonSchema = z.object({
  previousPeriodLabel: z.string(),
  baselineRange: dateRangeSchema,
  absoluteDifference: z.number(),
  percentageDifference: z.number().nullable(),
  comparisonMode: z.enum(['full-month', 'same-day-of-month']),
});

const topCategorySchema = z.object({
  category: z.string(),
  amount: z.number(),
  share: z.number(),
});

const topMerchantSchema = z.object({
  merchant: z.string(),
  amount: z.number(),
});

const largestExpenseSchema = z.object({
  merchant: z.string(),
  amount: z.number(),
  date: dateStringSchema,
  category: z.string(),
});

const insightSchema = z.object({
  type: z.enum(['category_change', 'large_expense', 'recurring_payment', 'spending_pace']),
  title: z.string(),
  detail: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
});

export const monthlyReviewResultSchema = z.object({
  period: monthlyReviewPeriodSchema,
  kpis: kpisSchema,
  comparison: comparisonSchema.optional(),
  topCategories: z.array(topCategorySchema),
  topMerchants: z.array(topMerchantSchema),
  largestExpenses: z.array(largestExpenseSchema),
  insights: z.array(insightSchema),
});

const monthlyReviewWorkflowStateSchema = z.object({
  message: z.string().min(1),
  currentDate: dateStringSchema.optional(),
  modelId: z.string().optional(),
  allTransactions: z.array(transactionSchema).optional(),
  period: monthlyReviewPeriodSchema.optional(),
  previousRange: dateRangeSchema.optional(),
  previousPeriodLabel: z.string().optional(),
  targetTransactions: z.array(transactionSchema).optional(),
  kpis: kpisSchema.optional(),
  comparison: comparisonSchema.optional(),
  categoryComparisonGroups: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      currentTotal: z.number(),
      baselineTotal: z.number(),
      deltaAmount: z.number(),
      deltaPercent: z.number().nullable(),
      driverTransactionIds: z.array(z.string()),
    }),
  ).optional(),
  topCategories: z.array(topCategorySchema).optional(),
  topMerchants: z.array(topMerchantSchema).optional(),
  largestExpenses: z.array(largestExpenseSchema).optional(),
  insights: z.array(insightSchema).optional(),
  review: monthlyReviewResultSchema.optional(),
  clarification: z.string().optional(),
});

const monthlyReviewWorkflowOutputSchema = z.object({
  answer: z.string(),
  review: monthlyReviewResultSchema.optional(),
  clarification: z.string().optional(),
  activityLabels: z.array(z.string()),
});

export type MonthlyReviewResult = z.infer<typeof monthlyReviewResultSchema>;
export type MonthlyReviewWorkflowInput = z.infer<typeof monthlyReviewWorkflowStateSchema>;
export type MonthlyReviewWorkflowOutput = z.infer<typeof monthlyReviewWorkflowOutputSchema>;

export type MonthlyReviewAnswerGeneratorInput = {
  message: string;
  review?: MonthlyReviewResult;
  clarification?: string;
  modelId?: string;
  onActivityLabel?: (label: string) => void;
};

export type MonthlyReviewAnswerGenerator = (input: MonthlyReviewAnswerGeneratorInput) => Promise<string>;

type MonthlyReviewWorkflowDependencies = {
  answerGenerator?: MonthlyReviewAnswerGenerator;
  loadTransactions?: () => Transaction[];
};

type ResolvedMonthlyPeriod =
  | {
      period: z.infer<typeof monthlyReviewPeriodSchema>;
      previousRange: DateRange;
      previousPeriodLabel: string;
    }
  | {
      clarification: string;
    };

type MonthlyCalculationState = Required<
  Pick<
    MonthlyReviewWorkflowInput,
    'kpis' | 'topCategories' | 'topMerchants' | 'largestExpenses'
  >
>;

const google = createGoogleGenerativeAI({
  apiKey: getGeminiApiKey(),
});

export const MONTHLY_REVIEW_NARRATOR_INSTRUCTIONS = `You write final answers for Gasti financial workflows.

You receive structured, already-calculated financial data. Do not invent transactions, merchants, categories, dates, totals, percentages, trends, or recommendations. Do not call tools.

Reply in friendly Argentine Spanish with clean, concise Markdown.
Start with a short friendly intro.
State the period and total clearly near the top.
Use scannable Markdown sections modeled on "Resumen 📊", "Categorías principales", "Gastos destacados", and "Puntos para mirar 👀".
Use real Markdown bullets with "- " for every multi-row financial breakdown, including categories, merchants, expenses, and insight rows.
Never output bare bold-label rows like "**Vivienda:** ARS 250.000" outside a bullet list.
Do not write giant paragraphs.
Use restrained emojis only when they add clarity, usually in section titles or important bullets.
Prefer sober visual cues like 📈, 📉, ⚠️, 💳, 👍, 👎, or plain + / - when useful.
Avoid pointing-finger emojis in comparison bullets or category rows.
Use at most two genuinely relevant follow-up questions.`;

const workflowNarratorAgent = new Agent({
  name: 'GastiWorkflowNarrator',
  instructions: MONTHLY_REVIEW_NARRATOR_INSTRUCTIONS,
  model: ({ runtimeContext }) => {
    const runtimeModel = runtimeContext.get(WORKFLOW_MODEL_RUNTIME_CONTEXT_KEY);
    const runtimeModelId = typeof runtimeModel === 'string' ? runtimeModel.trim() : '';
    return google(runtimeModelId);
  },
});

export function buildDeterministicMonthlyReviewAnswer({
  review,
  clarification,
}: Pick<MonthlyReviewAnswerGeneratorInput, 'review' | 'clarification'>): string {
  if (!review) {
    return clarification ?? '¿De qué mes querés que haga el resumen financiero? Puedo revisar abril 2026 o mayo 2026.';
  }

  const comparisonSentence = buildComparisonSentence(review);
  const insightBullets = review.insights.slice(0, 3).map((insight) => {
    const emoji = getInsightEmoji(insight.type, insight.detail);
    return `- ${emoji ? `${emoji} ` : ''}**${insight.title}:** ${insight.detail}`;
  });
  const expenseBullets = review.largestExpenses
    .slice(0, 3)
    .map(
      (expense) =>
        `- **${expense.merchant}:** ${formatARS(expense.amount)} (${withCategoryEmoji(getCategoryLabel(expense.category), expense.category)}, ${expense.date})`,
    );
  const categoryBullets = review.topCategories
    .slice(0, 5)
    .map((category) => `- ${getCategoryEmoji(category.category)} **${getCategoryLabel(category.category)}:** ${formatARS(category.amount)}`);
  const introLine = `Te dejo un resumen claro de **${review.period.label}**.`;
  const totalLine = buildMonthlyReviewTotalLine(review);

  return [
    introLine,
    `## Resumen de ${review.period.label} 📊`,
    totalLine,
    comparisonSentence,
    '### Categorías principales',
    categoryBullets.join('\n'),
    '### Gastos destacados',
    expenseBullets.join('\n'),
    '### Puntos para mirar 👀',
    insightBullets.length > 0 ? insightBullets.join('\n') : '- **Movimiento:** No aparece un cambio fuerte con los datos disponibles.',
  ].join('\n\n');
}

export async function generateMonthlyReviewAnswerWithAgent({
  message,
  review,
  clarification,
  onActivityLabel,
}: MonthlyReviewAnswerGeneratorInput): Promise<string> {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return buildDeterministicMonthlyReviewAnswer({ review, clarification });
  }

  const generatedAnswer = await generateWithGastiModelFallback({
    source: 'workflow.monthly_review.narrator',
    generate: async (attemptedModelId) => {
      const runtimeContext = new RuntimeContext();
      runtimeContext.set(WORKFLOW_MODEL_RUNTIME_CONTEXT_KEY, attemptedModelId);

      const result = await workflowNarratorAgent.generate(
        [
          {
            role: 'user',
            content: `Mensaje original: ${message}

Datos estructurados:
${JSON.stringify({ review, clarification }, null, 2)}

Escribí la respuesta final para el usuario. Si hay clarification, pedí esa aclaración y no inventes un período.`,
          },
        ],
        { maxSteps: 1, runtimeContext },
      );

      return result.text.trim();
    },
    onFallbackRetrying: () => {
      onActivityLabel?.('Reintentando con otro modelo');
    },
  });

  if (!generatedAnswer || hasBareBoldFinancialRows(generatedAnswer)) {
    return buildDeterministicMonthlyReviewAnswer({ review, clarification });
  }

  return normalizeWorkflowNarratorAnswer(generatedAnswer);
}

export function resolveMonthlyReviewPeriod(
  message: string,
  {
    currentDate = getCurrentDateString(),
    transactions = loadDefaultTransactions(),
  }: {
    currentDate?: string;
    transactions?: readonly Transaction[];
  } = {},
): ResolvedMonthlyPeriod {
  const resolvedCurrentDate = dateStringSchema.parse(currentDate);
  const targetMonth = resolveTargetMonth(message, resolvedCurrentDate, transactions);

  if (!targetMonth) {
    return {
      clarification: '¿De qué mes querés que haga el resumen financiero? Puedo revisar abril 2026 o mayo 2026.',
    };
  }

  const period = buildTargetPeriod(targetMonth.year, targetMonth.month, resolvedCurrentDate, transactions);
  const previous = buildPreviousPeriod(period);

  return {
    period,
    previousRange: previous.range,
    previousPeriodLabel: previous.label,
  };
}

export function calculateMonthlyReviewKpis(
  transactions: readonly Transaction[],
  period: z.infer<typeof monthlyReviewPeriodSchema>,
): MonthlyCalculationState {
  const categorySummary = summarizeSpending(transactions, {
    dateRange: period.range,
    groupBy: 'category',
    topTransactionLimit: 5,
  });
  const merchantSummary = summarizeSpending(transactions, {
    dateRange: period.range,
    groupBy: 'merchant',
    topTransactionLimit: 5,
  });
  const averageTransactionAmount =
    categorySummary.transactionCount === 0 ? 0 : Math.round(categorySummary.total / categorySummary.transactionCount);

  return {
    kpis: {
      totalSpending: categorySummary.total,
      transactionCount: categorySummary.transactionCount,
      averageTransactionAmount,
    },
    topCategories: categorySummary.groups.slice(0, 5).map((group) => ({
      category: group.key,
      amount: group.total,
      share: roundToTwo(group.sharePct / 100),
    })),
    topMerchants: merchantSummary.groups.slice(0, 5).map((group) => ({
      merchant: group.label,
      amount: group.total,
    })),
    largestExpenses: categorySummary.topTransactions.slice(0, 5).map((transaction) => ({
      merchant: transaction.merchant,
      amount: transaction.amount,
      date: transaction.date,
      category: transaction.category,
    })),
  };
}

export function compareMonthlyReviewPeriod(
  transactions: readonly Transaction[],
  period: z.infer<typeof monthlyReviewPeriodSchema>,
  previousRange: DateRange,
  previousPeriodLabel: string,
): {
  comparison: z.infer<typeof comparisonSchema>;
  source: PeriodComparison;
} {
  const source = comparePeriods(transactions, {
    currentRange: period.range,
    baselineRange: previousRange,
    groupBy: 'category',
  });

  return {
    comparison: {
      previousPeriodLabel,
      baselineRange: previousRange,
      absoluteDifference: source.delta.amount,
      percentageDifference: source.delta.percent,
      comparisonMode: period.isPartial ? 'same-day-of-month' : 'full-month',
    },
    source,
  };
}

export function detectMonthlyReviewInsights({
  allTransactions,
  period,
  comparisonSource,
  largestExpenses,
}: {
  allTransactions: readonly Transaction[];
  period: z.infer<typeof monthlyReviewPeriodSchema>;
  comparisonSource?: PeriodComparison;
  largestExpenses: z.infer<typeof largestExpenseSchema>[];
}): z.infer<typeof insightSchema>[] {
  const insights: z.infer<typeof insightSchema>[] = [];

  for (const group of comparisonSource?.groups ?? []) {
    if (Math.abs(group.deltaAmount) < 10_000) {
      continue;
    }

    const direction = group.deltaAmount > 0 ? 'subió' : 'bajó';
    const percent = group.deltaPercent === null ? '' : ` (${formatPercent(Math.abs(group.deltaPercent))})`;
    insights.push({
      type: 'category_change',
      title: getCategoryLabel(group.key),
      detail: `${direction} ${formatARS(Math.abs(group.deltaAmount))}${percent} contra el período comparable.`,
      severity: severityFromAmount(Math.abs(group.deltaAmount)),
    });

    if (insights.filter((insight) => insight.type === 'category_change').length >= 2) {
      break;
    }
  }

  const largestExpense = largestExpenses[0];
  if (largestExpense && largestExpense.amount >= 75_000) {
    insights.push({
      type: 'large_expense',
      title: largestExpense.merchant,
      detail: `es el gasto individual más grande del período con ${formatARS(largestExpense.amount)}.`,
      severity: severityFromAmount(largestExpense.amount),
    });
  }

  const recurring = detectRecurringExpenses(allTransactions, {
    dateRange: buildRecurringDetectionRange(allTransactions, period),
    includeVariableRecurring: false,
    minOccurrences: 2,
  });
  const recurringItem = recurring.items.find((item) => item.confidence !== 'low');

  if (recurringItem) {
    insights.push({
      type: 'recurring_payment',
      title: recurringItem.merchant,
      detail: `parece un pago recurrente ${recurringItem.cadence === 'monthly' ? 'mensual' : 'repetido'} de alrededor de ${formatARS(
        recurringItem.estimatedMonthlyAmount,
      )}.`,
      severity: severityFromAmount(recurringItem.estimatedMonthlyAmount),
    });
  }

  if (period.isPartial && period.comparableDay && period.comparableDay >= 5) {
    const monthKey = buildMonthKey(period.year, period.month);
    const forecast = forecastMonthEndSpend(allTransactions, {
      month: monthKey,
      asOfDate: period.range.to,
    });

    insights.push({
      type: 'spending_pace',
      title: 'Ritmo del mes',
      detail: `proyección: si el ritmo variable se mantiene, el cierre del mes rondaría ${formatARS(
        forecast.projectedMonthEndSpend,
      )}. (no es gasto observado todavía)`,
      severity: forecast.projectedMonthEndSpend >= 1_000_000 ? 'high' : 'medium',
    });
  }

  return insights.slice(0, 5);
}

export function buildMonthlyReviewResultFromState(
  state: MonthlyReviewWorkflowInput,
): MonthlyReviewResult | undefined {
  if (
    !state.period ||
    !state.kpis ||
    !state.topCategories ||
    !state.topMerchants ||
    !state.largestExpenses ||
    !state.insights
  ) {
    return undefined;
  }

  return {
    period: state.period,
    kpis: state.kpis,
    comparison: state.comparison,
    topCategories: state.topCategories,
    topMerchants: state.topMerchants,
    largestExpenses: state.largestExpenses,
    insights: state.insights,
  };
}

export function createMonthlyFinancialReviewWorkflow({
  answerGenerator = generateMonthlyReviewAnswerWithAgent,
  loadTransactions = loadDefaultTransactions,
}: MonthlyReviewWorkflowDependencies = {}) {
  const resolvePeriodStep = createStep({
    id: 'resolve-target-period',
    description: 'Resolve the target month and comparable previous period from the user message.',
    inputSchema: monthlyReviewWorkflowStateSchema,
    outputSchema: monthlyReviewWorkflowStateSchema,
    execute: async ({ inputData }) => {
      const transactions = loadTransactions();
      const resolvedPeriod = resolveMonthlyReviewPeriod(inputData.message, {
        currentDate: inputData.currentDate,
        transactions,
      });

      if ('clarification' in resolvedPeriod) {
        return {
          ...inputData,
          allTransactions: transactions,
          clarification: resolvedPeriod.clarification,
        };
      }

      return {
        ...inputData,
        allTransactions: transactions,
        period: resolvedPeriod.period,
        previousRange: resolvedPeriod.previousRange,
        previousPeriodLabel: resolvedPeriod.previousPeriodLabel,
      };
    },
  });

  const loadTargetTransactionsStep = createStep({
    id: 'load-target-transactions',
    description: 'Load transactions for the resolved target period.',
    inputSchema: monthlyReviewWorkflowStateSchema,
    outputSchema: monthlyReviewWorkflowStateSchema,
    execute: async ({ inputData }) => {
      if (!inputData.period || inputData.clarification) {
        return inputData;
      }

      const allTransactions = inputData.allTransactions ?? loadTransactions();

      return {
        ...inputData,
        allTransactions,
        targetTransactions: allTransactions.filter((transaction) => isWithinDateRange(transaction, inputData.period!.range)),
      };
    },
  });

  const calculateKpisStep = createStep({
    id: 'calculate-kpis',
    description: 'Calculate deterministic spending KPIs and top drivers.',
    inputSchema: monthlyReviewWorkflowStateSchema,
    outputSchema: monthlyReviewWorkflowStateSchema,
    execute: async ({ inputData }) => {
      if (!inputData.period || inputData.clarification) {
        return inputData;
      }

      return {
        ...inputData,
        ...calculateMonthlyReviewKpis(inputData.allTransactions ?? [], inputData.period),
      };
    },
  });

  const comparePreviousPeriodStep = createStep({
    id: 'compare-previous-period',
    description: 'Compare the target period against the previous comparable period.',
    inputSchema: monthlyReviewWorkflowStateSchema,
    outputSchema: monthlyReviewWorkflowStateSchema,
    execute: async ({ inputData }) => {
      if (!inputData.period || !inputData.previousRange || !inputData.previousPeriodLabel || inputData.clarification) {
        return inputData;
      }

      const { comparison, source } = compareMonthlyReviewPeriod(
        inputData.allTransactions ?? [],
        inputData.period,
        inputData.previousRange,
        inputData.previousPeriodLabel,
      );

      return {
        ...inputData,
        comparison,
        categoryComparisonGroups: source.groups,
      };
    },
  });

  const detectInsightsStep = createStep({
    id: 'detect-insights',
    description: 'Detect category changes, large expenses, recurring payments, and spending pace.',
    inputSchema: monthlyReviewWorkflowStateSchema,
    outputSchema: monthlyReviewWorkflowStateSchema,
    execute: async ({ inputData }) => {
      if (!inputData.period || !inputData.largestExpenses || inputData.clarification) {
        return inputData;
      }

      const comparisonSource = inputData.comparison
        ? comparePeriods(inputData.allTransactions ?? [], {
            currentRange: inputData.period.range,
            baselineRange: inputData.comparison.baselineRange,
            groupBy: 'category',
          })
        : undefined;

      return {
        ...inputData,
        insights: detectMonthlyReviewInsights({
          allTransactions: inputData.allTransactions ?? [],
          period: inputData.period,
          comparisonSource,
          largestExpenses: inputData.largestExpenses,
        }),
      };
    },
  });

  const buildStructuredReviewStep = createStep({
    id: 'build-structured-review',
    description: 'Build the structured monthly financial review object.',
    inputSchema: monthlyReviewWorkflowStateSchema,
    outputSchema: monthlyReviewWorkflowStateSchema,
    execute: async ({ inputData }) => ({
      ...inputData,
      review: buildMonthlyReviewResultFromState(inputData),
    }),
  });

  const generateFinalAnswerStep = createStep({
    id: 'generate-final-answer',
    description: 'Generate the final natural-language answer from the structured review.',
    inputSchema: monthlyReviewWorkflowStateSchema,
    outputSchema: monthlyReviewWorkflowOutputSchema,
    execute: async ({ inputData }) => {
      const activityLabels: string[] = [...MONTHLY_REVIEW_ACTIVITY_LABELS];

      return {
        answer: await answerGenerator({
          message: inputData.message,
          review: inputData.review,
          clarification: inputData.clarification,
          modelId: inputData.modelId,
          onActivityLabel: (label) => {
            activityLabels.push(label);
          },
        }),
        review: inputData.review,
        clarification: inputData.clarification,
        activityLabels,
      };
    },
  });

  return createWorkflow({
    id: 'monthlyFinancialReviewWorkflow',
    description: 'Resolve a month, calculate deterministic financial review data, and generate a concise Spanish review.',
    inputSchema: monthlyReviewWorkflowStateSchema,
    outputSchema: monthlyReviewWorkflowOutputSchema,
  })
    .then(resolvePeriodStep)
    .then(loadTargetTransactionsStep)
    .then(calculateKpisStep)
    .then(comparePreviousPeriodStep)
    .then(detectInsightsStep)
    .then(buildStructuredReviewStep)
    .then(generateFinalAnswerStep)
    .commit();
}

export const monthlyFinancialReviewWorkflow = createMonthlyFinancialReviewWorkflow();

export async function runMonthlyFinancialReviewWorkflow(
  input: Pick<MonthlyReviewWorkflowInput, 'message' | 'currentDate' | 'modelId'>,
  dependencies?: MonthlyReviewWorkflowDependencies,
): Promise<MonthlyReviewWorkflowOutput> {
  const workflow = dependencies ? createMonthlyFinancialReviewWorkflow(dependencies) : monthlyFinancialReviewWorkflow;
  const run = await workflow.createRunAsync();
  const result = await run.start({ inputData: monthlyReviewWorkflowStateSchema.parse(input) });

  if (result.status === 'failed') {
    throw result.error;
  }

  if (result.status === 'suspended') {
    throw new Error('monthlyFinancialReviewWorkflow suspended unexpectedly.');
  }

  return result.result;
}

function buildComparisonSentence(review: MonthlyReviewResult): string {
  const comparison = review.comparison;

  if (!comparison) {
    return 'No tengo un período anterior comparable suficiente para contrastarlo.';
  }

  if (comparison.comparisonMode === 'same-day-of-month' && review.period.isPartial) {
    const toDay = review.period.comparableDay ?? Number(review.period.range.to.slice(-2));
    const partialLead = `Comparé ${monthNames[review.period.month - 1]} hasta el ${toDay} contra ${comparison.previousPeriodLabel}.`;

    if (comparison.percentageDifference === null) {
      return `${partialLead} La diferencia es de **${formatARS(Math.abs(comparison.absoluteDifference))}**.`;
    }

    const direction = comparison.absoluteDifference >= 0 ? 'arriba' : 'abajo';
    return `${partialLead} Eso está **${formatPercent(Math.abs(comparison.percentageDifference))} ${direction}** en el tramo comparable.`;
  }

  if (comparison.percentageDifference === null) {
    return `La diferencia contra ${comparison.previousPeriodLabel} es de **${formatARS(
      Math.abs(comparison.absoluteDifference),
    )}**.`;
  }

  const direction = comparison.absoluteDifference >= 0 ? 'arriba' : 'abajo';

  return `Eso está **${formatPercent(Math.abs(comparison.percentageDifference))} ${direction}** de ${comparison.previousPeriodLabel}.`;
}

function buildMonthlyReviewTotalLine(review: MonthlyReviewResult): string {
  const monthName = monthNames[review.period.month - 1];

  if (review.period.isPartial) {
    const toDay = review.period.comparableDay ?? Number(review.period.range.to.slice(-2));
    return `Del **1 al ${toDay} de ${monthName}**, gastaste **${formatARS(review.kpis.totalSpending)}**.`;
  }

  return `En **${review.period.label}**, gastaste **${formatARS(review.kpis.totalSpending)}**.`;
}

function resolveTargetMonth(
  message: string,
  currentDate: string,
  transactions: readonly Transaction[],
): { month: number; year: number } | undefined {
  const normalizedMessage = normalizeText(message);

  if (/\beste mes\b/.test(normalizedMessage) || /\bmes actual\b/.test(normalizedMessage) || /\bthis month\b/.test(normalizedMessage)) {
    const [year, month] = currentDate.split('-').map(Number);
    return { month, year };
  }

  const mentionedMonths = monthAliases.flatMap(({ month, aliases }) =>
    aliases.flatMap((alias) => {
      const matches = [...normalizedMessage.matchAll(new RegExp(`\\b${alias}\\b`, 'g'))];
      return matches.map((match) => ({ month, index: match.index ?? 0 }));
    }),
  );

  if (mentionedMonths.length === 0) {
    return undefined;
  }

  mentionedMonths.sort((a, b) => a.index - b.index);
  const targetMonth = isMonthComparisonPrompt(normalizedMessage) && mentionedMonths.length >= 2
    ? mentionedMonths[0].month
    : mentionedMonths[mentionedMonths.length - 1].month;
  const explicitYear = normalizedMessage.match(/\b(20\d{2})\b/)?.[1];

  return {
    month: targetMonth,
    year: explicitYear ? Number(explicitYear) : inferYearForMonth(targetMonth, currentDate, transactions),
  };
}

function buildTargetPeriod(
  year: number,
  month: number,
  currentDate: string,
  transactions: readonly Transaction[],
): z.infer<typeof monthlyReviewPeriodSchema> {
  const monthKey = buildMonthKey(year, month);
  const fullRange = getMonthDateRange(monthKey);
  const latestTargetDate = findLatestTransactionDateInMonth(transactions, monthKey);
  const currentMonthKey = currentDate.slice(0, 7);
  const latestDatasetMonth = findLatestDatasetMonth(transactions);
  let rangeTo = fullRange.to;

  if (currentMonthKey === monthKey) {
    const currentLimitedToMonth = minISODate(currentDate, fullRange.to);
    rangeTo =
      latestTargetDate && compareISODate(latestTargetDate, currentLimitedToMonth) < 0
        ? latestTargetDate
        : currentLimitedToMonth;
  } else if (latestDatasetMonth === monthKey && latestTargetDate && compareISODate(latestTargetDate, fullRange.to) < 0) {
    rangeTo = latestTargetDate;
  }

  const isPartial = compareISODate(rangeTo, fullRange.to) < 0;
  const comparableDay = isPartial ? Number(rangeTo.slice(-2)) : undefined;

  return {
    month,
    year,
    label: formatMonthLabel(year, month),
    range: { from: fullRange.from, to: rangeTo },
    isPartial,
    ...(comparableDay ? { comparableDay } : {}),
  };
}

function buildPreviousPeriod(period: z.infer<typeof monthlyReviewPeriodSchema>): { range: DateRange; label: string } {
  const previousMonth = period.month === 1 ? 12 : period.month - 1;
  const previousYear = period.month === 1 ? period.year - 1 : period.year;
  const previousMonthKey = buildMonthKey(previousYear, previousMonth);
  const fullPreviousRange = getMonthDateRange(previousMonthKey);

  if (!period.isPartial || !period.comparableDay) {
    return {
      range: fullPreviousRange,
      label: formatMonthLabel(previousYear, previousMonth),
    };
  }

  const previousComparableDay = Math.min(period.comparableDay, getDaysInMonth(previousYear, previousMonth));
  const range = {
    from: fullPreviousRange.from,
    to: `${previousMonthKey}-${String(previousComparableDay).padStart(2, '0')}`,
  };

  return {
    range,
    label: `${formatMonthLabel(previousYear, previousMonth)} hasta el día ${previousComparableDay}`,
  };
}

function buildRecurringDetectionRange(
  transactions: readonly Transaction[],
  period: z.infer<typeof monthlyReviewPeriodSchema>,
): DateRange {
  const earliestDate = transactions.map((transaction) => transaction.date).sort(compareISODate)[0] ?? period.range.from;

  return {
    from: minISODate(earliestDate, period.range.to),
    to: period.range.to,
  };
}

function inferYearForMonth(month: number, currentDate: string, transactions: readonly Transaction[]): number {
  const transactionYears = transactions
    .filter((transaction) => Number(transaction.date.slice(5, 7)) === month)
    .map((transaction) => Number(transaction.date.slice(0, 4)))
    .sort((a, b) => b - a);

  return transactionYears[0] ?? Number(currentDate.slice(0, 4));
}

function findLatestTransactionDateInMonth(transactions: readonly Transaction[], monthKey: string): string | undefined {
  return transactions
    .filter((transaction) => transaction.date.startsWith(monthKey))
    .map((transaction) => transaction.date)
    .sort(compareISODate)
    .at(-1);
}

function findLatestDatasetMonth(transactions: readonly Transaction[]): string | undefined {
  return transactions.map((transaction) => transaction.date.slice(0, 7)).sort(compareISODate).at(-1);
}

function buildMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function formatMonthLabel(year: number, month: number): string {
  return `${monthNames[month - 1]} ${year}`;
}

function getCategoryLabel(category: string): string {
  return categoryLabels[category as Category] ?? titleCase(category.replace(/_/g, ' '));
}

function getCategoryEmoji(category: string): string {
  const categoryEmojiMap: Partial<Record<Category, string>> = {
    vivienda: '🏠',
    salud: '🏥',
    supermercado: '🛒',
    compras: '🛍️',
    transporte: '🚕',
    comida_fuera: '🍽️',
    delivery: '🍽️',
    suscripciones: '💳',
    servicios: '💡',
  };

  return categoryEmojiMap[category as Category] ?? '•';
}

function withCategoryEmoji(label: string, category: string): string {
  const emoji = getCategoryEmoji(category);

  return emoji === '•' ? label : `${emoji} ${label}`;
}

function titleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toLocaleUpperCase('es-AR')}${word.slice(1)}`)
    .join(' ');
}

function severityFromAmount(amount: number): 'low' | 'medium' | 'high' {
  if (amount >= 100_000) {
    return 'high';
  }

  if (amount >= 25_000) {
    return 'medium';
  }

  return 'low';
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(value)}%`;
}

function getInsightEmoji(type: MonthlyReviewResult['insights'][number]['type'], detail: string): string {
  if (type === 'spending_pace' || /\bsubi[oó]\b/i.test(detail)) {
    return '📈';
  }

  if (/\bbaj[oó]\b/i.test(detail)) {
    return '📉';
  }

  if (type === 'large_expense') {
    return '⚠️';
  }

  if (type === 'recurring_payment') {
    return '💳';
  }

  return '💡';
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-AR');
}

function isMonthComparisonPrompt(normalizedMessage: string): boolean {
  return (
    /\bcompar/.test(normalizedMessage) ||
    /\bcontra\b/.test(normalizedMessage) ||
    /\bvs\b/.test(normalizedMessage) ||
    /\bversus\b/.test(normalizedMessage)
  );
}

function normalizeWorkflowNarratorAnswer(value: string): string {
  return value
    .replace(/\s*[👇👆👉👈]\s*:/gu, ':')
    .replace(/[👇👆👉👈]/gu, '')
    .replace(/[ \t]+:\s*/g, ': ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function minISODate(a: string, b: string): string {
  return compareISODate(a, b) <= 0 ? a : b;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function hasBareBoldFinancialRows(value: string): boolean {
  return /(?:^|\n)\*\*[^*\n]+:\*\*\s*ARS/m.test(value);
}
