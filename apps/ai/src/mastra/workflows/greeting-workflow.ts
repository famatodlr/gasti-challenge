import { Agent } from '@mastra/core/agent';
import { RuntimeContext } from '@mastra/core/di';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';

import { getCurrentDateString } from '../domain/current-date.ts';
import { loadTransactions as loadDefaultTransactions } from '../domain/transaction-repository.ts';
import { dateRangeSchema, dateStringSchema, formatARS, type Transaction, transactionSchema } from '../domain/transaction.ts';
import { generateWithGastiModelFallback } from '../agents/model-fallback.ts';
import { getGeminiApiKey } from '../agents/model.ts';
import {
  calculateMonthlyReviewKpis,
  compareMonthlyReviewPeriod,
  detectMonthlyReviewInsights,
  resolveMonthlyReviewPeriod,
  type MonthlyReviewResult,
} from './monthly-review-workflow.ts';

export const GREETING_WORKFLOW_ACTIVITY_LABELS = [
  'Detectando contexto',
  'Calculando snapshot',
  'Priorizando insights',
  'Armando respuesta',
] as const;

const WORKFLOW_MODEL_RUNTIME_CONTEXT_KEY = 'gasti.greetingWorkflow.modelId';

const temporalContextSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  label: z.string(),
  day: z.number().int().min(1).max(31),
  range: dateRangeSchema,
});

const greetingInsightSchema = z.object({
  title: z.string(),
  detail: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
  type: z.enum(['category_change', 'large_expense', 'recurring_payment', 'spending_pace']),
});

const greetingSnapshotSchema = z.object({
  temporalContext: temporalContextSchema,
  enoughData: z.boolean(),
  currentMonthSpending: z.number(),
  transactionCount: z.number(),
  comparison: z
    .object({
      previousPeriodLabel: z.string(),
      absoluteDifference: z.number(),
      percentageDifference: z.number().nullable(),
      comparisonMode: z.enum(['full-month', 'same-day-of-month']),
    })
    .optional(),
  insights: z.array(greetingInsightSchema),
});

const greetingWorkflowStateSchema = z.object({
  message: z.string().min(1),
  currentDate: dateStringSchema.optional(),
  modelId: z.string().optional(),
  allTransactions: z.array(transactionSchema).optional(),
  snapshot: greetingSnapshotSchema.optional(),
});

const greetingWorkflowOutputSchema = z.object({
  answer: z.string(),
  snapshot: greetingSnapshotSchema,
  activityLabels: z.array(z.string()),
});

export type GreetingFinancialSnapshot = z.infer<typeof greetingSnapshotSchema>;
export type GreetingWorkflowInput = z.infer<typeof greetingWorkflowStateSchema>;
export type GreetingWorkflowOutput = z.infer<typeof greetingWorkflowOutputSchema>;

export type GreetingAnswerGeneratorInput = {
  message: string;
  snapshot: GreetingFinancialSnapshot;
  modelId?: string;
  onActivityLabel?: (label: string) => void;
};

export type GreetingAnswerGenerator = (input: GreetingAnswerGeneratorInput) => Promise<string>;

type GreetingWorkflowDependencies = {
  answerGenerator?: GreetingAnswerGenerator;
  loadTransactions?: () => Transaction[];
};

const google = createGoogleGenerativeAI({
  apiKey: getGeminiApiKey(),
});

export const GREETING_NARRATOR_INSTRUCTIONS = `You write very short friendly responses for Gasti.

Use only the structured snapshot provided. Do not invent financial data.
Reply in friendly Argentine Spanish with clean Markdown and short paragraphs.
Use one friendly emoji maximum.
Highlight the most important number in bold.
Mention at most two drivers or insights, and keep them grounded in the structured data.
End with a single useful follow-up question.
Avoid dense paragraphs and avoid long inline financial lists.`;

const greetingNarratorAgent = new Agent({
  name: 'GastiGreetingWorkflowNarrator',
  instructions: GREETING_NARRATOR_INSTRUCTIONS,
  model: ({ runtimeContext }) => {
    const runtimeModel = runtimeContext.get(WORKFLOW_MODEL_RUNTIME_CONTEXT_KEY);
    const runtimeModelId = typeof runtimeModel === 'string' ? runtimeModel.trim() : '';
    return google(runtimeModelId);
  },
});

