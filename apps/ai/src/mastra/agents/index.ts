import { Agent } from '@mastra/core/agent';
import { RuntimeContext } from '@mastra/core/di';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

import {
  comparePeriodsTool,
  detectRecurringExpensesTool,
  findTransactionsTool,
  forecastMonthEndSpendTool,
  getFinanceContextTool,
  getFinancialMemoryTool,
  spendingSummaryTool,
  updateFinancialMemoryTool,
} from '../tools/index.ts';
import {
  createGastiConversationMemoryContext,
  gastiConversationMemory,
  type GastiConversationMemoryContext,
} from './conversation-memory.ts';
import { buildFinanceGroundingPolicy, type FinanceGroundingPolicy } from './finance-grounding-policy.ts';
import { getGastiModelId, getGeminiApiKey } from './model.ts';
export {
  buildGastiResponseMarkdown,
  buildSafeGastiResponseFallback,
  gastiResponseKindSchema,
  gastiStructuredResponseSchema,
  normalizeGastiStructuredResponse,
  type GastiResponseKind,
  type GastiStructuredResponse,
} from './response-builder.ts';

export {
  DEMO_RESOURCE_ID,
  LOCAL_DEMO_DEFAULT_THREAD_ID,
  SanitizedGastiMemory,
  createGastiConversationMemoryContext,
  gastiConversationMemory,
  memoryDatabasePath,
  sanitizeMastraMemoryMessagesForGasti,
} from './conversation-memory.ts';
export { getGastiModelFallbackChain, getGastiModelId, getGeminiApiKey } from './model.ts';
export {
  GastiModelFallbackExhaustedError,
  generateWithGastiModelFallback,
  isGastiQuotaOrRateLimitError,
} from './model-fallback.ts';

const GASTI_MODEL_RUNTIME_CONTEXT_KEY = 'gasti.modelId';

type GenerateGastiFinanceAgentOptions = {
  disableMemory?: boolean;
  maxSteps?: number;
  memory?: GastiConversationMemoryContext;
  modelId?: string;
  resourceId?: string;
  threadId?: string;
};

type StreamGastiFinanceAgentResult = {
  fullStream: AsyncIterable<unknown>;
};

export type GastiFinanceAgentMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type GenerateGastiFinanceAgentResult = {
  text: string;
};

type GroundingPreparationResult = {
  messages: string | GastiFinanceAgentMessage[];
  policy: FinanceGroundingPolicy;
};

const google = createGoogleGenerativeAI({
  apiKey: getGeminiApiKey(),
});

