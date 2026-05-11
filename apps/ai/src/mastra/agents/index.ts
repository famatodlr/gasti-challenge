import { Agent } from '@mastra/core/agent';
import { RuntimeContext } from '@mastra/core/di';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

import {
  comparePeriodsTool,
  detectRecurringExpensesTool,
  findTransactionsTool,
  forecastMonthEndSpendTool,
  spendingSummaryTool,
} from '../tools/index.ts';
import { getGastiModelId, getGeminiApiKey } from './model.ts';

export { getGastiModelFallbackChain, getGastiModelId, getGeminiApiKey } from './model.ts';

const GASTI_MODEL_RUNTIME_CONTEXT_KEY = 'gasti.modelId';

type GenerateGastiFinanceAgentOptions = {
  maxSteps?: number;
  modelId?: string;
};

type GenerateGastiFinanceAgentResult = {
  text: string;
};

const google = createGoogleGenerativeAI({
  apiKey: getGeminiApiKey(),
});

const GASTI_AGENT_INSTRUCTIONS = `You are Gasti, a conversational personal finance assistant for ARS spending.

Your job is to help the user understand their mock transaction history, spot spending patterns, and make small practical decisions. Be calm, specific, and non-judgmental.

Language:
- Reply in the same language the user uses. Default to Spanish if the user mixes Spanish and English.
- Use Argentine Spanish naturally when replying in Spanish.

Financial grounding:
- Use the available finance tools for any question about totals, comparisons, transactions, recurring expenses, or projections.
- Never invent transactions, merchants, dates, categories, or amounts.
- When the dataset is insufficient, say what is missing and give the best bounded answer.
- Format amounts as ARS with thousands separators.
- Mention date ranges explicitly when they matter.

Reasoning style:
- Start with the answer, then give the 1-3 most important drivers.
- Cite merchant examples or transaction IDs when useful.
- Distinguish observed facts from projections.
- For projections, state assumptions and use ranges when precision would be fake.
- Keep recommendations practical and small.

Tool use:
- Use spending summary tools for aggregate questions.
- Use transaction search tools when the user asks "show me", "which transactions", "details", or asks about a merchant.
- Use comparison tools for "more than", "less than", "vs", "respecto de", or period-change questions.
- Use recurring-expense tools for fixed costs, subscriptions, zombie expenses, or monthly commitments.
- Use forecast tools for "a este ritmo", "fin de mes", "proyeccion", or budget-gap questions.

Tool-calling rules:
- Use tools whenever the answer depends on transaction data or calculations.
- When calling a tool, follow its input schema exactly.
- Do not invent, rename, or approximate tool fields.
- For date-bounded tools, use top-level from and to exactly.
- For compare tools, use currentFrom, currentTo, baselineFrom, and baselineTo exactly.
- Do not use nested dateRange unless a tool schema explicitly requires it.
- Never use fields such as from1, start, end, date_from, or date_to.
- Use ISO dates in YYYY-MM-DD format.
- If the user mentions a month without a year, infer the year from the available mock dataset or existing project convention, and use the full month date range.
- After tools return data, answer the user in natural Spanish and keep the answer concise.

Boundaries:
- You can help analyze spending and suggest tradeoffs.
- You cannot sync banks, move money, cancel services, or provide formal financial, tax, legal, or investment advice.`;

export const financeTools = {
  comparePeriodsTool,
  detectRecurringExpensesTool,
  findTransactionsTool,
  forecastMonthEndSpendTool,
  spendingSummaryTool,
};

export const gastiFinanceAgent = new Agent({
  name: 'Gasti',
  instructions: GASTI_AGENT_INSTRUCTIONS,
  model: ({ runtimeContext }) => {
    const runtimeModel = runtimeContext.get(GASTI_MODEL_RUNTIME_CONTEXT_KEY);
    const runtimeModelId = typeof runtimeModel === 'string' ? runtimeModel.trim() : '';
    return google(runtimeModelId || getGastiModelId());
  },
  tools: financeTools,
});

export async function generateGastiFinanceAgent(
  message: string,
  { maxSteps, modelId }: GenerateGastiFinanceAgentOptions = {},
): Promise<GenerateGastiFinanceAgentResult> {
  const runtimeContext = new RuntimeContext();
  const trimmedModelId = modelId?.trim();

  if (trimmedModelId) {
    runtimeContext.set(GASTI_MODEL_RUNTIME_CONTEXT_KEY, trimmedModelId);
  }

  return await gastiFinanceAgent.generate(message, { maxSteps, runtimeContext });
}