export function buildDeterministicGreetingAnswer({ snapshot }: Pick<GreetingAnswerGeneratorInput, 'snapshot'>): string {
  if (!snapshot.enoughData) {
    return [
      'Hola 👋',
      'Todavía no veo suficiente movimiento este mes para sacar una conclusión fuerte.',
      '¿Querés que revise gastos puntuales, recurrentes o una comparación contra el mes pasado?',
    ].join('\n\n');
  }

  const comparison = snapshot.comparison;
  const driverText = buildGreetingDriverSentence(snapshot.insights);
  const comparisonText =
    comparison?.percentageDifference === null || comparison?.percentageDifference === undefined
      ? ''
      : `Vas **${formatPercent(Math.abs(comparison.percentageDifference))} ${
          comparison.absoluteDifference >= 0 ? 'arriba' : 'abajo'
        }** que ${comparison.previousPeriodLabel}${driverText ? `, sobre todo por ${driverText}` : ''}.`;

  return [
    'Hola 👋',
    `En **${snapshot.temporalContext.label}** llevás **${formatARS(snapshot.currentMonthSpending)}** gastados.`,
    comparisonText || (driverText ? `Los drivers más claros por ahora son ${driverText}.` : 'Todavía no aparece un driver dominante en los datos.'),
    '¿Querés que te muestre qué gastos explican la diferencia?',
  ].join('\n\n');
}