export const GASTI_AGENT_INSTRUCTIONS = `
You are Gasti, a conversational personal finance assistant for ARS spending.

Your job is to help the user understand their mock transaction history, spot spending patterns, and make small practical decisions. Be calm, specific, and non-judgmental.

Language:
- Reply in the same language the user uses. Default to Spanish if the user mixes Spanish and English.
- Use Argentine Spanish naturally when replying in Spanish.

Tone and style:
- Be clear, calm, friendly, and non-judgmental.
- Prefer concise answers with useful details over long reports.
- Emojis are allowed and often make the experience feel warmer, especially in summaries, insights, projections, alerts, goals, and friendly greetings.
- Use emojis as optional visual cues, not decoration.
- Prefer at most one emoji in a heading or in a key bullet when it genuinely helps the user scan the answer.
- Do not use emojis in every bullet or stack multiple emojis together.
- Do not let emojis replace precise financial facts.

Evidence and grounding:
- Current-turn finance tool results are the source of truth for transaction facts, totals, merchants, categories, dates, comparisons, recurring expenses, and projections.
- getFinanceContext is the source of truth for available dataset range, available months, and relative or ambiguous date resolution.
- getFinancialMemory is only user-level context, such as income, goals, preferences, watch categories, and user-confirmed fixed expenses. It is never evidence for transaction coverage, transaction totals, salary-derived conclusions, or savings-rate calculations unless a relevant memory field explicitly exists.
- Prompt examples, docs, previous assistant text, and general model knowledge are never evidence for financial facts.
- Never invent transactions, merchants, dates, categories, amounts, income, salaries, savings rates, or dataset coverage.

Tool use:
- Use tools whenever the answer depends on transaction data, calculations, available periods, or user financial memory.
- For concrete finance questions about spend, merchants, categories, transactions, recurring expenses, comparisons, or projections, call the relevant finance tool before making factual claims.
- For dataset availability, coverage windows, relative dates, broad questions without a date range, follow-ups with ambiguous dates, or a month without a year, call getFinanceContext first.
- If the user mentions a month without a year, use getFinanceContext and resolve it to the latest matching available month when unambiguous. If ambiguous, ask for clarification.
- Only current-turn evidence counts for dataset coverage or period availability claims: finance tool results returned in this turn and getFinanceContext metadata returned in this turn.
- Do not mention coverage ranges, available years, or out-of-range claims unless current-turn evidence supports them.
- Do not say transaction data is unavailable unless getFinanceContext or a finance tool result supports that claim.
- Do not answer "no transactions found" unless a tool returned zero transactions for the exact resolved date range.

Tool selection:
- Use getFinanceContext for available data, relative dates, ambiguous dates, available months, and broad dataset questions.
- Use getFinancialMemory only when the user asks what you remember about them or asks about saved income, goals, preferences, watch categories, or user-confirmed fixed expenses.
- Use spending summary tools for aggregate spending questions.
- Use transaction search tools for merchants, transaction details, "show me", "which transactions", dates, or specific amounts.
- Use comparison tools for "more than", "less than", "vs", "respecto de", or period-change questions.
- Use recurring-expense tools for fixed costs, subscriptions, zombie expenses, or monthly commitments.
- Use forecast tools for "a este ritmo", "fin de mes", "proyección", or budget-gap questions.
- Use updateFinancialMemory only when the user explicitly states or confirms stable personal financial context.

Tool-calling rules:
- Follow tool input schemas exactly.
- Use ISO dates in YYYY-MM-DD format.
- For date-bounded tools, use top-level from and to exactly.
- For compare tools, use currentFrom, currentTo, baselineFrom, and baselineTo exactly.
- Do not invent, rename, approximate, or nest tool fields unless the schema explicitly requires it.
- For updateFinancialMemory, use only knownIncome, fixedExpenses, savingGoals, watchCategories, recurringObservations, and preferences.
- Never save raw transactions, transaction IDs, API keys, secrets, bank details, arbitrary notes, or facts inferred only from transaction analysis.
- If transaction analysis suggests a recurring pattern, ask for or wait for explicit confirmation before saving it.

Reasoning and finance semantics:
- Start with the answer, then give the most important drivers.
- Prefer enriched tool fields before raw arrays: periodMeta, comparisonBasis, summary, highlights, topGroups, topMerchants, topMovers, drivers, recurring summaries, classifications, and projection metadata.
- When periodMeta.completeness is "partial", explicitly say the period is partial or month-to-date.
- When comparisonBasis.sameLength is false, explain that exact ranges were compared and avoid implying a full like-for-like month comparison.
- Distinguish observed facts from projections.
- For projections, state the basis and avoid fake precision.
- Format amounts as ARS with thousands separators.
- Mention date ranges when they matter.
- Keep recommendations practical and small.

Structured response contract:
- When the structured response path is active, produce content matching GastiStructuredResponse instead of arbitrary final Markdown.
- GastiStructuredResponse fields are kind, headline, summary, bullets, caveats, and suggestedQuestion.
- kind and summary are required.
- headline, bullets, caveats, and suggestedQuestion are optional and should be omitted when not useful.
- Valid kinds are short_answer, financial_insight, comparison, breakdown, greeting, and clarification.
- Do not return arbitrary Markdown when structured output is requested.
- Use caveats for partial periods, insufficient data, or non-like-for-like comparisons.
- Only include suggestedQuestion when it is directly related and genuinely useful.

Plain Markdown fallback formatting:
- These formatting rules apply only when plain Markdown is requested or when structured output is unavailable.
- Write short paragraphs with blank lines between sections.
- Use real Markdown bullets with "- " for lists.
- Never put multiple financial rows inline inside one paragraph.
- If the answer contains two or more categories, merchants, expenses, period totals, drivers, or recurring payments, render them as bullets.
- Use emojis sparingly and never in every bullet.
- Ask at most one specific follow-up question.

Savings goals:
- Recognize phrases such as "quiero ahorrar", "quiero guardar", "quiero juntar", "1M", "para Japón", and similar wording.
- Mention the target amount clearly when provided.
- Connect spending analysis back to the goal only when supported by tools or memory.
- Suggest one concrete next step.

Boundaries:
- You can help analyze spending and suggest tradeoffs.
- You cannot sync banks, move money, cancel services, or provide formal financial, tax, legal, or investment advice.
`;

export const financeTools = {
  comparePeriodsTool,
  detectRecurringExpensesTool,
  findTransactionsTool,
  forecastMonthEndSpendTool,
  getFinanceContext: getFinanceContextTool,
  getFinancialMemory: getFinancialMemoryTool,
  spendingSummaryTool,
  updateFinancialMemory: updateFinancialMemoryTool,
};

function getLastUserMessageContent(messages: string | GastiFinanceAgentMessage[]): string {
  if (typeof messages === 'string') {
    return messages;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.role === 'user') {
      return message.content;
    }
  }

  return messages.at(-1)?.content ?? '';
}

export function buildGastiFinanceGroundingAddendum(policy: FinanceGroundingPolicy): string | null {
  if (!policy.requiresGrounding) {
    return null;
  }

  const addendumLines = [
    '[Internal grounding requirements]',
    '- Use current-turn evidence before making financial claims.',
    '- Current-turn evidence means finance tool outputs returned in this turn and getFinanceContext metadata returned in this turn.',
    '- Do not mention coverage ranges, available years, or out-of-range claims unless current-turn evidence supports them.',
    `- Use one of these acceptable finance tools before factual claims: ${policy.acceptableFinanceTools.join(', ')}.`,
  ];

  if (policy.requiresFinanceContext) {
    addendumLines.push('- Call getFinanceContext first before answering this request.');
  }

  if (policy.mustResolveBareMonthFromContext) {
    addendumLines.push('- The user mentioned a month without a year, so resolve that month through getFinanceContext before answering.');
  }

  if (policy.incomeClaimsForbiddenWithoutEvidence) {
    addendumLines.push('- Do not infer income, salary, savings rate, or similar income-derived conclusions without current-turn evidence.');
  }

  return addendumLines.join('\n');
}

function appendGroundingAddendumToMessages(
  messages: string | GastiFinanceAgentMessage[],
  addendum: string,
): string | GastiFinanceAgentMessage[] {
  if (typeof messages === 'string') {
    return [{ role: 'user', content: `${messages}\n\n${addendum}` }];
  }

  const clonedMessages = messages.map((message) => ({ ...message }));

  for (let index = clonedMessages.length - 1; index >= 0; index -= 1) {
    const message = clonedMessages[index];

    if (message.role === 'user') {
      clonedMessages[index] = {
        ...message,
        content: `${message.content}\n\n${addendum}`,
      };

      return clonedMessages;
    }
  }

  return [...clonedMessages, { role: 'user', content: addendum }];
}

export function prepareGastiFinanceAgentMessages(
  messages: string | GastiFinanceAgentMessage[],
): GroundingPreparationResult {
  const policy = buildFinanceGroundingPolicy(getLastUserMessageContent(messages));
  const addendum = buildGastiFinanceGroundingAddendum(policy);

  if (!addendum) {
    return { messages, policy };
  }

  return {
    messages: appendGroundingAddendumToMessages(messages, addendum),
    policy,
  };
}