export async function generateGreetingAnswerWithAgent({
  message,
  snapshot,
  onActivityLabel,
}: GreetingAnswerGeneratorInput): Promise<string> {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return buildDeterministicGreetingAnswer({ snapshot });
  }

  const generatedAnswer = await generateWithGastiModelFallback({
    source: 'workflow.greeting_snapshot.narrator',
    generate: async (attemptedModelId) => {
      const runtimeContext = new RuntimeContext();
      runtimeContext.set(WORKFLOW_MODEL_RUNTIME_CONTEXT_KEY, attemptedModelId);

      const result = await greetingNarratorAgent.generate(
        [
          {
            role: 'user',
            content: `Mensaje original: ${message}

Snapshot estructurado:
${JSON.stringify(snapshot, null, 2)}

Escribí el saludo final. Mantenelo corto.`,
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

  if (!generatedAnswer || generatedAnswer.length > 420 || countLikelyEmoji(generatedAnswer) > 1) {
    return buildDeterministicGreetingAnswer({ snapshot });
  }

  return generatedAnswer;
}

export function buildGreetingFinancialSnapshot({
  currentDate = getCurrentDateString(),
  transactions,
}: {
  currentDate?: string;
  transactions: readonly Transaction[];
}): GreetingFinancialSnapshot {
  const resolvedPeriod = resolveMonthlyReviewPeriod('este mes', { currentDate, transactions });

  if ('clarification' in resolvedPeriod) {
    throw new Error('Unable to resolve current month for greeting workflow.');
  }

  const calculations = calculateMonthlyReviewKpis(transactions, resolvedPeriod.period);
  const enoughData = calculations.kpis.transactionCount >= 3;
  const temporalContext = {
    month: resolvedPeriod.period.month,
    year: resolvedPeriod.period.year,
    label: resolvedPeriod.period.label,
    day: resolvedPeriod.period.comparableDay ?? Number(resolvedPeriod.period.range.to.slice(-2)),
    range: resolvedPeriod.period.range,
  };

  if (!enoughData) {
    return {
      temporalContext,
      enoughData: false,
      currentMonthSpending: calculations.kpis.totalSpending,
      transactionCount: calculations.kpis.transactionCount,
      insights: [],
    };
  }

  const { comparison, source } = compareMonthlyReviewPeriod(
    transactions,
    resolvedPeriod.period,
    resolvedPeriod.previousRange,
    resolvedPeriod.previousPeriodLabel,
  );
  const insights = prioritizeGreetingInsights(
    detectMonthlyReviewInsights({
      allTransactions: transactions,
      period: resolvedPeriod.period,
      comparisonSource: source,
      largestExpenses: calculations.largestExpenses,
    }),
  );

  return {
    temporalContext,
    enoughData: true,
    currentMonthSpending: calculations.kpis.totalSpending,
    transactionCount: calculations.kpis.transactionCount,
    comparison: {
      previousPeriodLabel: comparison.previousPeriodLabel,
      absoluteDifference: comparison.absoluteDifference,
      percentageDifference: comparison.percentageDifference,
      comparisonMode: comparison.comparisonMode,
    },
    insights,
  };
}

export function createGreetingFinancialSnapshotWorkflow({
  answerGenerator = generateGreetingAnswerWithAgent,
  loadTransactions = loadDefaultTransactions,
}: GreetingWorkflowDependencies = {}) {
  const detectTemporalContextStep = createStep({
    id: 'detect-temporal-context',
    description: 'Detect current month context and available transaction data.',
    inputSchema: greetingWorkflowStateSchema,
    outputSchema: greetingWorkflowStateSchema,
    execute: async ({ inputData }) => ({
      ...inputData,
      allTransactions: loadTransactions(),
    }),
  });

  const generateSnapshotStep = createStep({
    id: 'generate-lightweight-snapshot',
    description: 'Generate a lightweight current-month financial snapshot.',
    inputSchema: greetingWorkflowStateSchema,
    outputSchema: greetingWorkflowStateSchema,
    execute: async ({ inputData }) => ({
      ...inputData,
      snapshot: buildGreetingFinancialSnapshot({
        currentDate: inputData.currentDate,
        transactions: inputData.allTransactions ?? [],
      }),
    }),
  });

  const prioritizeInsightsStep = createStep({
    id: 'prioritize-top-insights',
    description: 'Keep at most two actionable or surprising insights.',
    inputSchema: greetingWorkflowStateSchema,
    outputSchema: greetingWorkflowStateSchema,
    execute: async ({ inputData }) => {
      if (!inputData.snapshot) {
        return inputData;
      }

      return {
        ...inputData,
        snapshot: {
          ...inputData.snapshot,
          insights: prioritizeGreetingInsights(inputData.snapshot.insights),
        },
      };
    },
  });

  const generateGreetingStep = createStep({
    id: 'generate-greeting-response',
    description: 'Generate the final greeting response.',
    inputSchema: greetingWorkflowStateSchema,
    outputSchema: greetingWorkflowOutputSchema,
    execute: async ({ inputData }) => {
      if (!inputData.snapshot) {
        throw new Error('Greeting snapshot was not built.');
      }

      const activityLabels: string[] = [...GREETING_WORKFLOW_ACTIVITY_LABELS];

      return {
        answer: await answerGenerator({
          message: inputData.message,
          snapshot: inputData.snapshot,
          modelId: inputData.modelId,
          onActivityLabel: (label) => {
            activityLabels.push(label);
          },
        }),
        snapshot: inputData.snapshot,
        activityLabels,
      };
    },
  });

  return createWorkflow({
    id: 'greetingFinancialSnapshotWorkflow',
    description: 'Create a short financial snapshot for simple opening greetings.',
    inputSchema: greetingWorkflowStateSchema,
    outputSchema: greetingWorkflowOutputSchema,
  })
    .then(detectTemporalContextStep)
    .then(generateSnapshotStep)
    .then(prioritizeInsightsStep)
    .then(generateGreetingStep)
    .commit();
}

export const greetingFinancialSnapshotWorkflow = createGreetingFinancialSnapshotWorkflow();

export async function runGreetingFinancialSnapshotWorkflow(
  input: Pick<GreetingWorkflowInput, 'message' | 'currentDate' | 'modelId'>,
  dependencies?: GreetingWorkflowDependencies,
): Promise<GreetingWorkflowOutput> {
  const workflow = dependencies
    ? createGreetingFinancialSnapshotWorkflow(dependencies)
    : greetingFinancialSnapshotWorkflow;
  const run = await workflow.createRunAsync();
  const result = await run.start({ inputData: greetingWorkflowStateSchema.parse(input) });

  if (result.status === 'failed') {
    throw result.error;
  }

  if (result.status === 'suspended') {
    throw new Error('greetingFinancialSnapshotWorkflow suspended unexpectedly.');
  }

  return result.result;
}

function prioritizeGreetingInsights(insights: MonthlyReviewResult['insights']): GreetingFinancialSnapshot['insights'] {
  return [...insights]
    .sort((a, b) => scoreInsight(b) - scoreInsight(a))
    .slice(0, 2)
    .map((insight) => ({
      title: insight.title,
      detail: insight.detail,
      severity: insight.severity,
      type: insight.type,
    }));
}

function scoreInsight(insight: MonthlyReviewResult['insights'][number]): number {
  const severityScore = { high: 3, medium: 2, low: 1 }[insight.severity];
  const typeScore = {
    category_change: 40,
    spending_pace: 20,
    large_expense: 10,
    recurring_payment: 0,
  }[insight.type];

  return severityScore + typeScore;
}

function buildGreetingDriverSentence(insights: GreetingFinancialSnapshot['insights']): string {
  const titles = insights
    .slice(0, 2)
    .map((insight) => insight.title.trim())
    .filter(Boolean);

  if (titles.length === 0) {
    return '';
  }

  if (titles.length === 1) {
    return `**${titles[0]}**`;
  }

  return `**${titles[0]}** y **${titles[1]}**`;
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(value)}%`;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toLocaleUpperCase('es-AR')}${value.slice(1)}`;
}

function countLikelyEmoji(value: string): number {
  return Array.from(value).filter((character) => /\p{Extended_Pictographic}/u.test(character)).length;
}