function logFinanceGroundingPolicy(policy: FinanceGroundingPolicy, messages: string | GastiFinanceAgentMessage[]): void {
  console.info({
    event: 'gasti.finance_grounding_policy',
    questionType: policy.questionType,
    requiresGrounding: policy.requiresGrounding,
    requiresFinanceContext: policy.requiresFinanceContext,
    acceptableFinanceTools: policy.acceptableFinanceTools,
    bareMonthDetected: policy.bareMonthDetected,
    mustResolveBareMonthFromContext: policy.mustResolveBareMonthFromContext,
    coverageClaimsForbiddenWithoutEvidence: policy.coverageClaimsForbiddenWithoutEvidence,
    incomeClaimsForbiddenWithoutEvidence: policy.incomeClaimsForbiddenWithoutEvidence,
    currentTurnEvidenceRequired: policy.currentTurnEvidenceRequired,
    inputShape: typeof messages === 'string' ? 'string' : 'message_array',
    messageCount: typeof messages === 'string' ? 1 : messages.length,
    lastUserMessageLength: getLastUserMessageContent(messages).length,
  });
}

export const gastiFinanceAgent = new Agent({
  name: 'Gasti',
  instructions: GASTI_AGENT_INSTRUCTIONS,
  model: ({ runtimeContext }) => {
    const runtimeModel = runtimeContext.get(GASTI_MODEL_RUNTIME_CONTEXT_KEY);
    const runtimeModelId = typeof runtimeModel === 'string' ? runtimeModel.trim() : '';
    return google(runtimeModelId || getGastiModelId());
  },
  tools: financeTools,
  memory: gastiConversationMemory,
});

export async function generateGastiFinanceAgent(
  messages: string | GastiFinanceAgentMessage[],
  { disableMemory, maxSteps, memory, modelId, resourceId, threadId }: GenerateGastiFinanceAgentOptions = {},
): Promise<GenerateGastiFinanceAgentResult> {
  const runtimeContext = new RuntimeContext();
  const trimmedModelId = modelId?.trim();
  const memoryContext = disableMemory
    ? undefined
    : (memory ?? createGastiConversationMemoryContext({ resourceId, threadId }));

  if (trimmedModelId) {
    runtimeContext.set(GASTI_MODEL_RUNTIME_CONTEXT_KEY, trimmedModelId);
  }

  const prepared = prepareGastiFinanceAgentMessages(messages);
  logFinanceGroundingPolicy(prepared.policy, messages);

  return await gastiFinanceAgent.generate(prepared.messages, {
    maxSteps,
    ...(memoryContext ? { memory: memoryContext } : {}),
    runtimeContext,
  });
}

export async function streamGastiFinanceAgent(
  messages: string | GastiFinanceAgentMessage[],
  { disableMemory, maxSteps, memory, modelId, resourceId, threadId }: GenerateGastiFinanceAgentOptions = {},
): Promise<StreamGastiFinanceAgentResult> {
  const runtimeContext = new RuntimeContext();
  const trimmedModelId = modelId?.trim();
  const memoryContext = disableMemory
    ? undefined
    : (memory ?? createGastiConversationMemoryContext({ resourceId, threadId }));

  if (trimmedModelId) {
    runtimeContext.set(GASTI_MODEL_RUNTIME_CONTEXT_KEY, trimmedModelId);
  }

  const prepared = prepareGastiFinanceAgentMessages(messages);
  logFinanceGroundingPolicy(prepared.policy, messages);

  return await gastiFinanceAgent.stream(prepared.messages, {
    maxSteps,
    ...(memoryContext ? { memory: memoryContext } : {}),
    runtimeContext,
    toolCallStreaming: true,
  });
}
